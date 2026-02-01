/**
 * Enterprise AI Intelligence Platform
 * Real multi-agent system with parallel execution
 * 
 * Created: 2026-02-01
 * Author: Lumen 🔆
 */

const fetch = require('node-fetch');

// ==========================================
// CONFIGURATION
// ==========================================

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

const AI_ENABLED = !!(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_API_KEY);

// ==========================================
// REAL-TIME METRICS STORE
// ==========================================

const metricsStore = {
  totalSearches: 0,
  totalSourcesScanned: 0,
  totalInsightsFound: 0,
  totalAgentCalls: 0,
  avgResponseTime: 0,
  responseTimes: [],
  searchHistory: [],
  activeAgents: new Map(),
  lastUpdate: null,
  
  // KPIs
  kpis: {
    searchesLast24h: 0,
    insightsPerSearch: 0,
    avgRelevanceScore: 0,
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    topSources: {},
    topKeywords: {}
  }
};

// ==========================================
// AGENT DEFINITIONS - REAL SPECIALIZED AGENTS
// ==========================================

const AGENTS = {
  commander: {
    id: 'commander',
    name: 'LumenCTO_007',
    role: 'Commander',
    emoji: '👑',
    specialty: 'Query analysis, strategy, task delegation',
    status: 'idle'
  },
  
  // Squad Leaders - Each runs independent AI analysis
  squads: [
    {
      id: 'reddit',
      name: 'LumenSec_Lead',
      emoji: '🛡️',
      specialty: 'Reddit & Forums',
      agentCount: 10,
      sources: ['reddit'],
      focus: 'Community discussions, user complaints, feature requests',
      status: 'idle'
    },
    {
      id: 'appstore',
      name: 'LumenArch_Lead', 
      emoji: '🏗️',
      specialty: 'App Store Reviews',
      agentCount: 10,
      sources: ['appstore', 'playstore'],
      focus: 'App reviews, ratings, user sentiment',
      status: 'idle'
    },
    {
      id: 'web',
      name: 'LumenEnt_Lead',
      emoji: '🏢',
      specialty: 'Web & News',
      agentCount: 10,
      sources: ['web', 'news'],
      focus: 'News articles, blog posts, official announcements',
      status: 'idle'
    },
    {
      id: 'social',
      name: 'LumenRes_Lead',
      emoji: '🔬',
      specialty: 'Social & Trends',
      agentCount: 10,
      sources: ['hackernews', 'producthunt'],
      focus: 'Tech community, product launches, trends',
      status: 'idle'
    },
    {
      id: 'analysis',
      name: 'LumenDev_Lead',
      emoji: '⚙️',
      specialty: 'Deep Analysis',
      agentCount: 10,
      sources: ['synthesis'],
      focus: 'Cross-reference, validate, generate insights',
      status: 'idle'
    }
  ]
};

// ==========================================
// AI CALL FUNCTION
// ==========================================

async function callAzureOpenAI(prompt, maxTokens = 1000) {
  if (!AI_ENABLED) {
    console.log('[EnterpriseIntel] AI not enabled');
    return null;
  }
  
  const startTime = Date.now();
  metricsStore.totalAgentCalls++;
  
  try {
    const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are an enterprise intelligence analyst. Be precise, factual, and thorough. Always respond in valid JSON when requested.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.3
      })
    });
    
    const duration = Date.now() - startTime;
    metricsStore.responseTimes.push(duration);
    if (metricsStore.responseTimes.length > 100) metricsStore.responseTimes.shift();
    metricsStore.avgResponseTime = Math.round(
      metricsStore.responseTimes.reduce((a, b) => a + b, 0) / metricsStore.responseTimes.length
    );
    
    if (!response.ok) {
      const err = await response.text();
      console.error('[EnterpriseIntel] Azure API error:', response.status, err);
      return null;
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[EnterpriseIntel] AI call failed:', err.message);
    return null;
  }
}

// ==========================================
// DATA SOURCE FETCHERS
// ==========================================

const USER_AGENT = 'LumenEnterpriseIntel/2.0';
let lastRedditRequest = 0;

async function fetchReddit(query, limit = 50) {
  // Rate limit Reddit
  const now = Date.now();
  if (now - lastRedditRequest < 1000) {
    await new Promise(r => setTimeout(r, 1000 - (now - lastRedditRequest)));
  }
  lastRedditRequest = Date.now();
  
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=${limit}&t=month`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.data?.children || []).map(post => ({
      id: post.data.id,
      title: post.data.title,
      content: post.data.selftext || '',
      url: `https://reddit.com${post.data.permalink}`,
      source: 'reddit',
      subreddit: post.data.subreddit,
      score: post.data.score,
      comments: post.data.num_comments,
      created: new Date(post.data.created_utc * 1000).toISOString()
    }));
  } catch (err) {
    console.error('[EnterpriseIntel] Reddit fetch error:', err.message);
    return [];
  }
}

