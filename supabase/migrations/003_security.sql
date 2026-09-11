-- InSalud: aplicar después de 001 y 002. No modifica usuarios ni contraseñas.
BEGIN;

-- Las políticas permisivas se combinan con OR: una antigua regla abierta anularía
-- las nuevas. Reemplazamos solo las políticas de las tres tablas de esta app.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'complaints', 'attachments')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles, public.complaints, public.attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles, public.complaints, public.attachments TO authenticated;
GRANT UPDATE, DELETE ON public.complaints TO authenticated;
-- El servicio del bot conserva su acceso; esta clave nunca debe llegar al navegador.
GRANT ALL ON public.complaints, public.attachments TO service_role;

-- Consultar el perfil propio basta para comprobar role, sin recursión sobre profiles.
CREATE POLICY profiles_own_read ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY complaints_admin_read ON public.complaints FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
CREATE POLICY complaints_admin_update ON public.complaints FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
CREATE POLICY complaints_admin_delete ON public.complaints FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
CREATE POLICY attachments_admin_read ON public.attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));

-- Vista deliberadamente ejecutada como propietario: el público no puede leer la
-- tabla privada. La lista explícita excluye email y futuros campos confidenciales.
CREATE OR REPLACE VIEW public.public_complaints WITH (security_barrier = true) AS
  SELECT id, center, category, incident_date, description, status, source, created_at, updated_at
  FROM public.complaints WHERE status = 'published';
REVOKE ALL ON public.public_complaints FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_complaints TO anon, authenticated;

-- Un update_id único convierte los reintentos de Telegram en la misma reclamación.
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS telegram_update_id bigint;
CREATE UNIQUE INDEX IF NOT EXISTS complaints_telegram_update_id_key
  ON public.complaints (telegram_update_id) WHERE telegram_update_id IS NOT NULL;

