// Dos páginas falsas verifican el límite HTTP sin consultar datos ciudadanos.
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const nodes = new Map();
const element = () => ({ style: {}, value: '', appendChild() {}, addEventListener() {}, textContent: '', innerHTML: '' });
const document = { addEventListener() {}, createElement: element, getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); } };
const row = { id: '1', center: 'Centro', category: 'Otro', incident_date: '2026-09-11', description: 'Texto de prueba' };
const offsets = [];
const query = { select() { return this; }, order() { return this; }, async range(start) { offsets.push(start); return { data: start === 0 ? Array(500).fill(row) : [row], error: null }; } };
const client = { from(table) { assert.equal(table, 'public_complaints'); return query; } };
const context = vm.createContext({ document, supabaseClient: client, console });
vm.runInContext(fs.readFileSync('js/listado.js', 'utf8'), context);
(async () => {
  await context.loadComplaints();
  assert.deepEqual(offsets, [0, 500]);
  assert.equal(nodes.get('statTotal').textContent, 501);
  nodes.get('filterCenter').value = 'No existe';
  context.applyFilters();
  assert.equal(nodes.get('noComplaints').style.display, 'block');
  assert.equal(nodes.get('statTotal').textContent, 0);
  console.log('Listado: paginación completa y filtro vacío comprobados');
})().catch(error => { console.error(error); process.exitCode = 1; });