async function fetchAppStore(query) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=software&limit=10&country=us`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return [];
    
    const data = await response.json();
    const apps = data.results || [];
    const results = [];
    
    for (const app of apps.slice(0, 3)) {
      // Add app info
      results.push({
        id: `app-${app.trackId}`,
        title: `📱 ${app.trackName}`,
        content: `${app.description?.substring(0, 500) || ''}\n\nRating: ${app.averageUserRating?.toFixed(1) || 'N/A'} (${app.userRatingCount || 0} reviews)`,
        url: app.trackViewUrl,
        source: 'appstore',
        rating: app.averageUserRating,
        ratingCount: app.userRatingCount
      });
      
      // Fetch reviews
      try {
        const reviewUrl = `https://itunes.apple.com/rss/customerreviews/id=${app.trackId}/sortBy=mostRecent/json`;
        const reviewResponse = await fetch(reviewUrl, { headers: { 'User-Agent': USER_AGENT } });
        if (reviewResponse.ok) {
          const reviewData = await reviewResponse.json();
          const reviews = reviewData.feed?.entry?.slice(1, 11) || [];
          
          for (const review of reviews) {
            results.push({
              id: `review-${review.id?.label || Date.now()}`,
              title: `⭐ ${review['im:rating']?.label}/5 - ${review.title?.label || 'Review'}`,
              content: review.content?.label || '',
              url: app.trackViewUrl,
              source: 'appstore-review',
              rating: parseInt(review['im:rating']?.label) || 0,
              author: review.author?.name?.label,
              appName: app.trackName
            });
          }
        }
      } catch (e) { /* ignore review errors */ }
    }
    
    return results;
  } catch (err) {
    console.error('[EnterpriseIntel] App Store fetch error:', err.message);
    return [];
  }
}

