// =====================================================
// InSalud — Lógica del Formulario de Reclamaciones
// Maneja validación, uploads, y envío a Supabase
// =====================================================

// ---- ESTADO ----
let selectedFiles = [];
let submitting = false;
let pendingSubmission = null;

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
      const complaint = { center, category, incident_date: incidentDate, description, email };
      const signature = JSON.stringify([complaint, selectedFiles.map(file => [file.name, file.size, file.type, file.lastModified])]);
      // Reutilizar la identidad evita duplicados si el servidor guardó pero se perdió su respuesta.
      if (!pendingSubmission || (!pendingSubmission.attempted && pendingSubmission.signature !== signature)) {
        pendingSubmission = { complaint: { id: crypto.randomUUID(), ...complaint }, signature, attachments: [], attempted: false };
      }
      await uploadFiles();
      pendingSubmission.attempted = true;
      const { data, error } = await supabaseClient.rpc('submit_complaint', {
        p_complaint: pendingSubmission.complaint,
        p_attachments: pendingSubmission.attachments
      });
      if (error) throw error;
      if (data !== pendingSubmission.complaint.id) throw new Error('Confirmación inválida');
      pendingSubmission = null;
      form.style.display = 'none';
      successMessage.style.display = 'block';
      successMessage.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      // No imprimimos la reclamación ni errores remotos: pueden contener datos personales.
      showError(pendingSubmission?.attempted
        ? 'No se pudo confirmar el envío. Pulsa Enviar para reintentar la misma reclamación sin duplicarla. Conserva esta página abierta.'
        : 'No se pudo enviar la reclamación o alguno de sus archivos. Conservamos tus datos para reintentar.');
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
    const path = `complaints/${pendingSubmission.complaint.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
    const { error } = await supabaseClient.storage.from('complaint-attachments')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    // Guardamos una ruta privada; solamente un administrador podrá generar una URL temporal.
    pendingSubmission.attachments.push({ file_url: path, file_type: file.type, file_size: file.size });
  }
}

// ---- UTILIDADES ----
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

function generateFormalDraft() {
  const center = document.getElementById('center').value || 'Centro no especificado';
  const category = document.getElementById('category').value || 'Categoría no especificada';
  const date = document.getElementById('incident_date').value || 'Fecha no especificada';
  const description = document.getElementById('description').value || '';

  const draftText = `ESCRITO DE RECLAMACIÓN / QUEJA FORMAL
--------------------------------------------------
A LA DIRECCIÓN GERENCIA / SERVICIO DE ATENCIÓN AL PACIENTE
DEL SERVICIO CANARIO DE SALUD (SCS) / DIPUTADO DEL COMÚN

DATOS DEL CENTRO AFECTADO:
- Centro / Hospital: ${center}
- Categoría del problema: ${category}
- Fecha de la incidencia: ${date}

EXPONE:
Que el/la abajo firmante (o en representación de paciente afectado), formula reclamación formal en relación con los hechos acaecidos en el centro indicado, manifestando lo siguiente:

${description}

SOLICITA:
1. Se admita a trámite el presente escrito y se investiguen los hechos expuestos.
2. Se adopten las medidas correctoras necesarias para evitar que situaciones similares vuelvan a repetirse.
3. Se de respuesta por escrito a la presente reclamación en los plazos legalmente establecidos.

En Gran Canaria, a ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.

Firma: ___________________________
`;

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

function resetForm() {
  if (submitting) return;
  pendingSubmission = null;
  setLoading(false);
  form.reset();
  form.style.display = 'block';
  successMessage.style.display = 'none';
  errorMessage.style.display = 'none';
  selectedFiles = [];
  renderFileList();
  charCount.textContent = '0';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
