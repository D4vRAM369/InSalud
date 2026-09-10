// =====================================================
// InSalud — Lógica del Formulario de Reclamaciones
// Maneja validación, uploads, y envío a Supabase
// =====================================================

// ---- ESTADO ----
let selectedFiles = [];

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
  fileUploadArea.addEventListener('click', () => {
    fileInput.click();
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
    item.innerHTML = `
      <span class="file-name">${file.name} (${size})</span>
      <button type="button" class="file-remove" onclick="removeFile(${index})" title="Eliminar archivo">&times;</button>
    `;

    fileList.appendChild(item);
  });
}

function removeFile(index) {
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

    // Validar disclaimer
    if (!document.getElementById('disclaimer').checked) {
      showError('Debes aceptar el aviso de protección de datos personales.');
      return;
    }

    // Validar campos obligatorios
    const center = document.getElementById('center').value;
    const category = document.getElementById('category').value;
    const incidentDate = document.getElementById('incidentDate').value;
    const description = descriptionField.value.trim();

    if (!center || !category || !incidentDate || !description) {
      showError('Por favor, rellena todos los campos obligatorios.');
      return;
    }

    if (description.length < 20) {
      showError('La descripción debe tener al menos 20 caracteres. Sé más detallado.');
      return;
    }

    // Mostrar loading
    setLoading(true);
    hideError();

    try {
      let attachmentUrls = [];

      // Subir archivos si los hay
      if (selectedFiles.length > 0) {
        attachmentUrls = await uploadFiles();
      }

      // Enviar reclamación a Supabase
      const { data, error } = await supabaseClient
        .from('complaints')
        .insert({
          center: center,
          category: category,
          incident_date: incidentDate,
          description: description,
          email: document.getElementById('email').value.trim() || null,
          status: 'pending',
          source: 'web'
        })
        .select()
        .single();

      if (error) throw error;

      // Guardar adjuntos en la tabla attachments
      if (attachmentUrls.length > 0 && data) {
        const attachments = attachmentUrls.map(url => ({
          complaint_id: data.id,
          file_url: url.url,
          file_type: url.type,
          file_size: url.size
        }));

        const { error: attachError } = await supabaseClient
          .from('attachments')
          .insert(attachments);

        if (attachError) console.error('Error guardando adjuntos:', attachError);
      }

      // Mostrar éxito
      form.style.display = 'none';
      successMessage.style.display = 'block';
      successMessage.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
      console.error('Error al enviar reclamación:', error);
      showError('No se pudo enviar la reclamación. Inténtalo de nuevo más tarde.');
    } finally {
      setLoading(false);
    }
  });
}

// ---- SUBIR ARCHIVOS A SUPABASE STORAGE ----
async function uploadFiles() {
  const results = [];

  for (const file of selectedFiles) {
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `complaints/${fileName}`;

    const { data, error } = await supabaseClient.storage
      .from('complaint-attachments')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      console.error('Error subiendo archivo:', error);
      continue;
    }

    // Obtener URL pública
    const { data: urlData } = supabaseClient.storage
      .from('complaint-attachments')
      .getPublicUrl(data.path);

    results.push({
      url: urlData.publicUrl,
      type: file.type,
      size: file.size
    });
  }

  return results;
}

// ---- UTILIDADES ----
function setLoading(loading) {
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

function resetForm() {
  form.reset();
  form.style.display = 'block';
  successMessage.style.display = 'none';
  errorMessage.style.display = 'none';
  selectedFiles = [];
  renderFileList();
  charCount.textContent = '0';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