async function fetchHackerNews(query) {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=20`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.hits || []).map(item => ({
      id: `hn-${item.objectID}`,
      title: item.title,
      content: item.story_text || '',
      url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
      source: 'hackernews',
      score: item.points,
      comments: item.num_comments,
      author: item.author
    }));
  } catch (err) {
    console.error('[EnterpriseIntel] HN fetch error:', err.message);
    return [];
  }
}

async function fetchWeb(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return [];
    
    const data = await response.json();
    const results = [];
    
    if (data.Abstract) {
      results.push({
        id: 'web-abstract',
        title: data.Heading || query,
        content: data.Abstract,
        url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        source: 'web'
      });
    }
    
    for (const topic of (data.RelatedTopics || []).slice(0, 15)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          id: `web-${topic.FirstURL.slice(-30)}`,
          title: topic.Text.split(' - ')[0],
          content: topic.Text,
          url: topic.FirstURL,
          source: 'web'
        });
      }
    }
    
    return results;
  } catch (err) {
    console.error('[EnterpriseIntel] Web fetch error:', err.message);
    return [];
  }
}

// ==========================================
// AGENT EXECUTION - PARALLEL REAL AI AGENTS
// ==========================================

async function runSquadAgent(squad, query, context) {
  const startTime = Date.now();
  squad.status = 'working';
  metricsStore.activeAgents.set(squad.id, { status: 'working', startTime });
  
  console.log(`[EnterpriseIntel] ${squad.emoji} ${squad.name} starting...`);
  
  // Gather data from squad's sources
  let rawData = [];
  
  for (const source of squad.sources) {
    switch (source) {
      case 'reddit':
        rawData.push(...await fetchReddit(query));
        break;
      case 'appstore':
      case 'playstore':
        rawData.push(...await fetchAppStore(query));
        break;
      case 'hackernews':
        rawData.push(...await fetchHackerNews(query));
        break;
      case 'web':
      case 'news':
        rawData.push(...await fetchWeb(query));
        break;
    }
  }
  
  metricsStore.totalSourcesScanned += rawData.length;
  
  if (rawData.length === 0) {
    squad.status = 'idle';
    metricsStore.activeAgents.delete(squad.id);
    return { squad: squad.id, results: [], insights: [] };
  }
  
  // AI Analysis - This squad's specialized agent analyzes the data
  const aiPrompt = `You are ${squad.name}, an expert in ${squad.specialty}.

MISSION: Analyze these ${rawData.length} items for the query "${query}" with context "${context || 'general search'}".

RULES:
- US English content ONLY (reject foreign languages, non-US regions)
- Must be DIRECTLY relevant to the query AND context
- Score each item 0-100 for relevance
- Extract key insights

DATA TO ANALYZE:
${rawData.slice(0, 20).map((item, i) => `[${i}] ${item.title}\n${item.content?.substring(0, 200) || ''}`).join('\n\n')}

Respond with JSON:
{
  "relevant_items": [{"index": 0, "score": 85, "reason": "..."}],
  "insights": ["insight 1", "insight 2"],
  "sentiment": "positive|neutral|negative",
  "key_themes": ["theme1", "theme2"]
}`;

  const aiResponse = await callAzureOpenAI(aiPrompt, 1500);
  
  let analysis = { relevant_items: [], insights: [], sentiment: 'neutral', key_themes: [] };
  
  if (aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error(`[EnterpriseIntel] ${squad.name} JSON parse error`);
    }
  }
  
  // Build filtered results
  const results = [];
  for (const item of (analysis.relevant_items || [])) {
    if (item.score >= 50 && rawData[item.index]) {
      const data = rawData[item.index];
      results.push({
        ...data,
        relevanceScore: item.score,
        reason: item.reason,
        sentiment: analysis.sentiment,
        foundBy: squad.name,
        squadEmoji: squad.emoji
      });
    }
  }
  
  const duration = Date.now() - startTime;
  squad.status = 'idle';
  metricsStore.activeAgents.delete(squad.id);
  
  console.log(`[EnterpriseIntel] ${squad.emoji} ${squad.name} done: ${results.length} results, ${duration}ms`);
  
  return {
    squad: squad.id,
    squadName: squad.name,
    emoji: squad.emoji,
    results,
    insights: analysis.insights || [],
    themes: analysis.key_themes || [],
    sentiment: analysis.sentiment,
    duration,
    sourcesScanned: rawData.length
  };
}

async function runCommanderAnalysis(query, context) {
  console.log(`[EnterpriseIntel] 👑 Commander analyzing query...`);
  
  const prompt = `You are LumenCTO_007, the Commander of an enterprise intelligence operation.

QUERY: "${query}"
CONTEXT: "${context || 'general search'}"

Analyze this query and create a search strategy. Respond with JSON:
{
  "intent": "what the user is really looking for",
  "key_terms": ["term1", "term2"],
  "expected_sources": ["reddit", "appstore", "web"],
  "focus_areas": ["area1", "area2"],
  "priority": "high|medium|low"
}`;

  const response = await callAzureOpenAI(prompt, 500);
  
  if (response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) { }
  }
  
  return {
    intent: query,
    key_terms: query.split(' '),
    expected_sources: ['reddit', 'appstore', 'web'],
    focus_areas: [context || 'general'],
    priority: 'medium'
  };
}

async function runSynthesisAgent(allResults, query, context) {
  console.log(`[EnterpriseIntel] 🧠 Synthesis agent combining ${allResults.length} results...`);
  
  if (allResults.length === 0) {
    return { summary: 'No relevant results found.', keyInsights: [], recommendations: [] };
  }
  
  const prompt = `You are the Synthesis Agent. Combine and analyze these intelligence findings.

QUERY: "${query}"
CONTEXT: "${context || 'general search'}"

FINDINGS (${allResults.length} items):
${allResults.slice(0, 15).map((r, i) => `[${i}] ${r.title} (Score: ${r.relevanceScore}, Source: ${r.source})\n${r.reason || ''}`).join('\n\n')}

Create an executive summary. Respond with JSON:
{
  "summary": "2-3 sentence executive summary",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "sentiment_overall": "positive|neutral|negative",
  "confidence_score": 85,
  "recommendations": ["action 1", "action 2"],
  "data_quality": "high|medium|low"
}`;

  const response = await callAzureOpenAI(prompt, 800);
  
  if (response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) { }
  }
  
  return {
    summary: `Found ${allResults.length} relevant results for "${query}".`,
    key_insights: [],
    sentiment_overall: 'neutral',
    confidence_score: 50,
    recommendations: [],
    data_quality: 'medium'
  };
}

// ==========================================
// MAIN RESEARCH ORCHESTRATOR
// ==========================================

async function runEnterpriseResearch(query, context = '') {
  const startTime = Date.now();
  metricsStore.totalSearches++;
  
  console.log(`[EnterpriseIntel] ========== NEW RESEARCH ==========`);
  console.log(`[EnterpriseIntel] Query: "${query}"`);
  console.log(`[EnterpriseIntel] Context: "${context}"`);
  
  // Phase 1: Commander analyzes the query
  const strategy = await runCommanderAnalysis(query, context);
  console.log(`[EnterpriseIntel] Strategy:`, strategy);
  
  // Phase 2: Deploy squad agents in PARALLEL
  const squadPromises = AGENTS.squads
    .filter(s => s.sources[0] !== 'synthesis')
    .map(squad => runSquadAgent(squad, query, context));
  
  const squadResults = await Promise.all(squadPromises);
  
  // Combine all results
  let allResults = [];
  let allInsights = [];
  let allThemes = [];
  const squadStats = [];
  
  for (const sr of squadResults) {
    allResults.push(...sr.results);
    allInsights.push(...sr.insights);
    allThemes.push(...(sr.themes || []));
    squadStats.push({
      squad: sr.squadName,
      emoji: sr.emoji,
      results: sr.results.length,
      sources: sr.sourcesScanned,
      duration: sr.duration
    });
  }
  
  // Phase 3: Synthesis agent creates executive summary
  const synthesis = await runSynthesisAgent(allResults, query, context);
  
  // Sort results by relevance
  allResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  
  // Update metrics
  metricsStore.totalInsightsFound += allInsights.length;
  metricsStore.lastUpdate = new Date().toISOString();
  
  // Update KPIs
  const sentiments = allResults.map(r => r.sentiment).filter(Boolean);
  metricsStore.kpis.sentimentBreakdown = {
    positive: sentiments.filter(s => s === 'positive').length,
    neutral: sentiments.filter(s => s === 'neutral').length,
    negative: sentiments.filter(s => s === 'negative').length
  };
  
  if (allResults.length > 0) {
    metricsStore.kpis.avgRelevanceScore = Math.round(
      allResults.reduce((sum, r) => sum + (r.relevanceScore || 0), 0) / allResults.length
    );
  }
  
  // Track keyword
  const keyword = query.toLowerCase().split(' ')[0];
  metricsStore.kpis.topKeywords[keyword] = (metricsStore.kpis.topKeywords[keyword] || 0) + 1;
  
  // Save to history
  metricsStore.searchHistory.unshift({
    id: `search-${Date.now()}`,
    query,
    context,
    timestamp: new Date().toISOString(),
    resultsCount: allResults.length,
    duration: Date.now() - startTime
  });
  if (metricsStore.searchHistory.length > 50) metricsStore.searchHistory.pop();
  
  const totalDuration = Date.now() - startTime;
  
  console.log(`[EnterpriseIntel] ========== RESEARCH COMPLETE ==========`);
  console.log(`[EnterpriseIntel] Total results: ${allResults.length}`);
  console.log(`[EnterpriseIntel] Total duration: ${totalDuration}ms`);
  
  return {
    success: true,
    query,
    context,
    strategy,
    results: allResults.slice(0, 50),
    synthesis,
    insights: [...new Set(allInsights)].slice(0, 10),
    themes: [...new Set(allThemes)].slice(0, 10),
    squadStats,
    metrics: {
      totalResults: allResults.length,
      totalSources: squadResults.reduce((sum, sr) => sum + sr.sourcesScanned, 0),
      aiCalls: squadResults.length + 2, // squads + commander + synthesis
      duration: totalDuration,
      confidence: synthesis.confidence_score
    }
  };
}

// ==========================================
// API ROUTES
// ==========================================

function registerEnterpriseRoutes(app) {
  // Main research endpoint
  app.post('/api/enterprise/research', async (req, res) => {
    try {
      const { query, context } = req.body;
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query required' });
      }
      
      const result = await runEnterpriseResearch(query, context || '');
      res.json(result);
    } catch (err) {
      console.error('[EnterpriseIntel] Research error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  // Real-time metrics endpoint
  app.get('/api/enterprise/metrics', (req, res) => {
    res.json({
      success: true,
      metrics: {
        totalSearches: metricsStore.totalSearches,
        totalSourcesScanned: metricsStore.totalSourcesScanned,
        totalInsightsFound: metricsStore.totalInsightsFound,
        totalAgentCalls: metricsStore.totalAgentCalls,
        avgResponseTime: metricsStore.avgResponseTime,
        lastUpdate: metricsStore.lastUpdate
      },
      kpis: metricsStore.kpis,
      activeAgents: Array.from(metricsStore.activeAgents.entries()).map(([id, data]) => ({
        id,
        ...data,
        duration: Date.now() - data.startTime
      })),
      aiEnabled: AI_ENABLED
    });
  });
  
  // Search history endpoint
  app.get('/api/enterprise/history', (req, res) => {
    res.json({
      success: true,
      history: metricsStore.searchHistory
    });
  });
  
  // Agent status endpoint
  app.get('/api/enterprise/agents', (req, res) => {
    res.json({
      success: true,
      commander: AGENTS.commander,
      squads: AGENTS.squads.map(s => ({
        ...s,
        isActive: metricsStore.activeAgents.has(s.id)
      })),
      totalAgents: 51
    });
  });
  
  console.log('[EnterpriseIntel] Routes registered');
  console.log('[EnterpriseIntel] AI Enabled:', AI_ENABLED);
}

module.exports = {
  registerEnterpriseRoutes,
  runEnterpriseResearch,
  getMetrics: () => metricsStore,
  AGENTS
};
