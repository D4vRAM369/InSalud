// =====================================================
// InSalud — Edge Function: Telegram Bot Webhook
// Recibe mensajes del bot y guarda reclamaciones en Supabase
// =====================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const message = body.message;

    if (!message || !message.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Supabase client con service role (bypassa RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

    // ---- COMANDOS ----
    if (text === "/start") {
      await sendTelegram(botToken, chatId,
        `📋 *InSalud — Bot de Reclamaciones*\n\n` +
        `Envía tu reclamación sobre el Servicio Canario de Salud de forma anónima.\n\n` +
        `📝 *Cómo funciona:*\n` +
        `1. Escribe tu reclamación en un solo mensaje\n` +
        `2. Si quieres, adjunta fotos o documentos\n` +
        `3. El bot te confirmará la recepción\n\n` +
        `⚠️ *Importante:* Remove datos personales (nombres, teléfonos, direcciones) de cualquier archivo adjunto.\n\n` +
        `Comandos:\n` +
        `/start — Ver esta ayuda\n` +
        `/cancel — Cancelar reclamación actual`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text === "/cancel") {
      await sendTelegram(botToken, chatId, "❌ Reclamación cancelada.");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- RECLAMACIÓN: solo texto ----
    if (text.length < 20) {
      await sendTelegram(botToken, chatId,
        "⚠️ Tu mensaje es muy corto. Por favor, describe tu experiencia con al menos 20 caracteres."
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guardar reclamación
    const { data, error } = await supabase
      .from("complaints")
      .insert({
        description: text,
        center: "No especificado",
        category: "Otro",
        incident_date: new Date().toISOString().split("T")[0],
        status: "pending",
        source: "telegram",
      })
      .select()
      .single();

    if (error) throw error;

    await sendTelegram(botToken, chatId,
      `✅ *Reclamación recibida*\n\n` +
      `Referencia: \`${data.id}\`\n` +
      `Tu reclamación será revisada por nuestro equipo.\n\n` +
      `Si quieres adjuntar fotos, envíalas ahora como siguiente mensaje.`
    );

    // Guardar chat_id para futuros adjuntos
    await supabase.from("complaints").update({
      description: text + `\n\n[Telegram chat_id: ${chatId}]`
    }).eq("id", data.id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ---- UTIL: Enviar mensaje por Telegram ----
async function sendTelegram(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
    }),
  });
}
