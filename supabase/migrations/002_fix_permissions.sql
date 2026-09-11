-- InSalud - CORRECCIÓN DE PERMISOS
-- Ejecutar en Supabase SQL Editor DESPUÉS del schema inicial

-- =====================================================
-- GRANT: Conceder permisos al rol ANON
-- =====================================================

-- Permisos en complaints
GRANT SELECT, INSERT ON complaints TO anon;
GRANT SELECT, INSERT ON complaints TO authenticated;

-- Permisos en attachments
GRANT SELECT, INSERT ON attachments TO anon;
GRANT SELECT, INSERT ON attachments TO authenticated;

-- Permisos en profiles (solo lectura para anon)
GRANT SELECT ON profiles TO authenticated;

-- Permisos en sequences (para auto-generar UUIDs)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- STORAGE POLICIES: Permitir uploads anónimos
-- =====================================================

-- Política para que cualquiera pueda subir archivos
CREATE POLICY "Anyone can upload attachments"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'complaint-attachments');

-- Política para que cualquiera pueda leer archivos
CREATE POLICY "Public can read attachments"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'complaint-attachments');

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Para verificar que los permisos están correctos, ejecuta:
-- SELECT grantee, privilege_type, table_name 
-- FROM information_schema.role_table_grants 
-- WHERE table_schema = 'public' 
-- AND grantee IN ('anon', 'authenticated')
-- ORDER BY table_name, grantee;
