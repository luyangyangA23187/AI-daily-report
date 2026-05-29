// State
let articles = {};
let summary = {};
let techKeywords = [];
let companies = [];
let keywordMap = {};
let activeFilters = { regions: null, companies: null, tech: null, products: null };
let mockMode = localStorage.getItem('mockMode') !== 'false';

// DOM Elements
const articlesListEl = document.getElementById('articles-list');
const filtersEl = document.getElementById('filters');
const highlightsEl = document.getElementById('highlights');
const trendsEl = document.getElementById('trends');
const creativeIdeasEl = document.getElementById('creative-ideas');
const risksEl = document.getElementById('risks');
const keywordChartEl = document.getElementById('keyword-chart');
const mockModeToggle = document.getElementById('mock-mode-toggle');
const analyzeBtn = document.getElementById('analyze-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const progressBar = document.getElementById('progress-bar');

// Initialize
async function init() {
  console.log('[App] Init, mockMode from localStorage:', localStorage.getItem('mockMode'));
  mockModeToggle.checked = mockMode;

  mockModeToggle.addEventListener('change', async (e) => {
    mockMode = e.target.checked;
    localStorage.setItem('mockMode', mockMode);
    console.log('[App] Toggle changed, mockMode:', mockMode);
    await Promise.all([
      fetchArticles(),
      fetchSummary(),
      fetchKeywords()
    ]);
    renderAll();
  });

  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    try {
      await runAnalysis();
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  await Promise.all([
    fetchArticles(),
    fetchSummary(),
    fetchKeywords()
  ]);
  renderAll();
}

function showLoading(message = '处理中...') {
  loadingOverlay.style.display = 'flex';
  loadingMessage.textContent = message;
  progressBar.style.width = '0%';
}

function updateLoading(message, percent) {
  loadingMessage.textContent = message;
  if (percent !== undefined) {
    progressBar.style.width = percent + '%';
  }
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
}

async function runAnalysis() {
  showLoading('开始分析...');
  console.log('[App] runAnalysis started, connecting to EventSource...');

  return new Promise((resolve, reject) => {
    const eventSource = new EventSource('/api/analyze');
    console.log('[App] EventSource connected');

    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('[App] SSE message:', data);

      if (data.step === 'start') {
        updateLoading('处理文章...', 0);
      } else if (data.step === 'step1') {
        const percent = Math.round((data.current / data.total) * 60);
        updateLoading(data.message, percent);
      } else if (data.step === 'step2') {
        updateLoading(data.message, 70);
      } else if (data.step === 'step3') {
        updateLoading(data.message, 85);
      } else if (data.step === 'complete') {
        updateLoading('处理完成!', 100);
        eventSource.close();
        setTimeout(async () => {
          hideLoading();
          await Promise.all([
            fetchArticles(),
            fetchSummary(),
            fetchKeywords()
          ]);
          renderAll();
          resolve();
        }, 500);
      } else if (data.step === 'error') {
        eventSource.close();
        hideLoading();
        alert('分析失败: ' + data.message);
        reject(new Error(data.message));
      }
    };

    eventSource.onerror = (err) => {
      console.error('[App] EventSource error:', err);
      eventSource.close();
      hideLoading();
      reject(err);
    };
  });
}

// API Calls
async function fetchArticles() {
  try {
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mock: mockMode })
    });
    articles = await res.json();
  } catch (err) {
    console.error('Failed to fetch articles:', err);
  }
}

async function fetchSummary() {
  try {
    const res = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mock: mockMode })
    });
    summary = await res.json();
  } catch (err) {
    console.error('Failed to fetch summary:', err);
  }
}

async function fetchKeywords() {
  try {
    const res = await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mock: mockMode })
    });
    const data = await res.json();
    techKeywords = data.techKeywords;
    companies = data.companies;
    keywordMap = data.keywordMap;
  } catch (err) {
    console.error('Failed to fetch keywords:', err);
  }
}

// Render Functions
function renderAll() {
  renderFilters();
  renderArticles();
  renderSummary();
  renderKeywordChart();
}

