// =====================================================
// InSalud — Lógica del Listado Público
// Muestra reclamaciones publicadas con filtros
// =====================================================

// ---- ESTADO ----
let allComplaints = [];

// ---- ELEMENTOS DEL DOM ----
const complaintsList = document.getElementById('complaintsList');
const noComplaints = document.getElementById('noComplaints');
const loadingMessage = document.getElementById('loadingMessage');
const filterCenter = document.getElementById('filterCenter');
const filterCategory = document.getElementById('filterCategory');
const statTotal = document.getElementById('statTotal');
const statCentros = document.getElementById('statCentros');
const statCategorias = document.getElementById('statCategorias');

// ---- INICIALIZACIÓN ----
document.addEventListener('DOMContentLoaded', () => {
  loadComplaints();
  initFilters();
});

// ---- CARGAR RECLAMACIONES ----
async function loadComplaints() {
  try {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allComplaints = data || [];
    renderComplaints(allComplaints);
    updateStats(allComplaints);
    populateFilters(allComplaints);

  } catch (error) {
    console.error('Error cargando reclamaciones:', error);
    loadingMessage.innerHTML = '<p>Error al cargar las reclamaciones.</p>';
  }
}

// ---- RENDERIZAR RECLAMACIONES ----
function renderComplaints(complaints) {
  loadingMessage.style.display = 'none';

  if (complaints.length === 0) {
    complaintsList.innerHTML = '';
    noComplaints.style.display = 'block';
    return;
  }

  noComplaints.style.display = 'none';

  complaintsList.innerHTML = complaints.map(complaint => `
    <div class="complaint-card">
      <div class="card-header">
        <span class="card-center">${escapeHtml(complaint.center)}</span>
        <span class="card-date">${formatDate(complaint.incident_date)}</span>
      </div>
      <span class="card-category">${escapeHtml(complaint.category)}</span>
      <p class="card-description">${escapeHtml(complaint.description)}</p>
    </div>
  `).join('');
}

// ---- ACTUALIZAR ESTADÍSTICAS ----
function updateStats(complaints) {
  statTotal.textContent = complaints.length;

  const centros = new Set(complaints.map(c => c.center));
  statCentros.textContent = centros.size;

  const categorias = new Set(complaints.map(c => c.category));
  statCategorias.textContent = categorias.size;
}

// ---- POBLAR FILTROS ----
function populateFilters(complaints) {
  // Centros únicos
  const centros = [...new Set(complaints.map(c => c.center))].sort();
  centros.forEach(center => {
    const option = document.createElement('option');
    option.value = center;
    option.textContent = center;
    filterCenter.appendChild(option);
  });

  // Categorías únicas
  const categorias = [...new Set(complaints.map(c => c.category))].sort();
  categorias.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    filterCategory.appendChild(option);
  });
}

// ---- FILTROS ----
function initFilters() {
  filterCenter.addEventListener('change', applyFilters);
  filterCategory.addEventListener('change', applyFilters);
}

function applyFilters() {
  const centerValue = filterCenter.value;
  const categoryValue = filterCategory.value;

  let filtered = allComplaints;

  if (centerValue) {
    filtered = filtered.filter(c => c.center === centerValue);
  }

  if (categoryValue) {
    filtered = filtered.filter(c => c.category === categoryValue);
  }

  renderComplaints(filtered);
  updateStats(filtered);
}

// ---- UTILIDADES ----
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('es-ES', options);
}
