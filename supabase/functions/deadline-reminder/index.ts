// =====================================================
// InSalud — Edge Function: Recordatorio de Plazo (60 días)
// Normativa: Decreto 8/2025 (BOC n.º 43) — Escalamiento a ODDUS (3832)
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ODDUS_DISCONFORMIDAD_URL = 'https://sede.gobiernodecanarias.org/sede/tramites/6465';
const DIPUTADO_COMUN_URL = 'https://www.diputadodelcomun.com';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function buildReminderEmail(complaint: {
  id: string;
  center: string;
  category: string;
  incident_date: string;
}) {
  return {
    subject: `[InSalud] Se cumplen 2 meses de tu reclamación (${complaint.center}) — Siguiente paso ODDUS`,
    text: `Hola,

Hace 60 días (2 meses) registraste en InSalud una incidencia sobre "${complaint.center}" (${complaint.category}, fecha ${complaint.incident_date}).

Según el Decreto 8/2025 del Gobierno de Canarias, la administración dispone de un plazo máximo de 2 meses para responder por escrito a una reclamación sanitaria oficial.

¿Qué hacer ahora?
1. Si NO te han respondido en estos 2 meses, o te han dado una respuesta genérica tipo "gracias y lo sentimos mucho":
   Presenta un Escrito de Disconformidad ante la ODDUS en el plazo de 1 mes (Trámite 6465):
   ${ODDUS_DISCONFORMIDAD_URL}

2. Si persiste el silencio o la inacción administrativa, puedes elevar queja al Diputado del Común:
   ${DIPUTADO_COMUN_URL}

Contacto ODDUS Gran Canaria: Av. Juan XXIII, 17 (35004 Las Palmas de GC) · Tel: 928 11 88 51 / 928 11 88 70.

Atentamente,
InSalud — Plataforma ciudadana de transparencia sanitaria`
  };
}

export async function handleDeadlineReminder(req: Request, deps?: {
  supabase?: ReturnType<typeof createClient>;
  sendEmail?: (to: string, subject: string, text: string) => Promise<void>;
  cronSecret?: string;
}) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const expectedSecret = deps?.cronSecret ?? Deno.env.get('CRON_SECRET') ?? '';
  const providedSecret = req.headers.get('x-cron-secret') ?? '';
  if (!expectedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = deps?.supabase ?? createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const cutoffIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: dueComplaints, error: fetchError } = await supabase
    .from('complaints')
    .select('id, center, category, incident_date, email')
    .not('email', 'is', null)
    .is('reminder_60d_sent_at', null)
    .eq('resolution_outcome', 'pending')
    .lte('created_at', cutoffIso)
    .limit(50);

  if (fetchError) {
    return new Response(JSON.stringify({ error: 'Database query failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const fromEmail = (Deno.env.get('REMINDER_FROM_EMAIL') ?? '').trim();

  // Seguridad: si no hay un remitente de dominio propio configurado (REMINDER_FROM_EMAIL),
  // nunca se usa onboarding@resend.dev ni el correo personal de la cuenta Resend.
  if (!deps?.sendEmail && (!fromEmail || fromEmail.includes('onboarding@resend.dev'))) {
    return new Response(JSON.stringify({
      checked: (dueComplaints ?? []).length,
      sent: 0,
      skipped: (dueComplaints ?? []).length,
      mode: 'dry-run-no-domain'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const sendEmail = deps?.sendEmail ?? (async (to: string, subject: string, text: string) => {
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: fromEmail, to, subject, text })
    });
    if (!resp.ok) throw new Error(`Resend HTTP ${resp.status}`);
  });

  let sent = 0;
  let failed = 0;

  for (const item of dueComplaints ?? []) {
    if (!item.email) continue;
    try {
      const mail = buildReminderEmail(item);
      await sendEmail(item.email, mail.subject, mail.text);
      await supabase
        .from('complaints')
        .update({ reminder_60d_sent_at: new Date().toISOString() })
        .eq('id', item.id);
      sent++;
    } catch {
      failed++;
    }
  }

  return new Response(JSON.stringify({ checked: (dueComplaints ?? []).length, sent, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

if (import.meta.main) {
  Deno.serve((req) => handleDeadlineReminder(req));
}
