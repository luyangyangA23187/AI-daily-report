const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'llm_log.txt');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function writeLog(...args) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] ${args.join(' ')}`;
  console.log(msg);
  logStream.write(msg + '\n');
}

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const SYSTEM_PROMPT_ARTICLE = `你是一个AI资讯评分专家。请根据用户提供的文章信息从以下维度评分，每项0-100，最终输出加权平均分（权重各20%）：

【评分标准细则 - 严格按此标准评分】

1. 技术创新性（0-100）：
   - 90-100：首创性技术突破、新范式、颠覆性架构创新
   - 70-89：有实质改进的新技术实现、知名项目重大版本更新
   - 50-69：新技术应用、已知技术的新组合
   - 30-49：对现有技术的增量优化、小幅改进
   - 0-29：常规更新、已知技术的简单引用

2. 商业影响力（0-100）：
   - 90-100：改变行业格局、对大型公司有重大影响、涉及亿美元以上
   - 70-89：影响特定市场段、对中型公司有显著影响
   - 50-69：对部分用户群体有可感知影响
   - 30-49：影响有限、边缘市场或小众用户
   - 0-29：几乎无商业影响

3. 文章/项目质量（0-100）：
   【评估内容质量 - 区分文章报道与 GitHub 项目】
   
   【文章质量评分标准】
   - 90-100：深度分析、首發报道、独家内容
   - 70-89：完整报道、重要事件综述
   - 50-69：常规新闻、资讯汇总
   - 30-49：简讯、片段信息
   - 0-29：注水内容、无实质信息

   【GitHub 项目质量评分标准 - stars 加分规则】
   - stars > 100k：顶级项目 → 88-93区间
   - stars 50k-100k：重要项目 → 80-87区间
   - stars 20k-50k：知名项目 → 72-79区间
   - stars 10k-20k：活跃项目 → 64-71区间
   - stars 5k-10k：新兴项目 → 56-63区间
   - stars 1k-5k：起步项目 → 48-55区间
   - stars 500-1k：基础项目 → 40-47区间
   - stars 100-500：小众项目 → 32-39区间
   - stars < 100：基础分不变

4. 行业覆盖广度（0-100）：
   - 90-100：跨多个行业、基础设施级别
   - 70-89：影响一个主要行业及关联领域
   - 50-69：影响特定行业子领域
   - 30-49：影响少数特定用户群
   - 0-29：极窄受众

5. 读者价值（0-100）：
   - 90-100：可直接指导实践、有具体操作建议、高优先级必读
   - 70-89：有参考价值、能获得新视角
   - 50-69：值得了解、内容有用但非关键
   - 30-49：娱乐性阅读、无实际操作价值
   - 0-29：无价值、浪费时间

最终评分=各维度×0.2之和，保留1位小数。

同时提取关键词和补充信息（没有就不写，不要硬凑）。

补充信息要求每条必须包含：背景+结论+影响/启示。不要只描述现象，要让人知道"所以呢"。

补充信息类型（全部面向读者，从读者角度出发，有则写，没有不用硬加）：
- 风险信号：对读者有什么风险/威胁，读者需要警惕什么
- 成本变化：对读者的AI使用成本有什么影响，读者需要注意什么
- 竞争格局变化：对读者所在行业意味着什么，读者需要关注什么
- 值得一试的创意：读者可以怎么用，从哪里入手

错误示例（站在公司角度）：
"建议Anthropic加强评估协议并定期审视模型行为模式"

正确示例（面向读者）：
"Opus 4.8可能发展出'被评估感知'，输出结果可能已不客观——读者在重要决策中应额外验证模型输出"

输出JSON格式：
{
  "translated_title": "中文标题（英文标题才需要翻译）",
  "summary": "40-50字中文摘要（即便原文已有摘要也要重新总结）",
  "score": 最终评分0-100,
  "dimensions": {
    "innovation": 评分0-100,
    "business_impact": 评分0-100,
    "quality": 评分0-100,
    "industry_coverage": 评分0-100,
    "reader_value": 评分0-100
  },
  "keywords": {
    "regions": ["国内"或"国外",无其他选项],
    "companies": ["公司名"],
    "tech": ["技术词"],
    "products": ["产品名"]
  },
  "extras": ["补充信息1", "补充信息2"]
}`;

const SYSTEM_PROMPT_KEYWORD = `以下是从各篇文章提取的关键词，存在语义重复和不规范，请生成标准化映射：

输出JSON格式：
{
  "companies": {
    "映射前": "映射后"
  },
  "tech": {
    "映射前": "映射后"
  },
  "products": {
    "映射前": "映射后"
  }
}

原则：
- 语义相同的词统一为一个
- 格式统一（如token/Token → token）
- tech关键词可以合并为大概念（如 KV Cache/PagedAttention/FlashAttention → 推理优化），保留3-5个核心概念即可
- 保留原始大小写作为映射前`;

const SYSTEM_PROMPT_SUMMARY = `你是一个AI资讯分析师。请分析用户提供的所有文章，合并相似信息，重点突出，输出结构化简报。

要求：
- highlights（重要事件）：2-4条，每条讲清楚事件、背景、影响
- trends（趋势判断）：2-4条，每条讲清楚趋势逻辑
- creative_ideas（值得一试的创意）：2-4条，每条讲清楚具体操作方向
- risks（风险提示）：2-4条，每条讲清楚风险点和建议

