-- Solo base LOCAL desechable con 001–003 aplicadas: psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/backend-security.sql
-- Todo se revierte. No ejecutar en producción: creamos usuarios/objetos de prueba.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'admin@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'reader@example.invalid');
UPDATE public.profiles SET role = 'admin' WHERE id = '11111111-1111-4111-8111-111111111111';
INSERT INTO public.complaints (id,center,category,incident_date,description,email,status) VALUES
  ('33333333-3333-4333-8333-333333333333','Centro','Otro',CURRENT_DATE,'Reclamación pública de prueba','private@example.invalid','published');
-- Solo fixture local: Storage real crea estas filas mediante su API, nunca SQL manual.
INSERT INTO storage.objects (bucket_id,name,metadata) VALUES
  ('complaint-attachments','complaints/44444444-4444-4444-8444-444444444444/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
   '{"size":200,"mimetype":"application/pdf"}');

SET LOCAL ROLE anon;
DO $$
DECLARE payload jsonb := jsonb_build_object('id','44444444-4444-4444-8444-444444444444',
  'center','Centro','category','Otro','incident_date',CURRENT_DATE::text,'description','Experiencia que requiere una revisión.',
  'email','person@example.invalid');
  files jsonb := '[{"file_url":"complaints/44444444-4444-4444-8444-444444444444/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf","file_size":1}]';
BEGIN
  BEGIN
    PERFORM * FROM public.complaints;
    RAISE EXCEPTION 'FAIL: anon puede leer emails';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.complaints(center,category,incident_date,description,status)
      VALUES ('x','x',CURRENT_DATE,'Publicación sin revisión','published');
    RAISE EXCEPTION 'FAIL: anon puede insertar directamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM public.public_complaints WHERE id = '33333333-3333-4333-8333-333333333333') THEN
    RAISE EXCEPTION 'FAIL: falta reclamación publicada';
  END IF;
  BEGIN
    EXECUTE 'SELECT email FROM public.public_complaints';
    RAISE EXCEPTION 'FAIL: vista expone email';
  EXCEPTION WHEN undefined_column THEN NULL; END;
  PERFORM public.submit_complaint(payload, files);
  PERFORM public.submit_complaint(payload, files); -- respuesta perdida: mismo resultado
  BEGIN
    PERFORM public.submit_complaint(payload || '{"description":"Otro contenido que no es el enviado."}', files);
    RAISE EXCEPTION 'FAIL: UUID reutilizado permite cambiar datos';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF public.can_upload_complaint_attachment('complaints/44444444-4444-4444-8444-444444444444/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf') THEN
    RAISE EXCEPTION 'FAIL: permite añadir adjuntos después del envío';
  END IF;
  BEGIN
    PERFORM public.submit_complaint(payload || '{"id":"55555555-5555-4555-8555-555555555555"}', files);
    RAISE EXCEPTION 'FAIL: permite asociar documentos ajenos';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.complaints WHERE id = '55555555-5555-4555-8555-555555555555') THEN
    RAISE EXCEPTION 'FAIL: fallo adjunto dejó reclamación parcial';
  END IF;
  IF (SELECT file_size FROM public.attachments WHERE complaint_id = '44444444-4444-4444-8444-444444444444') <> 200 THEN
    RAISE EXCEPTION 'FAIL: se confía en tamaño enviado por cliente';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.complaints) THEN RAISE EXCEPTION 'FAIL: noadmin lee tabla privada'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'FAIL: perfil propio no accesible'; END IF;
  BEGIN
    UPDATE public.profiles SET role = 'admin';
    RAISE EXCEPTION 'FAIL: escalada de privilegios';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = '44444444-4444-4444-8444-444444444444' AND status = 'pending') THEN
    RAISE EXCEPTION 'FAIL: admin no ve pendientes';
  END IF;
  UPDATE public.complaints SET status = 'published' WHERE id = '44444444-4444-4444-8444-444444444444';
  DELETE FROM public.complaints WHERE id = '44444444-4444-4444-8444-444444444444';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.attachments WHERE complaint_id = '44444444-4444-4444-8444-444444444444') THEN
    RAISE EXCEPTION 'FAIL: borrado no elimina metadata adjunta';
  END IF;
END $$;
ROLLBACK;
