// =====================================================
// InSalud — Lógica del Listado Público
// Muestra reclamaciones publicadas con filtros
// =====================================================

// ---- ESTADO ----
let allComplaints = [];
let chartCentersInstance = null;
let chartCategoriesInstance = null;

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
    if (!supabaseClient) throw new Error('No se pudo cargar Supabase.');
    const rows = [];
    // La vista pública omite emails; no basta con ocultarlos en las tarjetas.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabaseClient.from('public_complaints')
        .select('id,center,category,incident_date,description,created_at')
        .order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) break;
    }
    allComplaints = rows;
    renderComplaints(allComplaints);
    updateStats(allComplaints);
    populateFilters(allComplaints);

  } catch (error) {
    console.error('Error cargando reclamaciones:', error);
    loadingMessage.textContent = 'No se pudieron cargar las reclamaciones. Comprueba la conexión y recarga.';
    loadingMessage.style.display = 'block';
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

// ---- ACTUALIZAR ESTADÍSTICAS Y GRÁFICAS ----
function updateStats(complaints) {
  statTotal.textContent = complaints.length;

  const centros = new Set(complaints.map(c => c.center));
  statCentros.textContent = centros.size;

  const categorias = new Set(complaints.map(c => c.category));
  statCategorias.textContent = categorias.size;

  renderCharts(complaints);
}

function renderCharts(complaints) {
  const chartsSection = document.getElementById('chartsSection');
  if (typeof Chart === 'undefined' || complaints.length === 0) {
    if (chartsSection) chartsSection.style.display = 'none';
    return;
  }
  if (chartsSection) chartsSection.style.display = 'grid';

  const canvasCenters = document.getElementById('chartCenters');
  const canvasCats = document.getElementById('chartCategories');
  if (!canvasCenters?.getContext || !canvasCats?.getContext) return;

  // Conteo por centro
  const centerCounts = {};
  complaints.forEach(c => {
    centerCounts[c.center] = (centerCounts[c.center] || 0) + 1;
  });
  const sortedCenters = Object.entries(centerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Conteo por categoría
  const catCounts = {};
  complaints.forEach(c => {
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
  });
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);

  // Gráfica Centros
  const ctxCenters = document.getElementById('chartCenters').getContext('2d');
  if (chartCentersInstance) chartCentersInstance.destroy();
  chartCentersInstance = new Chart(ctxCenters, {
    type: 'bar',
    data: {
      labels: sortedCenters.map(item => item[0].length > 25 ? item[0].substring(0, 25) + '...' : item[0]),
      datasets: [{
        label: 'Reclamaciones',
        data: sortedCenters.map(item => item[1]),
        backgroundColor: '#1E3A5F',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });

  // Gráfica Categorías
  const ctxCats = document.getElementById('chartCategories').getContext('2d');
  if (chartCategoriesInstance) chartCategoriesInstance.destroy();
  chartCategoriesInstance = new Chart(ctxCats, {
    type: 'doughnut',
    data: {
      labels: sortedCats.map(item => item[0]),
      datasets: [{
        data: sortedCats.map(item => item[1]),
        backgroundColor: ['#1E3A5F', '#4A90D9', '#E67E22', '#27AE60', '#E74C3C', '#9B59B6', '#34495E']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }
    }
  });
}

// ---- POBLAR FILTROS ----
function populateFilters(complaints) {
  // Limpiar opciones evita duplicados al volver a cargar.
  filterCenter.length = 1;
  filterCategory.length = 1;
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
  return new Date(dateString + 'T12:00:00').toLocaleDateString('es-ES', options);
}
