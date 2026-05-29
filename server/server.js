require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { runAnalysisPipeline, cleanArticleKeywords } = require('./llm');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const mockData = require('./mock.json');
const rawData = require('./data.json');

const LLM_DATA_PATH = path.join(__dirname, 'llmData.json');

function loadLlmData() {
  if (fs.existsSync(LLM_DATA_PATH)) {
    return JSON.parse(fs.readFileSync(LLM_DATA_PATH, 'utf8'));
  }
  return null;
}

function getMockParam(req) {
  return req.body.mock === true || req.body.mock === 'true';
}

function getArticlesFromData(data, isArray = false) {
  if (isArray) {
    const articles = {};
    data.forEach((article, index) => {
      articles[`artical_${index + 1}`] = article;
    });
    return articles;
  }
  const articles = {};
  for (const key of Object.keys(data)) {
    if (key.startsWith('artical_')) {
      articles[key] = data[key];
    }
  }
  return articles;
}

app.post('/api/articles', (req, res) => {
  const useMock = getMockParam(req);
  console.log('[Server] /api/articles called, useMock:', useMock);

  if (useMock) {
    const mockArticles = mockData.articals || mockData;
    const articles = getArticlesFromData(mockArticles);
    const keywordMap = mockData.keywordMap || {};
    const result = {};
    Object.keys(articles).forEach(key => {
      result[key] = cleanArticleKeywords(articles[key], keywordMap);
    });
    return res.json(result);
  }

  const llmData = loadLlmData();
  if (llmData) {
    const articles = getArticlesFromData(llmData);
    const keywordMap = llmData.keywordMap || {};
    const result = {};
    Object.keys(articles).forEach(key => {
      result[key] = cleanArticleKeywords(articles[key], keywordMap);
    });
    return res.json(result);
  }

  const articles = getArticlesFromData(rawData, true);
  res.json(articles);
});

app.post('/api/summary', (req, res) => {
  const useMock = getMockParam(req);
  console.log('[Server] /api/summary called, useMock:', useMock);

  if (useMock) {
    return res.json(mockData.dailySummary || { highlights: [], trends: [], creative_ideas: [], risks: [] });
  }

  const llmData = loadLlmData();
  if (llmData && llmData.dailySummary) {
    return res.json(llmData.dailySummary);
  }

  res.json({ highlights: [], trends: [], creative_ideas: [], risks: [] });
});

app.post('/api/keywords', (req, res) => {
  const useMock = getMockParam(req);
  console.log('[Server] /api/keywords called, useMock:', useMock);

  if (useMock) {
    const mockArticles = mockData.articals || mockData;
    const articles = getArticlesFromData(mockArticles);
    const keywordsMap = mockData.keywordMap || {};
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

    return res.json({
      techKeywords: Array.from(tech).sort(),
      companies: Array.from(companies).sort(),
      keywordMap: {
        companies: keywordsMap.companies || {},
        tech: keywordsMap.tech || {},
        products: keywordsMap.products || {}
      }
    });
  }

  const llmData = loadLlmData();
  if (llmData) {
    const articles = getArticlesFromData(llmData);
    const keywordsMap = llmData.keywordMap || {};
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

    return res.json({
      techKeywords: Array.from(tech).sort(),
      companies: Array.from(companies).sort(),
      keywordMap: {
        companies: keywordsMap.companies || {},
        tech: keywordsMap.tech || {},
        products: keywordsMap.products || {}
      }
    });
  }

  res.json({ techKeywords: [], companies: [], keywordMap: { companies: {}, tech: {}, products: {} } });
});

app.get('/api/analyze', async (req, res) => {
  const useMock = req.query.mock === 'true';
  console.log('[Server] /api/analyze called, useMock:', useMock);

  if (useMock) {
    return res.json({
      success: true,
      message: 'Analysis complete (mock mode)',
      data: mockData
    });
  }

  console.log('[Server] Starting SSE stream for analysis...');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (step, current, total, message) => {
    res.write(`data: ${JSON.stringify({ step, current, total, message })}\n\n`);
  };

  try {
    const data = await runAnalysisPipeline(sendProgress);
    res.write(`data: ${JSON.stringify({ step: 'complete', current: 100, total: 100, message: '处理完成', data })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`data: ${JSON.stringify({ step: 'error', message: '处理失败: ' + err.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Mock mode: using mock.json for all data');
});
