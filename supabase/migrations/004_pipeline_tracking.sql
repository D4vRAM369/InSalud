-- InSalud: Incremento 2 — Pipeline de Defensa y Seguimiento de Plazos (Decreto 8/2025)
-- Aplicar después de 003_security.sql. Mantiene compatibilidad con envíos existentes.
BEGIN;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS requested_measures TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS prior_complaint_status TEXT NOT NULL DEFAULT 'none'
    CHECK (prior_complaint_status IN ('none', 'empty_response', 'no_response_2m')),
  ADD COLUMN IF NOT EXISTS has_physical_harm BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS routed_procedure TEXT NOT NULL DEFAULT 'scs_3831'
    CHECK (routed_procedure IN ('scs_3831', 'oddus_3832', 'scs_1817')),
  ADD COLUMN IF NOT EXISTS official_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution_outcome IN ('pending', 'resolved', 'empty_response', 'silence_2m', 'escalated_oddus')),
  ADD COLUMN IF NOT EXISTS reminder_60d_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS complaints_deadline_reminder_idx
  ON public.complaints (created_at)
  WHERE email IS NOT NULL AND reminder_60d_sent_at IS NULL AND resolution_outcome = 'pending';

-- Mantiene la barrera de seguridad: nunca expone email ni reminder_60d_sent_at.
-- DROP + CREATE evita el error 42P16 de PostgreSQL al añadir o reordenar columnas respecto a versiones previas de la vista.
DROP VIEW IF EXISTS public.public_complaints;
CREATE VIEW public.public_complaints WITH (security_barrier = true) AS
  SELECT
    id,
    center,
    category,
    incident_date,
    description,
    status,
    source,
    requested_measures,
    prior_complaint_status,
    has_physical_harm,
    routed_procedure,
    resolution_outcome,
    created_at,
    updated_at
  FROM public.complaints
  WHERE status = 'published';

REVOKE ALL ON public.public_complaints FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_complaints TO anon, authenticated;

-- Actualiza submit_complaint manteniendo compatibilidad con clientes que no envíen los nuevos campos.
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
  measures_arr text[];
  prior_status text;
  physical_harm boolean;
  routed_proc text;
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

  prior_status := coalesce(nullif(btrim(p_complaint->>'prior_complaint_status'), ''), 'none');
  IF prior_status NOT IN ('none', 'empty_response', 'no_response_2m') THEN
    RAISE EXCEPTION 'Estado previo no válido' USING ERRCODE = '22023';
  END IF;

  physical_harm := coalesce((p_complaint->>'has_physical_harm')::boolean, false);
  routed_proc := coalesce(nullif(btrim(p_complaint->>'routed_procedure'), ''), 'scs_3831');
  IF routed_proc NOT IN ('scs_3831', 'oddus_3832', 'scs_1817') THEN
    RAISE EXCEPTION 'Procedimiento de destino no válido' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_complaint->'requested_measures') = 'array' THEN
    SELECT coalesce(array_agg(btrim(elem)), '{}'::text[]) INTO measures_arr
    FROM jsonb_array_elements_text(p_complaint->'requested_measures') AS elem
    WHERE length(btrim(elem)) BETWEEN 1 AND 300;
    IF array_length(measures_arr, 1) > 10 THEN
      RAISE EXCEPTION 'Máximo diez medidas solicitadas' USING ERRCODE = '22023';
    END IF;
  ELSE
    measures_arr := '{}'::text[];
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

  INSERT INTO public.complaints (
    id, center, category, incident_date, description, email, status, source,
    requested_measures, prior_complaint_status, has_physical_harm, routed_procedure, official_deadline_at
  )
  VALUES (
    complaint_id, btrim(p_complaint->>'center'), btrim(p_complaint->>'category'), incident,
    btrim(p_complaint->>'description'), nullif(btrim(p_complaint->>'email'), ''), 'pending', 'web',
    measures_arr, prior_status, physical_harm, routed_proc, NOW() + INTERVAL '60 days'
  )
  ON CONFLICT (id) DO NOTHING RETURNING id INTO inserted_id;

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
    SELECT coalesce((o.metadata->>'size')::bigint, 0), lower(coalesce(o.metadata->>'mimetype', ''))
    INTO actual_size, actual_type FROM storage.objects o
    WHERE o.bucket_id = 'complaint-attachments' AND o.name = file_path;
    IF NOT FOUND OR actual_size <= 0 OR actual_size > 5242880 OR NOT (actual_type = ANY(allowed_types)) THEN
      RAISE EXCEPTION 'Archivo ausente o no permitido' USING ERRCODE = '22023';
    END IF;
    total_size := total_size + actual_size;
    IF total_size > 10485760 THEN
      RAISE EXCEPTION 'Los adjuntos superan el límite total' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.attachments (complaint_id, file_url, file_type, file_size)
    VALUES (complaint_id, file_path, actual_type, actual_size::integer);
  END LOOP;
  RETURN complaint_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_complaint(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_complaint(jsonb, jsonb) TO anon, authenticated;

COMMIT;
