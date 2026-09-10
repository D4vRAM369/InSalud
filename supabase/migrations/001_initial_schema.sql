-- InSalud - Esquema de Base de Datos
-- Ejecutar en Supabase SQL Editor

-- =====================================================
-- TABLA: complaints (Reclamaciones)
-- =====================================================
CREATE TABLE complaints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  center TEXT NOT NULL,
  category TEXT NOT NULL,
  incident_date DATE NOT NULL,
  description TEXT NOT NULL,
  email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  source TEXT DEFAULT 'web' CHECK (source IN ('web', 'telegram')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLA: attachments (Archivos adjuntos)
-- =====================================================
CREATE TABLE attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLA: profiles (Perfiles de usuario)
-- =====================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- FUNCIONES TRIGGER
-- =====================================================

-- Auto-actualizar updated_at cuando cambia una reclamación
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-crear perfil cuando se registra un usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA complaints:

-- Cualquiera puede LEER reclamaciones publicadas
CREATE POLICY "Public can read published complaints"
ON complaints FOR SELECT
TO anon, authenticated
USING (status = 'published');

-- Sistema puede INSERTAR (formulario web y bot)
CREATE POLICY "Anyone can submit complaints"
ON complaints FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Solo admin puede ACTUALIZAR
CREATE POLICY "Admins can update complaints"
ON complaints FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Solo admin puede BORRAR
CREATE POLICY "Admins can delete complaints"
ON complaints FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- POLÍTICAS PARA attachments:

-- Cualquiera puede LEER adjuntos
CREATE POLICY "Public can read attachments"
ON attachments FOR SELECT
TO anon, authenticated
USING (true);

-- Sistema puede INSERTAR adjuntos
CREATE POLICY "Anyone can insert attachments"
ON attachments FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- POLÍTICAS PARA profiles:

-- Los usuarios pueden VER su propio perfil
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Admin puede VER todos los perfiles
CREATE POLICY "Admins can read all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- =====================================================
-- STORAGE BUCKET
-- =====================================================

-- Crear bucket para adjuntos (ejecutar en Supabase Dashboard > Storage)
-- Nombre: complaint-attachments
-- Acceso: Público

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('complaint-attachments', 'complaint-attachments', true);

-- Política de storage: cualquiera puede subir
-- CREATE POLICY "Anyone can upload attachments"
-- ON storage.objects FOR INSERT
-- TO anon, authenticated
-- WITH CHECK (bucket_id = 'complaint-attachments');

-- Política de storage: cualquiera puede leer
-- CREATE POLICY "Public can read attachments"
-- ON storage.objects FOR SELECT
-- TO anon, authenticated
-- USING (bucket_id = 'complaint-attachments');