function renderFilters() {
  const filterGroups = [
    { key: 'regions', label: '区域', values: ['国内', '国外'] },
    { key: 'companies', label: '公司', values: companies.slice(0, 8) },
    { key: 'tech', label: '技术', values: techKeywords.slice(0, 8) }
  ];

  filtersEl.innerHTML = filterGroups.map(group => `
    <div class="filter-group">
      <div class="label">${group.label}</div>
      ${group.values.map(v => `
        <span class="filter-btn ${getFilterClass(group.key, v)}" data-type="${group.key}" data-value="${v}">
          ${v}
        </span>
      `).join('')}
    </div>
  `).join('');

  // Add click handlers
  filtersEl.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const value = btn.dataset.value;

      if (activeFilters[type] === value) {
        activeFilters[type] = null;
      } else {
        activeFilters[type] = value;
      }
      renderFilters();
      renderArticles();
    });
  });
}

function getFilterClass(type, value) {
  return activeFilters[type] === value ? 'active' : '';
}

function filterArticle(article) {
  if (!article.keywords) return true;

  const cleanKeyword = (kw, map) => map[kw] || kw;

  if (activeFilters.regions && !article.keywords.regions?.includes(activeFilters.regions)) {
    return false;
  }
  if (activeFilters.companies) {
    const cleanedCompanies = article.keywords.companies?.map(c => cleanKeyword(c, keywordMap.companies || {})) || [];
    if (!cleanedCompanies.includes(activeFilters.companies)) {
      return false;
    }
  }
  if (activeFilters.tech) {
    const cleanedTech = article.keywords.tech?.map(t => cleanKeyword(t, keywordMap.tech || {})) || [];
    if (!cleanedTech.includes(activeFilters.tech)) {
      return false;
    }
  }
  if (activeFilters.products) {
    const cleanedProducts = article.keywords.products?.map(p => cleanKeyword(p, keywordMap.products || {})) || [];
    if (!cleanedProducts.includes(activeFilters.products)) {
      return false;
    }
  }
  return true;
}

function renderArticles() {
  // Sort articles by score descending
  const sortedArticles = Object.entries(articles)
    .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

  const filteredArticles = sortedArticles.filter(([, article]) => filterArticle(article));

  articlesListEl.innerHTML = filteredArticles.map(([key, article]) => `
    <div class="article-card" data-key="${key}">
      <a href="${article.link}" target="_blank" class="title">${article.translated_title || article.title || article.summary?.slice(0, 30)}</a>
      <div class="summary">${article.summary || ''}</div>
      <div class="meta">
        <span>${article.source || ''}</span>
        <span>评分: ${article.score || 0}</span>
      </div>
      ${article.keywords ? `
        <div class="keywords">
          ${article.keywords.regions?.map(r => `<span class="keyword-tag">${r}</span>`).join('') || ''}
          ${(article.keywords.companies?.map(c => keywordMap.companies?.[c] || c) || []).slice(0, 2).map(c => `<span class="keyword-tag">${c}</span>`).join('') || ''}
          ${[...new Set((article.keywords.tech?.map(t => keywordMap.tech?.[t] || t) || []))].slice(0, 3).map(t => `<span class="keyword-tag">${t}</span>`).join('') || ''}
        </div>
      ` : ''}
    </div>
  `).join('');

  // Add hover handler for radar chart
  articlesListEl.querySelectorAll('.article-card').forEach(card => {
    card.addEventListener('mouseenter', (e) => showRadarTooltip(e, card.dataset.key));
    card.addEventListener('mouseleave', hideRadarTooltip);
  });
}

function renderSummary() {
  // Highlights
  highlightsEl.innerHTML = (summary.highlights || []).map(h => `
    <div class="highlight-item">
      <div class="event">${h.event}</div>
      <div class="background">${h.background}</div>
      <div class="impact">${h.impact}</div>
    </div>
  `).join('') || '<p style="color:#999;font-size:13px;">暂无数据</p>';

  // Trends
  trendsEl.innerHTML = (summary.trends || []).map(t => `
    <div class="trend-item">${t}</div>
  `).join('') || '<p style="color:#999;font-size:13px;">暂无数据</p>';

  // Creative Ideas
  creativeIdeasEl.innerHTML = (summary.creative_ideas || []).map(i => `
    <div class="idea-item">${i}</div>
  `).join('') || '<p style="color:#999;font-size:13px;">暂无数据</p>';

  // Risks
  risksEl.innerHTML = (summary.risks || []).map(r => `
    <div class="risk-item">${r}</div>
  `).join('') || '<p style="color:#999;font-size:13px;">暂无数据</p>';
}

