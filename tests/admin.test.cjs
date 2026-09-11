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
  const context = vm.createContext({ document, supabaseClient: client, console, SUPABASE_URL: 'https://project.supabase.co', setTimeout, clearTimeout, confirm: () => false });
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
  let signedOut = false;
  const nonAdmin = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-id' } } } }),
      signOut: async () => { signedOut = true; return {}; } },
    from: () => ({ select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: { role: 'user' }, error: null }) })
  };
  await run(nonAdmin, async ctx => {
    assert.equal(signedOut, true);
    assert.notEqual(node('dashboardView').style.display, 'block');
    assert.match(node('loginError').textContent, /permisos/);
    assert.equal(ctx.esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.throws(() => ctx.attachmentPath('https://evil.test/file'), /no válida/);
    assert.equal(ctx.attachmentPath('https://project.supabase.co/storage/v1/object/public/complaint-attachments/complaints/a.pdf'), 'complaints/a.pdf');
  });
  const failedUpdate = {
    auth: client.auth,
    from: () => ({ update() { return this; }, eq() { return this; },
      select: async () => ({ data: [], error: null }) })
  };
  await run(failedUpdate, async ctx => {
    await assert.rejects(() => ctx.updateStatus('uuid', 'published'), /No se actualizó/);
    await assert.rejects(() => ctx.updateStatus('uuid', '<script>'), /Estado no válido/);
  });
  console.log('Admin: CDN ausente y rechazo de red controlados');
})().catch(error => { console.error(error); process.exitCode = 1; });
