// =====================================================
// InSalud — Lógica del Formulario de Reclamaciones
// Maneja validación, uploads, y envío a Supabase
// =====================================================

// ---- ESTADO ----
let selectedFiles = [];
let submitting = false;
let pendingSubmission = null;
let lastSubmittedDraftData = null;
let lastSuccessAt = 0;

// ---- ELEMENTOS DEL DOM ----
const form = document.getElementById('complaintForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const fileInput = document.getElementById('attachments');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileList = document.getElementById('fileList');
const charCount = document.getElementById('charCount');
const descriptionField = document.getElementById('description');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// ---- INICIALIZACIÓN ----
document.addEventListener('DOMContentLoaded', () => {
  initCharCounter();
  initFileUpload();
  initFormSubmit();
});

// ---- CONTADOR DE CARACTERES ----
function initCharCounter() {
  descriptionField.addEventListener('input', () => {
    const count = descriptionField.value.length;
    charCount.textContent = count;

    if (count > 2000) {
      descriptionField.value = descriptionField.value.substring(0, 2000);
      charCount.textContent = 2000;
    }
  });
}

// ---- UPLOAD DE ARCHIVOS ----
function initFileUpload() {
  // Click para seleccionar
  fileUploadArea.addEventListener('click', (event) => {
    // El click del input también burbujea; ignorarlo evita abrir el selector dos veces.
    if (!submitting && !pendingSubmission?.attempted && event.target !== fileInput) fileInput.click();
  });
  fileUploadArea.addEventListener('keydown', (event) => {
    if (event.target === fileUploadArea && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!submitting && !pendingSubmission?.attempted) fileInput.click();
    }
  });

  // Cambio en el input de archivos
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  // Drag and drop
  fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.classList.add('dragover');
  });

  fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.classList.remove('dragover');
  });

  fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
}

function handleFiles(files) {
  if (submitting || pendingSubmission?.attempted) return;
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
                        'application/pdf', 'application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  for (const file of files) {
    // Validar tamaño
    if (file.size > maxSize) {
      showError(`El archivo "${file.name}" supera los 5MB. Por favor, elige uno más pequeño.`);
      continue;
    }

    // Validar tipo
    if (!allowedTypes.includes(file.type)) {
      showError(`El archivo "${file.name}" no es un formato permitido. Usa JPG, PNG, PDF o DOC.`);
      continue;
    }

    // Verificar duplicados
    if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
      continue;
    }

    if (selectedFiles.length >= 3 || selectedFiles.reduce((sum, item) => sum + item.size, 0) + file.size > 10 * 1024 * 1024) {
      showError('Puedes adjuntar hasta 3 archivos y 10 MiB en total.');
      continue;
    }
    selectedFiles.push(file);
  }

  renderFileList();
  fileInput.value = ''; // Limpiar input para poder re-seleccionar
}

function renderFileList() {
  fileList.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';

    const size = formatFileSize(file.size);
    // El nombre procede del usuario: textContent lo muestra sin ejecutar etiquetas HTML.
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = `${file.name} (${size})`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'file-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Eliminar ${file.name}`);
    remove.disabled = submitting || !!pendingSubmission?.attempted;
    remove.addEventListener('click', () => removeFile(index));
    item.appendChild(name);
    item.appendChild(remove);

    fileList.appendChild(item);
  });
}

