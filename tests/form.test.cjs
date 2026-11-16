const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

// DOM mínimo: prueba comportamiento del formulario sin navegador ni dependencias.
function setup(client = {}) {
  const nodes = {};
  function node(id) {
    return nodes[id] ||= { value: '', checked: true, children: [], style: {}, disabled: false,
      listeners: {}, classList: { add() {}, remove() {} },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      querySelector(name) { return node(id + name); },
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      set innerHTML(value) { this.html = value; this.children = []; },
      get innerHTML() { return this.html; },
      scrollIntoView() {}, click() {}, setAttribute() {},
      checkValidity() { return true; }, reset() {} };
  }
  const document = { getElementById: node, createElement: () => node(randomUUID()),
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') fn(); } };
  node('complaintForm').querySelectorAll = () => [node('attachments'), node('description')];
  const context = vm.createContext({ document, window: { scrollTo() {} }, console,
    crypto: { randomUUID }, supabaseClient: client, Date });
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
  node('center').value = 'Centro'; node('category').value = 'Otro';
  node('incidentDate').value = '2026-01-01'; node('description').value = 'Una descripción suficientemente larga';
  return { context, node, submit: () => node('complaintForm').listeners.submit({ preventDefault() {} }) };
}
const file = (name = 'a.png', size = 1) => ({ name, size, type: 'image/png' });
(async () => {
  const a = setup();
  a.context.handleFiles([file('<img src=x onerror=alert(1)>')]);
  assert.equal(a.node('fileList').children[0].children[0].textContent, '<img src=x onerror=alert(1)> (1 Bytes)');
  a.context.handleFiles([file('b'), file('c'), file('d')]);
  assert.equal(vm.runInContext('selectedFiles.length', a.context), 3);
  const b = setup(); b.context.handleFiles([file('a', 5*1024*1024), file('b', 5*1024*1024), file('c')]);
  assert.equal(vm.runInContext('selectedFiles.length', b.context), 2);
  const unavailable = setup(null); await unavailable.submit();
  assert.match(unavailable.node('errorText').textContent, /cargar|conexión/i);
  let calls = [], uploads = [], rejectUpload = true, failRpc = true;
  const c = setup({ storage: { from: () => ({ upload: async (path) => {
    uploads.push(path); return { error: rejectUpload ? new Error('storage') : null };
  } }) }, rpc: async (name, args) => { calls.push(args); return failRpc ? {error: new Error('red')} : {data: args.p_complaint.id, error:null}; } });
  c.context.handleFiles([file()]); await c.submit();
  assert.equal(calls.length, 0); assert.notEqual(c.node('successMessage').style.display, 'block');
  rejectUpload = false; await c.submit(); failRpc = false; await c.submit();
  assert.equal(calls.length, 2); assert.equal(calls[0].p_complaint.id, calls[1].p_complaint.id);
  assert.equal(uploads.length, 2); assert.equal(c.node('successMessage').style.display, 'block');
  assert.match(calls[0].p_attachments[0].file_url, /^complaints\/[\da-f-]+\/[\da-f-]+\.png$/);
  let release; let count = 0;
  const d = setup({rpc: async () => { count++; await new Promise(r => release = r); return {data: vm.runInContext('pendingSubmission.complaint.id', d.context), error:null}; }});
  const first = d.submit(); await d.submit(); d.context.handleFiles([file()]);
  assert.equal(count, 1); assert.equal(vm.runInContext('selectedFiles.length', d.context), 0); release(); await first;
  const e = setup({rpc() { throw new Error('No debe enviar'); }});
  e.node('description').value = 'a'.repeat(2001); await e.submit(); assert.match(e.node('errorText').textContent, /2000/);
  e.node('description').value = 'a'.repeat(20); e.node('incidentDate').value = '2999-01-01'; await e.submit(); assert.match(e.node('errorText').textContent, /fecha/i);

  // Web Speech API: sin voces -> error claro; con voz española -> reproduce por fragmentos y restaura botón
  const spoken = [];
  const speechSynth = { speaking: false, pending: false, voices: [], getVoices() { return this.voices; },
    cancel() { this.speaking = false; }, resume() {},
    speak(u) { spoken.push(u); this.speaking = true; if (u.onend) { this.speaking = false; u.onend(); } } };
  const speechCtx = vm.createContext({
    document: e.context.document,
    window: { scrollTo() {}, speechSynthesis: speechSynth },
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    console, crypto: { randomUUID }, supabaseClient: null, Date, setTimeout,
    InSaludRouting: require('../js/routing-engine.js')
  });
  const sNodes = {};
  const sNode = id => (sNodes[id] ||= { value: '', checked: true, children: [], style: {}, disabled: false,
    listeners: {}, classList: { add() {}, remove() {} }, addEventListener() {}, querySelector() { return sNode(id + 'q'); },
    appendChild() {}, replaceChildren() {}, scrollIntoView() {}, click() {}, setAttribute() {}, checkValidity() { return true; }, reset() {} });
  speechCtx.document = { getElementById: sNode, createElement: () => sNode(randomUUID()), addEventListener() {} };
  sNode('center').value = 'Hospital Doctor Negrín'; sNode('category').value = 'Otro';
  sNode('incidentDate').value = '2026-11-10'; sNode('description').value = 'Descripción de prueba suficientemente larga';
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), speechCtx);
  await speechCtx.speakFormalSummary();
  assert.match(sNode('errorText').textContent, /voces/i);
  speechSynth.voices = [{ lang: 'en-US', name: 'EN' }, { lang: 'es-ES', name: 'ES' }];
  await speechCtx.speakFormalSummary();
  assert.ok(spoken.length >= 1);
  assert.equal(spoken[0].voice.lang, 'es-ES');
  assert.equal(sNode('speakSummaryBtn').textContent, 'Escuchar Guía y Medidas en Voz Alta');

  console.log('form: XSS, límites, validación, errores, reintentos, voz y doble envío OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
