const assert = require('node:assert/strict');
const routing = require('../js/routing-engine.js');

// 1. Primera reclamación ordinaria -> SCS Trámite 1768 + secundarios ODDUS y Diputado del Común
const ordinary = routing.resolveComplaintRoute({
  center: 'Centro de Salud Schamann (Las Palmas)',
  category: 'Trato del personal',
  priorComplaintStatus: 'none',
  hasPhysicalHarm: false
});
assert.equal(ordinary.primary.procedureCode, 'Trámite 1768');
assert.match(ordinary.primary.url, /tramites\/1768$/);
assert.ok(ordinary.secondaryChannels.some(ch => ch.id === 'oddus_6465'));
assert.ok(ordinary.secondaryChannels.some(ch => ch.id === 'diputado_comun'));

// 2. Respuesta vacía ("lo sentimos mucho") -> Escala directamente a ODDUS Disconformidad (Trámite 6465)
const disconformity = routing.resolveComplaintRoute({
  center: 'Hospital Universitario de Gran Canaria Doctor Negrín',
  category: 'Mala atención médica',
  priorComplaintStatus: 'empty_response',
  hasPhysicalHarm: false
});
assert.equal(disconformity.primary.procedureCode, 'Trámite 6465');
assert.match(disconformity.primary.url, /tramites\/6465$/);
assert.ok(disconformity.legalBasis.some(line => /disconformidad/i.test(line)));

// 3. Daño físico / negligencia grave -> incluye Responsabilidad Patrimonial (1817) y El Defensor del Paciente
const harm = routing.resolveComplaintRoute({
  center: 'Hospital Universitario Insular de Gran Canaria',
  category: 'Urgencias no atendidas',
  priorComplaintStatus: 'none',
  hasPhysicalHarm: true
});
assert.equal(harm.primary.procedureCode, 'Trámite 1768');
assert.ok(harm.secondaryChannels.some(ch => ch.id === 'scs_1817'));
assert.ok(harm.secondaryChannels.some(ch => ch.id === 'defensor_paciente'));
assert.ok(harm.secondaryChannels.some(ch => /negligenciasmedicas\.com/.test(ch.url)));

// 4. Generación de escrito formal blindado con medidas concretas e identidad local opcional
const draft = routing.buildFormalComplaintText({
  center: 'Centro de Salud Vecindario (Santa Lucía)',
  category: 'Retrasos y listas de espera',
  incidentDate: '2026-11-10',
  description: 'Llevo cuatro meses esperando cita preferente sin respuesta.',
  requestedMeasures: ['Reprogramación urgente de cita.', 'Respuesta escrita motivada (Decreto 8/2025).'],
  claimantName: 'María Pérez',
  claimantDni: '12345678A'
});
assert.match(draft, /Decreto 8\/2025/);
assert.match(draft, /Reprogramación urgente de cita/);
assert.match(draft, /María Pérez/);
assert.match(draft, /2026-11-10/);

// 5. Formato para lectura en voz alta con lenguaje natural (sin URLs crudas)
const speech = routing.formatRouteForSpeech({
  center: 'Hospital Doctor Negrín',
  priorComplaintStatus: 'empty_response',
  hasPhysicalHarm: true,
  requestedMeasures: ['Respuesta escrita motivada.']
});
assert.doesNotMatch(speech, /https?:\/\//);
assert.match(speech, /seis mil cuatrocientos sesenta y cinco/);
assert.match(speech, /Defensor del Paciente/);

console.log('routing: trámites 1768, 6465, 1817, Defensor del Paciente, Diputado del Común, voz y borrador OK');
