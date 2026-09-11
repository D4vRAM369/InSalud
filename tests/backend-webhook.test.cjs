// node --test tests/backend-webhook.test.cjs — sin instalar herramientas ni llamar servicios.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const state = { inserts: [], messages: [], rows: new Map(), sendOk: true, secret: 'test-secret' };
  const env = { TELEGRAM_WEBHOOK_SECRET: state.secret, TELEGRAM_BOT_TOKEN: 'test-token',
    SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-key' };
  const context = { Response, Uint8Array, TextDecoder, AbortSignal, console: { error() {} },
    Deno: { env: { get: key => env[key] }, serve: handler => { state.handler = handler; } },
    fetch: async (_url, options) => { state.messages.push(JSON.parse(options.body));
      return Response.json({ ok: state.sendOk }, { status: state.sendOk ? 200 : 429 }); },
    createClient: () => ({ from: () => ({
      insert: row => ({ select: () => ({ single: async () => {
        if (state.rows.has(row.telegram_update_id)) return { error: { code: '23505' } };
        state.inserts.push(row); const data = { id: 'saved-id' }; state.rows.set(row.telegram_update_id, data);
        return { data, error: null };
      } }) }),
      select: () => ({ eq: (_column, id) => ({ single: async () => ({ data: state.rows.get(id), error: null }) }) }),
    }) }),
  };
  const source = readFileSync('supabase/functions/telegram-webhook/index.ts', 'utf8').replace(/^import .*;\n/m, '')
    .replace('body: unknown', 'body').replace('token: string, chatId: number, text: string', 'token, chatId, text');
  vm.runInNewContext(source, context);
  state.request = (body, options = {}) => state.handler(new Request('https://example.invalid/webhook', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': state.secret },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...options,
  }));
  return state;
}
const update = (text, update_id = 1) => ({ update_id, message: { chat: { id: 10, type: 'private' }, text } });

test('auth antes del JSON, solo POST y cuerpo acotado', async () => {
  const s = fixture();
  assert.equal((await s.request('{invalid', { headers: {} })).status, 401);
  assert.equal((await s.handler(new Request('https://example.invalid'))).status, 405);
  assert.equal((await s.request('{invalid')).status, 400);
  assert.equal((await s.request('x'.repeat(32769))).status, 413);
  assert.equal((await s.request({ update_id: '1' })).status, 400);
  assert.equal(s.inserts.length, 0);
});

test('reclamación pendiente sin chat_id, reintento único y error de Telegram visible', async () => {
  const s = fixture(); const body = update('Una experiencia médica que requiere revisión.');
  s.sendOk = false;
  assert.equal((await s.request(body)).status, 500);
  s.sendOk = true;
  const response = await s.request(body);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(s.inserts.length, 1);
  assert.equal(s.inserts[0].description, body.message.text);
  assert.equal(s.inserts[0].status, 'pending');
  assert.equal(s.inserts[0].telegram_update_id, 1);
});

test('comandos, adjuntos y grupos no se convierten en reclamaciones', async () => {
  const s = fixture();
  for (const text of ['/start', '/help', '/cancel', '/unknown', 'corto', 'x'.repeat(2001)]) {
    assert.equal((await s.request(update(text))).status, 200);
  }
  assert.equal((await s.request({ update_id: 2, message: { chat: { id: 10, type: 'private' }, photo: [] } })).status, 200);
  assert.equal((await s.request({ update_id: 3, message: { chat: { id: -1, type: 'group' }, text: 'x'.repeat(30) } })).status, 200);
  assert.equal(s.inserts.length, 0);
  assert.match(s.messages.at(-1).text, /solo texto/);
});