输出JSON格式：
{
  "highlights": [
    {
      "event": "事件标题（简短有力）",
      "background": "关键背景",
      "impact": "对行业/读者影响"
    }
  ],
  "trends": ["趋势判断1", "趋势判断2"],
  "creative_ideas": ["值得一试的创意1", "值得一试的创意2"],
  "risks": ["风险提示1", "风险提示2"]
}`;

async function createCompletion(messages, model = 'deepseek-v4-pro', options = {}) {
  writeLog('[LLM] Calling DeepSeek API with model:', model);
  writeLog('[LLM] Messages:', JSON.stringify(messages, null, 2));
  const completion = await openai.chat.completions.create({
    messages,
    model,
    thinking: { type: 'enabled' },
    reasoning_effort: 'high',
    stream: false,
    ...options,
  });
  const content = completion.choices[0].message.content;
  writeLog('[LLM] Response:', content);
  return content;
}

async function createCompletionWithRetry(messages, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      writeLog(`[LLM] Attempt ${i + 1}/${maxRetries}`);
      const content = await createCompletion(messages);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        writeLog('[LLM] JSON parsed successfully');
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON found in response');
    } catch (err) {
      lastError = err;
      writeLog(`[LLM] Error: ${err.message}`);
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        writeLog(`[LLM] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function step1ProcessArticles(articles, onProgress) {
  const total = articles.length;
  let completed = 0;

  const processArticle = async (article, index) => {
    const starsInfo = article.stars ? `\n- Stars：${article.stars}k` : '';
    const userPrompt = `文章信息：
- 标题：${article.title}
- 摘要：${article.abstract}
- 来源：${article.source}${starsInfo}`;

    const result = await createCompletionWithRetry([
      { role: 'system', content: SYSTEM_PROMPT_ARTICLE },
      { role: 'user', content: userPrompt }
    ]);

    completed++;
    onProgress && onProgress('step1', completed, total, `处理文章 ${completed}/${total}`);

    return {
      key: `artical_${index}`,
      data: {
        link: article.link,
        title: article.title,
        abstract: article.abstract,
        publishTime: article.publishTime,
        source: article.source,
        ...result
      }
    };
  };

  const results = await Promise.all(
    articles.map((article, index) => processArticle(article, index + 1))
  );

  const processed = {};
  for (const { key, data } of results) {
    processed[key] = data;
  }
  return processed;
}

async function step2GenerateKeywordMap(processedArticles, onProgress) {
  const allCompanies = new Set();
  const allTech = new Set();
  const allProducts = new Set();

  for (const article of Object.values(processedArticles)) {
    if (article.keywords) {
      article.keywords.companies?.forEach(c => allCompanies.add(c));
      article.keywords.tech?.forEach(t => allTech.add(t));
      article.keywords.products?.forEach(p => allProducts.add(p));
    }
  }

  const userPrompt = `companies: ${JSON.stringify(Array.from(allCompanies))}
tech: ${JSON.stringify(Array.from(allTech))}
products: ${JSON.stringify(Array.from(allProducts))}`;

  onProgress && onProgress('step2', 0, 1, '生成关键词映射表...');
  const result = await createCompletionWithRetry([
    { role: 'system', content: SYSTEM_PROMPT_KEYWORD },
    { role: 'user', content: userPrompt }
  ]);
  onProgress && onProgress('step2', 1, 1, '关键词映射表生成完成');

  return result;
}

async function step3GenerateDailySummary(processedArticles, keywordMap, onProgress) {
  const articlesWithCleanKeywords = {};
  for (const [key, article] of Object.entries(processedArticles)) {
    articlesWithCleanKeywords[key] = cleanArticleKeywords(article, keywordMap);
  }

  const userPrompt = `文章数据：
${JSON.stringify(articlesWithCleanKeywords, null, 2)}`;

  onProgress && onProgress('step3', 0, 1, '生成日报总结...');
  const result = await createCompletionWithRetry([
    { role: 'system', content: SYSTEM_PROMPT_SUMMARY },
    { role: 'user', content: userPrompt }
  ]);
  onProgress && onProgress('step3', 1, 1, '日报总结生成完成');

  return result;
}

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

async function runAnalysisPipeline(onProgress) {
  const rawDataPath = path.join(__dirname, 'data.json');
  const llmDataPath = path.join(__dirname, 'llmData.json');

  const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));
  writeLog('[Pipeline] Loaded', rawData.length, 'articles from data.json');

  onProgress && onProgress('start', 0, rawData.length, '开始处理文章...');
  writeLog('[Pipeline] Starting step1: process articles');

  const processedArticles = await step1ProcessArticles(rawData, onProgress);
  writeLog('[Pipeline] Step1 complete, processed', Object.keys(processedArticles).length, 'articles');

  writeLog('[Pipeline] Starting step2: generate keyword map');
  const keywordMap = await step2GenerateKeywordMap(processedArticles, onProgress);
  writeLog('[Pipeline] Step2 complete, keywordMap:', JSON.stringify(keywordMap));

  writeLog('[Pipeline] Starting step3: generate daily summary');
  const dailySummary = await step3GenerateDailySummary(processedArticles, keywordMap, onProgress);
  writeLog('[Pipeline] Step3 complete, dailySummary:', JSON.stringify(dailySummary));

  const finalData = {
    ...processedArticles,
    keywordMap,
    dailySummary
  };

  writeLog('[Pipeline] Writing to llmData.json');
  fs.writeFileSync(llmDataPath, JSON.stringify(finalData, null, 2));

  return finalData;
}

module.exports = { createCompletion, createCompletionWithRetry, runAnalysisPipeline, cleanArticleKeywords };
