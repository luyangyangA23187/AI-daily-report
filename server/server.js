const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Load mock data
const mockData = require('./mock.json');

// Helper: apply keywordMap to clean keywords in an article
function cleanArticleKeywords(article, keywordMap) {
  if (!article.keywords) return article;
  const clean = (list, map) => (list || []).map(kw => map[kw] || kw);
  return {
    ...article,
    keywords: {
      regions: article.keywords.regions,
      companies: [...new Set(clean(article.keywords.companies, keywordMap.companies || {}))],
      tech: [...new Set(clean(article.keywords.tech, keywordMap.tech || {}))],
      products: [...new Set(clean(article.keywords.products, keywordMap.products || {}))]
    }
  };
}

// GET /api/articles - Return all articles with enrichment data
app.get('/api/articles', (req, res) => {
  const articles = mockData.articals;
  const keywordMap = mockData.keywordMap || {};

  const result = {};
  Object.keys(articles).forEach(key => {
    result[key] = cleanArticleKeywords(articles[key], keywordMap);
  });

  res.json(result);
});

// GET /api/summary - Return left side summary
app.get('/api/summary', (req, res) => {
  res.json(mockData.dailySummary);
});

// GET /api/keywords - Return all keywords for filtering (cleaned via keywordMap)
app.get('/api/keywords', (req, res) => {
  const articles = mockData.articals;
  const keywordsMap = mockData.keywordMap || {};

  // Aggregate and clean keywords using keywordMap
  const cleanKeyword = (kw, map) => map[kw] || kw;

  const companies = new Set();
  const tech = new Set();
  const products = new Set();

  Object.values(articles).forEach(article => {
    if (article.keywords) {
      article.keywords.companies?.forEach(c => companies.add(cleanKeyword(c, keywordsMap.companies || {})));
      article.keywords.tech?.forEach(t => tech.add(cleanKeyword(t, keywordsMap.tech || {})));
      article.keywords.products?.forEach(p => products.add(cleanKeyword(p, keywordsMap.products || {})));
    }
  });

  // For bar chart: use tech keywords (already cleaned)
  // For pie chart: use companies (already cleaned)
  res.json({
    techKeywords: Array.from(tech).sort(),
    companies: Array.from(companies).sort(),
    keywordMap: {
      companies: keywordsMap.companies || {},
      tech: keywordsMap.tech || {},
      products: keywordsMap.products || {}
    }
  });
});

// POST /api/analyze - Trigger batch processing (mock for now)
// In production, this would:
// 1. Read data.json
// 2. Step 1: Call LLM for each article (with retry)
// 3. Step 2: Aggregate keywords, call LLM for mapping
// 4. Step 3: Call LLM for summary
// For now, just return the existing mock data
app.post('/api/analyze', (req, res) => {
  // In mock mode, just return success
  // In production, this would trigger the full pipeline
  res.json({
    success: true,
    message: 'Analysis complete (mock mode)',
    data: mockData
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Mock mode: using mock.json for all data');
});