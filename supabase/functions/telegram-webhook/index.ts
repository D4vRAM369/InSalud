// InSalud — Telegram envía un secreto propio, no un JWT de Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const MAX_BODY_BYTES = 32768;

Deno.serve(async (req) => {
  // CORS no autentica servidores. Este webhook no necesita acceso desde navegadores.
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405, headers: { Allow: 'POST' } });
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !botToken || !url || !key) return json({ error: 'Configuración incompleta' }, 503);
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return json({ error: 'No autorizado' }, 401);

  let update;
  try {
    // Content-Length puede faltar o ser falso; contamos los bytes realmente recibidos.
    const reader = req.body?.getReader();
    if (!reader) return json({ error: 'Cuerpo vacío' }, 400);
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return json({ error: 'Mensaje demasiado grande' }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    update = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ error: 'JSON incorrecto' }, 400);
  }
  if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) {
    return json({ error: 'Actualización incorrecta' }, 400);
  }
  const message = update.message;
  if (!message) return json({ ok: true });
  if (!message.chat || !Number.isSafeInteger(message.chat.id)) return json({ error: 'Chat incorrecto' }, 400);
  // Las reclamaciones médicas deben enviarse en privado, no desde un grupo.
  if (message.chat.type !== 'private') return json({ ok: true });
  const chatId = message.chat.id;

  try {
    if (typeof message.text !== 'string') {
      await sendTelegram(botToken, chatId, 'Este bot recibe solo texto. Para adjuntar documentos usa el formulario web de InSalud.');
      return json({ ok: true });
    }
    const text = message.text.trim();
    const command = text.split(/\s/)[0].split('@')[0];
    if (command === '/start' || command === '/help') {
      await sendTelegram(botToken, chatId,
        '📋 InSalud — Reclamaciones\n\nEnvía tu experiencia en un único mensaje de 20 a 2000 caracteres. ' +
        'Se guardará pendiente de revisión. No incluyas nombres, teléfonos ni otros datos personales.\n\n' +
        'Solo texto; los documentos se envían mediante el formulario web. Cada mensaje se guarda inmediatamente.');
      return json({ ok: true });
    }
    if (command === '/cancel') {
      await sendTelegram(botToken, chatId, 'No hay borradores: cada mensaje válido se registra al enviarlo. /cancel no elimina reclamaciones ya recibidas.');
      return json({ ok: true });
    }
    if (text.startsWith('/')) {
      await sendTelegram(botToken, chatId, 'Comando desconocido. Usa /help para ver las instrucciones.');
      return json({ ok: true });
    }
    if (text.length < 20 || text.length > 2000) {
      await sendTelegram(botToken, chatId, 'Describe tu experiencia con entre 20 y 2000 caracteres.');
      return json({ ok: true });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.from('complaints').insert({
      description: text,
      center: 'No especificado',
      category: 'Otro',
      incident_date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      source: 'telegram',
      telegram_update_id: update.update_id,
    }).select('id').single();
    let id = data?.id;
    if (error) {
      // Telegram reintenta al fallar la entrega o la respuesta: nunca duplicamos la fila.
      if (error.code !== '23505') throw new Error('database_insert');
      const existing = await supabase.from('complaints').select('id').eq('telegram_update_id', update.update_id).single();
      if (existing.error || !existing.data) throw new Error('database_lookup');
      id = existing.data.id;
    }
    // No guardamos chat_id en la descripción: podría publicarse y revelar identidad.
    await sendTelegram(botToken, chatId, `✅ Reclamación recibida\nReferencia: ${id}\nSerá revisada antes de publicarse.`);
    return json({ ok: true });
  } catch {
    // El error público y el log no incluyen mensajes médicos, tokens ni identificadores.
    console.error('No se pudo completar la entrega de Telegram');
    return json({ error: 'Entrega temporalmente no disponible' }, 500);
  }
});

async function sendTelegram(token: string, chatId: number, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error('telegram_send');
}