function removeFile(index) {
  if (submitting || pendingSubmission?.attempted) return;
  selectedFiles.splice(index, 1);
  renderFileList();
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ---- ENVÍO DEL FORMULARIO ----
function initFormSubmit() {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (submitting) return;
    const honeypotEl = document.getElementById('website');
    if (honeypotEl && honeypotEl.value) {
      showError('No se pudo validar el envío.');
      return;
    }
    if (lastSuccessAt && Date.now() - lastSuccessAt < 15000) {
      showError('Espera unos segundos antes de enviar otra reclamación.');
      return;
    }
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      showError('No se pudo cargar la conexión. Comprueba tu red y recarga la página.');
      return;
    }
    if (!document.getElementById('disclaimer').checked) {
      showError('Debes aceptar el aviso de protección de datos personales.');
      return;
    }
    const center = document.getElementById('center').value;
    const category = document.getElementById('category').value;
    const incidentDate = document.getElementById('incidentDate').value;
    const description = descriptionField.value.trim();
    const email = document.getElementById('email').value.trim() || null;
    if (!center || !category || !incidentDate) {
      showError('Por favor, rellena todos los campos obligatorios.');
      return;
    }
    if (description.length < 20 || description.length > 2000) {
      showError('La descripción debe tener entre 20 y 2000 caracteres.');
      return;
    }
    // La fecha local evita rechazar «hoy» por una diferencia de zona horaria con UTC.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate) || !Number.isFinite(Date.parse(incidentDate)) || incidentDate > today) {
      showError('La fecha del incidente debe ser válida y no puede ser futura.');
      return;
    }
    if (!document.getElementById('email').checkValidity()) {
      showError('Introduce un email válido o deja el campo vacío.');
      return;
    }
    setLoading(true);
    hideError();
    try {
      const draftContext = collectLocalDraftContext();
      const route = resolveCurrentRoute(draftContext);
      const complaint = {
        center,
        category,
        incident_date: incidentDate,
        description,
        email,
        requested_measures: draftContext.requestedMeasures,
        prior_complaint_status: draftContext.priorComplaintStatus,
        has_physical_harm: draftContext.hasPhysicalHarm,
        routed_procedure: route.primary.dbCode || route.primary.id || 'scs_3831'
      };
      const signature = JSON.stringify([complaint, selectedFiles.map(file => [file.name, file.size, file.type, file.lastModified])]);
      // Reutilizar la identidad evita duplicados si el servidor guardó pero se perdió su respuesta.
      if (!pendingSubmission || (!pendingSubmission.attempted && pendingSubmission.signature !== signature)) {
        pendingSubmission = { complaint: { id: generateUUIDv4(), ...complaint }, signature, attachments: [], attempted: false };
      }
      await uploadFiles();
      pendingSubmission.attempted = true;
      const { data, error } = await supabaseClient.rpc('submit_complaint', {
        p_complaint: pendingSubmission.complaint,
        p_attachments: pendingSubmission.attachments
      });
      if (error) throw error;
      if (data !== pendingSubmission.complaint.id) throw new Error('Confirmación inválida');
      lastSuccessAt = Date.now();
      lastSubmittedDraftData = collectLocalDraftContext();
      renderOfficialRoutePanel(lastSubmittedDraftData);
      pendingSubmission = null;
      form.style.display = 'none';
      successMessage.style.display = 'block';
      successMessage.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      // No imprimimos la reclamación ni datos personales, solo el código/motivo técnico seguro.
      const detail = error && (error.code || error.statusCode || error.message)
        ? ` (${String(error.code || error.statusCode || error.message).slice(0, 120)})`
        : '';
      console.error('Error en envío:', error?.code || error?.statusCode || error?.message || error);
      showError((pendingSubmission?.attempted
        ? 'No se pudo confirmar el envío. Pulsa Enviar para reintentar la misma reclamación sin duplicarla. Conserva esta página abierta.'
        : 'No se pudo enviar la reclamación o alguno de sus archivos. Conservamos tus datos para reintentar.') + detail);
    } finally {
      setLoading(false);
    }
  });
}

// ---- SUBIR ARCHIVOS A SUPABASE STORAGE ----
async function uploadFiles() {
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'application/pdf': 'pdf', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
  // Conservamos las subidas confirmadas: reintentar no crea otra copia de cada archivo.
  for (let i = pendingSubmission.attachments.length; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const path = `complaints/${pendingSubmission.complaint.id}/${generateUUIDv4()}.${extensions[file.type]}`;
    const { error } = await supabaseClient.storage.from('complaints-attachments')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    // Guardamos una ruta privada; solamente un administrador podrá generar una URL temporal.
    pendingSubmission.attachments.push({ file_url: path, file_type: file.type, file_size: file.size });
  }
}

// ---- UTILIDADES ----
function generateUUIDv4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function setLoading(loading) {
  submitting = loading;
  // Tras una respuesta incierta, mantener el contenido evita reintentar con datos diferentes.
  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.disabled = loading || !!pendingSubmission?.attempted;
  });
  renderFileList();
  submitBtn.disabled = loading;
  btnText.style.display = loading ? 'none' : 'inline';
  btnLoading.style.display = loading ? 'inline' : 'none';
}