-- El navegador se puede manipular: los límites también se aplican en Storage.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('complaint-attachments', 'complaint-attachments', false, 5242880,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "Anyone can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can read attachments" ON storage.objects;
DROP POLICY IF EXISTS insalud_upload ON storage.objects;
DROP POLICY IF EXISTS insalud_admin_read ON storage.objects;
DROP POLICY IF EXISTS insalud_admin_delete ON storage.objects;

-- Solo se admiten rutas nuevas: después de enviar una reclamación ya no se pueden
-- añadir documentos ajenos a su carpeta. El UUID aleatorio evita nombres adivinables.
CREATE OR REPLACE FUNCTION public.can_upload_complaint_attachment(object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT object_name ~ '^complaints/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'
    AND NOT EXISTS (SELECT 1 FROM public.complaints WHERE id::text = split_part(object_name, '/', 2));
$$;
REVOKE ALL ON FUNCTION public.can_upload_complaint_attachment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_complaint_attachment(text) TO anon, authenticated;
CREATE POLICY insalud_upload ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'complaint-attachments' AND public.can_upload_complaint_attachment(name));
CREATE POLICY insalud_admin_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'complaint-attachments' AND EXISTS
    (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
CREATE POLICY insalud_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'complaint-attachments' AND EXISTS
    (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));

-- Una única transacción crea reclamación y adjuntos. Nunca acepta el id de una
-- reclamación existente ni un status elegido por el visitante: evita la suplantación.
CREATE OR REPLACE FUNCTION public.submit_complaint(p_complaint jsonb, p_attachments jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  complaint_id uuid;
  inserted_id uuid;
  item jsonb;
  actual_size bigint;
  actual_type text;
  total_size bigint := 0;
  incident date;
  file_path text;
  allowed_types text[] := ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
BEGIN
  IF jsonb_typeof(p_complaint) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Formato de reclamación incorrecto' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_complaint->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR length(btrim(coalesce(p_complaint->>'center', ''))) NOT BETWEEN 1 AND 200
    OR length(btrim(coalesce(p_complaint->>'category', ''))) NOT BETWEEN 1 AND 100
    OR length(btrim(coalesce(p_complaint->>'description', ''))) NOT BETWEEN 20 AND 2000
    OR length(coalesce(p_complaint->>'email', '')) > 254
    OR (nullif(btrim(p_complaint->>'email'), '') IS NOT NULL
        AND btrim(p_complaint->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    OR coalesce(p_complaint->>'incident_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
    OR jsonb_array_length(p_attachments) > 3 THEN
    RAISE EXCEPTION 'Revisa los campos y el máximo de tres adjuntos' USING ERRCODE = '22023';
  END IF;
  complaint_id := (p_complaint->>'id')::uuid;
  incident := (p_complaint->>'incident_date')::date;
  IF incident > CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha no puede ser futura' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_attachments)) <>
     (SELECT count(DISTINCT value->>'file_url') FROM jsonb_array_elements(p_attachments)) THEN
    RAISE EXCEPTION 'Adjuntos duplicados o sin ruta' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.complaints (id, center, category, incident_date, description, email, status, source)
  VALUES (complaint_id, btrim(p_complaint->>'center'), btrim(p_complaint->>'category'), incident,
    btrim(p_complaint->>'description'), nullif(btrim(p_complaint->>'email'), ''), 'pending', 'web')
  ON CONFLICT (id) DO NOTHING RETURNING id INTO inserted_id;

  -- Si la respuesta se perdió, repetir exactamente el envío devuelve su referencia.
  -- Una carga distinta con ese UUID nunca modifica ni revela la reclamación previa.
  IF inserted_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id
      AND c.center = btrim(p_complaint->>'center') AND c.category = btrim(p_complaint->>'category')
      AND c.incident_date = incident AND c.description = btrim(p_complaint->>'description')
      AND c.email IS NOT DISTINCT FROM nullif(btrim(p_complaint->>'email'), '') AND c.source = 'web')
      AND (SELECT count(*) FROM public.attachments a WHERE a.complaint_id = submit_complaint.complaint_id)
        = jsonb_array_length(p_attachments)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_attachments) x WHERE NOT EXISTS
        (SELECT 1 FROM public.attachments a WHERE a.complaint_id = submit_complaint.complaint_id
          AND a.file_url = x.value->>'file_url')) THEN
      RETURN complaint_id;
    END IF;
    RAISE EXCEPTION 'Referencia ya utilizada por otro envío' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    file_path := item->>'file_url';
    IF file_path IS NULL OR split_part(file_path, '/', 1) <> 'complaints'
      OR split_part(file_path, '/', 2) <> complaint_id::text
      OR array_length(string_to_array(file_path, '/'), 1) <> 3 THEN
      RAISE EXCEPTION 'El adjunto no pertenece a esta reclamación' USING ERRCODE = '22023';
    END IF;
    -- Se contrasta el tamaño real registrado por Storage, no el dato del navegador.
    SELECT (metadata->>'size')::bigint, metadata->>'mimetype'
      INTO actual_size, actual_type FROM storage.objects
      WHERE bucket_id = 'complaint-attachments' AND name = file_path;
    IF NOT FOUND OR actual_size IS NULL OR actual_size NOT BETWEEN 1 AND 5242880
      OR actual_type IS NULL OR NOT (actual_type = ANY(allowed_types)) THEN
      RAISE EXCEPTION 'Archivo inexistente, vacío, demasiado grande o no permitido' USING ERRCODE = '22023';
    END IF;
    total_size := total_size + actual_size;
    IF total_size > 10485760 THEN
      RAISE EXCEPTION 'Los adjuntos superan 10 MiB en total' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.attachments (complaint_id, file_url, file_type, file_size)
      VALUES (complaint_id, file_path, actual_type, actual_size);
  END LOOP;
  RETURN complaint_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_complaint(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_complaint(jsonb, jsonb) TO anon, authenticated;

-- search_path fijo impide que un objeto malicioso cambie el destino del trigger.
ALTER FUNCTION public.handle_new_user() SET search_path = '';
NOTIFY pgrst, 'reload schema';
COMMIT;