function renderKeywordChart() {
  // Bar chart: count tech keyword frequency
  const techCounts = {};
  Object.values(articles).forEach(article => {
    if (article.keywords) {
      article.keywords.tech?.forEach(t => {
        const cleanTech = keywordMap.tech?.[t] || t;
        techCounts[cleanTech] = (techCounts[cleanTech] || 0) + 1;
      });
    }
  });

  // Get top 10 tech for bar chart
  const topTech = Object.entries(techCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const maxTechCount = topTech.length > 0 ? topTech[0][1] : 1;

  keywordChartEl.innerHTML = `
    <div class="chart-section">
      <h3>技术关键词</h3>
      ${topTech.map(([name, count]) => `
        <div class="keyword-bar">
          <span class="name" title="${name}">${name}</span>
          <div class="bar">
            <div class="bar-fill" style="width: ${(count / maxTechCount) * 100}%"></div>
          </div>
          <span class="count">${count}</span>
        </div>
      `).join('')}
    </div>
    <div class="chart-section">
      <h3>公司分布</h3>
      <canvas id="company-pie" width="220" height="220"></canvas>
    </div>
  `;

  // Destroy existing pie chart if exists
  if (pieChart) {
    pieChart.destroy();
    pieChart = null;
  }

  // Draw pie chart for companies
  const companyCounts = {};
  Object.values(articles).forEach(article => {
    if (article.keywords) {
      article.keywords.companies?.forEach(c => {
        const cleanCompany = keywordMap.companies?.[c] || c;
        companyCounts[cleanCompany] = (companyCounts[cleanCompany] || 0) + 1;
      });
    }
  });

  const topCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const pieCanvas = document.getElementById('company-pie');
  if (pieCanvas && topCompanies.length > 0) {
    drawPieChart(topCompanies);
  }
}

// Pie Chart
let pieChart = null;

function drawPieChart(data) {
  if (pieChart) {
    pieChart.data.datasets[0].data = data.map(d => d[1]);
    pieChart.data.labels = data.map(d => d[0]);
    pieChart.update();
    return;
  }

  const ctx = document.getElementById('company-pie').getContext('2d');
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d[0]),
      datasets: [{
        data: data.map(d => d[1]),
        backgroundColor: ['#007AFF', '#5856D6', '#34C759', '#FF9500', '#FF3B30', '#AF52DE'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, padding: 8, font: { size: 11 } }
        }
      }
    }
  });
}

// Radar Chart Tooltip
let tooltipEl = null;
let radarChart = null;

function showRadarTooltip(e, articleKey) {
  const article = articles[articleKey];
  if (!article || !article.dimensions) return;

  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    tooltipEl.innerHTML = '<div class="radar-title"></div><canvas id="radar-canvas" width="300" height="300"></canvas>';
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.querySelector('.radar-title').textContent = article.translated_title || article.title || article.summary?.slice(0, 30) || '文章';

  const data = [
    article.dimensions.innovation,
    article.dimensions.business_impact,
    article.dimensions.quality,
    article.dimensions.industry_coverage,
    article.dimensions.reader_value
  ];

  if (radarChart) {
    radarChart.data.datasets[0].data = data;
    radarChart.update();
  } else {
    const ctx = document.getElementById('radar-canvas').getContext('2d');
    radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['技术创新性', '商业影响力', '文章/项目质量', '行业覆盖', '读者价值'],
        datasets: [{
          data: data,
          backgroundColor: 'rgba(0, 122, 255, 0.2)',
          borderColor: '#007AFF',
          borderWidth: 2,
          pointBackgroundColor: '#007AFF',
          pointRadius: 4
        }]
      },
      options: {
        responsive: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 25, display: false },
            grid: { color: '#e0e0e0' },
            pointLabels: {
              font: { size: 12 },
              color: '#495057'
            }
          }
        }
      }
    });
  }

  tooltipEl.style.display = 'block';
  const card = e.target.closest('.article-card');
  const rect = card.getBoundingClientRect();
  const tooltipRect = tooltipEl.getBoundingClientRect();

  // Horizontal: prefer right side, flip to left if overflowing
  let left = rect.right + 10;
  if (left + tooltipRect.width > window.innerWidth) {
    left = rect.left - tooltipRect.width - 10;
  }
  // Clamp to viewport
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));

  // Vertical: align top with card, but shift up if overflowing bottom
  let top = rect.top;
  if (top + tooltipRect.height > window.innerHeight) {
    top = window.innerHeight - tooltipRect.height - 8;
  }
  // Clamp to viewport top
  top = Math.max(8, top);

  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
}

function hideRadarTooltip() {
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
}

// Start
init();