function showError(message) {
  errorText.textContent = message;
  errorMessage.style.display = 'block';
  errorMessage.scrollIntoView({ behavior: 'smooth' });
}

function hideError() {
  errorMessage.style.display = 'none';
}

function collectLocalDraftContext() {
  const checkedMeasures = [];
  if (typeof document.querySelectorAll === 'function') {
    document.querySelectorAll('input[name="requestedMeasure"]:checked').forEach(el => {
      if (el && el.value) checkedMeasures.push(el.value);
    });
  }
  const customMeasureEl = document.getElementById('customMeasure');
  const customMeasure = customMeasureEl && customMeasureEl.value ? customMeasureEl.value.trim() : '';
  if (customMeasure) checkedMeasures.push(customMeasure);

  const priorEl = document.getElementById('priorComplaintStatus');
  const harmEl = document.getElementById('hasPhysicalHarm');
  return {
    center: document.getElementById('center').value || 'Centro no especificado',
    category: document.getElementById('category').value || 'Categoría no especificada',
    incidentDate: document.getElementById('incidentDate').value || 'Fecha no especificada',
    description: document.getElementById('description').value || '',
    requestedMeasures: checkedMeasures,
    priorComplaintStatus: priorEl && priorEl.value ? priorEl.value : 'none',
    hasPhysicalHarm: Boolean(harmEl && harmEl.checked)
  };
}

function getDraftPayload() {
  const base = lastSubmittedDraftData || collectLocalDraftContext();
  const nameEl = document.getElementById('localName');
  const dniEl = document.getElementById('localDni');
  return {
    ...base,
    claimantName: nameEl && nameEl.value ? nameEl.value.trim() : '',
    claimantDni: dniEl && dniEl.value ? dniEl.value.trim() : ''
  };
}

function resolveCurrentRoute(payload) {
  if (typeof InSaludRouting !== 'undefined' && InSaludRouting.resolveComplaintRoute) {
    return InSaludRouting.resolveComplaintRoute(payload);
  }
  return {
    primary: {
      name: 'Servicio Canario de la Salud (SCS) / ODDUS — Reclamación en el ámbito sanitario',
      procedureCode: 'Trámite 1768',
      url: 'https://sede.gobiernodecanarias.org/sede/tramites/1768',
      deadline: 'Plazo máximo legal de respuesta: 2 meses (Decreto 8/2025).'
    },
    secondaryChannels: []
  };
}

function renderOfficialRoutePanel(payload) {
  const route = resolveCurrentRoute(payload);
  const summaryEl = document.getElementById('routeSummary');
  const linkEl = document.getElementById('officialRouteLink');
  const secondaryEl = document.getElementById('secondaryRoutes');

  if (summaryEl) {
    summaryEl.textContent = `Ruta recomendada: ${route.primary.name} (${route.primary.procedureCode}). ${route.primary.deadline} InSalud no recopila tu DNI ni Cl@ve: solo te redirige al portal oficial.`;
  }
  if (linkEl) {
    linkEl.href = route.primary.url;
    linkEl.textContent = `Ir a ${route.primary.procedureCode} (Cl@ve / Certificado) \u2197`;
  }
  if (secondaryEl && typeof secondaryEl.replaceChildren === 'function') {
    const items = [];
    if (route.secondaryChannels.length > 0) {
      const title = document.createElement('p');
      title.className = 'small-hint';
      title.textContent = 'Canales adicionales según tu caso:';
      items.push(title);

      route.secondaryChannels.forEach(ch => {
        const a = document.createElement('a');
        a.href = ch.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'secondary-route-link';
        a.textContent = `${ch.name} (${ch.procedureCode})`;
        items.push(a);
      });
    }
    secondaryEl.replaceChildren(...items);
  }
}

function buildFormalText(payload) {
  const route = resolveCurrentRoute(payload);
  if (typeof InSaludRouting !== 'undefined' && InSaludRouting.buildFormalComplaintText) {
    return InSaludRouting.buildFormalComplaintText({ ...payload, route });
  }
  return `ESCRITO DE RECLAMACIÓN / QUEJA FORMAL\nCentro: ${payload.center}\nCategoría: ${payload.category}\nFecha: ${payload.incidentDate}\n\nEXPONE:\n${payload.description}\n`;
}

