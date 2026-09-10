// =====================================================
// InSalud — Conexión a Supabase
// Configuración del cliente backend
// =====================================================

// IMPORTANTE: Estas credenciales son PÚBLICAS (anon key).
// La seguridad real viene de las políticas RLS en Supabase.
// Nunca pongas la service_role key aquí.

const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU-ANON-KEY-AQUI';

// Inicializar cliente de Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
