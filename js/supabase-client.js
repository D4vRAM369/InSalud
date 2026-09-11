// =====================================================
// InSalud — Conexión a Supabase
// Configuración del cliente backend
// =====================================================

// IMPORTANTE: Estas credenciales son PÚBLICAS (anon key).
// La seguridad real viene de las políticas RLS en Supabase.
// Nunca pongas la service_role key aquí.

const SUPABASE_URL = 'https://ehdgjsjmbyfxedazxtky.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZGdqc2ptYnlmeGVkYXp4dGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNzI2MzIsImV4cCI6MjEwNDY0ODYzMn0.iv4fN6Yx-16QSKBChdbiFSVNtO1xej92PA4TXbcoaUA';

// Si el CDN falla, el formulario debe poder explicar el error en vez de romperse.
const supabaseClient = typeof supabase !== 'undefined'
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        // Un límite evita dejar «Entrando…» indefinidamente cuando no hay red.
        fetch: (url, options = {}) => fetch(url, {
          ...options,
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000)
        })
      }
    })
  : null;