async function copyFormalDraft() {
  const payload = getDraftPayload();
  const text = buildFormalText(payload);
  const feedbackEl = document.getElementById('copyFeedback');
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      if (feedbackEl) feedbackEl.style.display = 'block';
    }
  } catch (_) {
    showError('No se pudo copiar automáticamente. Usa el botón de descargar borrador.');
  }
}

function generateFormalDraft() {
  const payload = getDraftPayload();
  const draftText = buildFormalText(payload);

  const blob = new Blob([draftText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Borrador-Reclamacion-Formal-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printFormalDraft() {
  const payload = getDraftPayload();
  const printableEl = document.getElementById('printableDraft');
  if (printableEl) {
    printableEl.textContent = buildFormalText(payload);
  }
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

const SPEECH_BTN_IDLE = 'Escuchar Guía y Medidas en Voz Alta';
const SPEECH_BTN_ACTIVE = 'Detener Lectura en Voz Alta';
let speechSessionId = 0;

function stopSpeechPlayback() {
  speechSessionId += 1;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  const btn = document.getElementById('speakSummaryBtn');
  if (btn) btn.textContent = SPEECH_BTN_IDLE;
}

function loadSpeechVoices(synth) {
  const existing = typeof synth.getVoices === 'function' ? synth.getVoices() : [];
  if (existing.length > 0 || typeof synth.addEventListener !== 'function') {
    return Promise.resolve(existing);
  }
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', finish);
      }
      resolve(typeof synth.getVoices === 'function' ? synth.getVoices() : []);
    };
    synth.addEventListener('voiceschanged', finish);
    setTimeout(finish, 600);
  });
}

function pickSpanishVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  return voices.find(v => /^es[-_]ES$/i.test(v.lang || ''))
    || voices.find(v => /^es\b/i.test(v.lang || ''))
    || null;
}

function splitSpeechChunks(text, maxLen = 220) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current.length + 1 + sentence.length) > maxLen) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [String(text || '')];
}

async function speakFormalSummary() {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    showError('Tu navegador no soporta lectura en voz alta.');
    return;
  }
  const synth = window.speechSynthesis;
  const btn = document.getElementById('speakSummaryBtn');
  if (synth.speaking || synth.pending) {
    stopSpeechPlayback();
    return;
  }

  const currentSession = ++speechSessionId;
  const voices = await loadSpeechVoices(synth);
  if (currentSession !== speechSessionId) return;

  if (typeof synth.getVoices === 'function' && voices.length === 0) {
    showError('No hay voces de lectura disponibles en este navegador o sistema operativo.');
    return;
  }

  const payload = getDraftPayload();
  const route = resolveCurrentRoute(payload);
  const spokenText = typeof InSaludRouting !== 'undefined' && InSaludRouting.formatRouteForSpeech
    ? InSaludRouting.formatRouteForSpeech({ ...payload, route })
    : `Ruta recomendada: ${route.primary.name}. ${route.primary.deadline}`;

  const spanishVoice = pickSpanishVoice(voices);
  const chunks = splitSpeechChunks(spokenText);
  let index = 0;

  if (btn) btn.textContent = SPEECH_BTN_ACTIVE;
  if (typeof synth.resume === 'function') synth.resume();

  const speakNext = () => {
    if (currentSession !== speechSessionId) return;
    if (index >= chunks.length) {
      if (btn) btn.textContent = SPEECH_BTN_IDLE;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index++]);
    utterance.lang = 'es-ES';
    if (spanishVoice) utterance.voice = spanishVoice;
    utterance.rate = 0.98;
    utterance.onend = speakNext;
    utterance.onerror = () => {
      if (currentSession !== speechSessionId) return;
      stopSpeechPlayback();
      showError('No se pudo reproducir la lectura en voz alta en este navegador.');
    };
    synth.speak(utterance);
  };

  speakNext();
}

function resetForm() {
  if (submitting) return;
  stopSpeechPlayback();
  pendingSubmission = null;
  lastSubmittedDraftData = null;
  setLoading(false);
  form.reset();
  form.style.display = 'block';
  successMessage.style.display = 'none';
  errorMessage.style.display = 'none';
  const feedbackEl = document.getElementById('copyFeedback');
  if (feedbackEl) feedbackEl.style.display = 'none';
  selectedFiles = [];
  renderFileList();
  charCount.textContent = '0';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
