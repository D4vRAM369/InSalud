// Ejecutamos el JS real con un DOM mínimo: no requiere navegador ni credenciales.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync('admin/index.html', 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { style: {}, value: id === 'loginEmail' ? 'admin@example.com' : 'password', addEventListener() {}, textContent: '', innerHTML: '', disabled: false });
  return nodes.get(id);
};
const document = { getElementById: node, querySelectorAll: () => [], createElement: () => ({}) };
async function run(client, check) {
  nodes.clear();
  const context = vm.createContext({ document, supabaseClient: client, console, setTimeout, clearTimeout, confirm: () => false });
  vm.runInContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  await check(context);
}
(async () => {
  await run(null, async ctx => {
    await assert.doesNotReject(() => ctx.handleLogin());
    assert.match(node('loginError').textContent, /cargar|conexión|conexi|Supabase/i);
  });
  const client = {
    auth: { getSession: async () => ({ data: { session: null } }), signInWithPassword: async () => { throw new Error('sin red'); } }
  };
  await run(client, async ctx => {
    await assert.doesNotReject(() => ctx.handleLogin());
    assert.match(node('loginError').textContent, /sin red/);
    assert.equal(node('loginBtn').disabled, false);
  });
  console.log('Admin: CDN ausente y rechazo de red controlados');
})().catch(error => { console.error(error); process.exitCode = 1; });
