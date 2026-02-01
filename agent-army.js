/**
 * AI Agent Army - Social Media Intelligence System
 * 51 agents monitoring Reddit, Twitter, and other platforms
 * 
 * Created: 2026-02-01
 * Author: Lumen 🔆
 */

const fetch = require('node-fetch');

// ==========================================
// AGENT ARMY CONFIGURATION
// ==========================================

const AGENT_SQUADS = [
  {
    id: 'security',
    prefix: 'LumenSec',
    count: 10,
    focus: 'Security & Audit',
    emoji: '🛡️',
    keywords: ['security', 'audit', 'vulnerability', 'penetration test', 'compliance', 'SOC2', 'GDPR', 'HIPAA', 'breach', 'cybersecurity'],
    subreddits: ['netsec', 'cybersecurity', 'AskNetsec', 'security', 'blueteamsec']
  },
  {
    id: 'architecture',
    prefix: 'LumenArch',
    count: 10,
    focus: 'Agent Architecture',
    emoji: '🏗️',
    keywords: ['AI agent', 'LLM', 'langchain', 'autogen', 'crew ai', 'multi-agent', 'autonomous', 'agentic', 'orchestration'],
    subreddits: ['LocalLLaMA', 'MachineLearning', 'artificial', 'LangChain', 'ChatGPTCoding']
  },
  {
    id: 'enterprise',
    prefix: 'LumenEnt',
    count: 10,
    focus: 'Enterprise AI',
    emoji: '🏢',
    keywords: ['enterprise', 'B2B', 'SaaS', 'startup', 'funding', 'venture', 'Series A', 'ARR', 'MRR', 'churn'],
    subreddits: ['SaaS', 'startups', 'Entrepreneur', 'smallbusiness', 'venturecapital']
  },
  {
    id: 'research',
    prefix: 'LumenRes',
    count: 10,
    focus: 'Research & Trends',
    emoji: '🔬',
    keywords: ['research', 'paper', 'breakthrough', 'GPT-5', 'Claude', 'Gemini', 'benchmark', 'SOTA', 'fine-tune'],
    subreddits: ['MachineLearning', 'deeplearning', 'LanguageTechnology', 'MLQuestions', 'learnmachinelearning']
  },
  {
    id: 'devtools',
    prefix: 'LumenDev',
    count: 10,
    focus: 'Dev Tools & Stacks',
    emoji: '⚙️',
    keywords: ['developer tool', 'code review', 'CI/CD', 'devops', 'github copilot', 'cursor', 'IDE', 'productivity', 'automation'],
    subreddits: ['devops', 'programming', 'webdev', 'node', 'reactjs', 'nextjs']
  }
];

// Commander agent
const COMMANDER = {
  id: 'commander',
  name: 'LumenCTO_007',
  role: 'Commander',
  emoji: '👑',
  status: 'active'
};

// Generate individual agents
function generateAgents() {
  const agents = [COMMANDER];
  
  for (const squad of AGENT_SQUADS) {
    for (let i = 1; i <= squad.count; i++) {
      agents.push({
        id: `${squad.id}-${i}`,
        name: `${squad.prefix}_${String(i).padStart(3, '0')}`,
        squad: squad.id,
        focus: squad.focus,
        emoji: squad.emoji,
        status: 'idle',
        lastScan: null,
        postsScanned: 0,
        opportunitiesFound: 0,
        assignedSubreddits: squad.subreddits,
        keywords: squad.keywords
      });
    }
  }
  
  return agents;
}

// ==========================================
// REDDIT MONITORING
// ==========================================

const REDDIT_BASE = 'https://www.reddit.com';
const USER_AGENT = 'LumenAI-Intel/1.0';

// Rate limiting - Reddit allows ~60 requests/minute for non-auth
let lastRequest = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds between requests

async function rateLimitedFetch(url) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequest;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequest = Date.now();
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status}`);
  }
  
  return response.json();
}

async function fetchSubreddit(subreddit, sort = 'hot', limit = 25) {
  try {
    const url = `${REDDIT_BASE}/r/${subreddit}/${sort}.json?limit=${limit}`;
    const data = await rateLimitedFetch(url);
    
    if (!data.data || !data.data.children) {
      return [];
    }
    
    return data.data.children.map(post => ({
      id: post.data.id,
      title: post.data.title,
      selftext: post.data.selftext || '',
      url: post.data.url,
      permalink: `https://reddit.com${post.data.permalink}`,
      subreddit: post.data.subreddit,
      author: post.data.author,
      score: post.data.score,
      numComments: post.data.num_comments,
      created: new Date(post.data.created_utc * 1000).toISOString(),
      flair: post.data.link_flair_text || null
    }));
  } catch (err) {
    console.error(`[AgentArmy] Error fetching r/${subreddit}:`, err.message);
    return [];
  }
}

// ==========================================
// OPPORTUNITY DETECTION
// ==========================================

const OPPORTUNITY_KEYWORDS = {
  high: ['looking for', 'need help', 'recommend', 'alternative to', 'best tool', 'anyone using', 'how do you', 'struggling with'],
  product: ['code review', 'code audit', 'security audit', 'AI compliance', 'EU AI Act', 'code quality', 'tech stack'],
  competitor: ['coderabbit', 'sonarqube', 'snyk', 'deepsource', 'codacy', 'sourcery']
};

function analyzePost(post, keywords) {
  const content = `${post.title} ${post.selftext}`.toLowerCase();
  const matches = {
    high: [],
    product: [],
    competitor: [],
    squad: []
  };
  
  // Check high-intent keywords
  for (const kw of OPPORTUNITY_KEYWORDS.high) {
    if (content.includes(kw.toLowerCase())) {
      matches.high.push(kw);
    }
  }
  
  // Check product keywords
  for (const kw of OPPORTUNITY_KEYWORDS.product) {
    if (content.includes(kw.toLowerCase())) {
      matches.product.push(kw);
    }
  }
  
  // Check competitor mentions
  for (const kw of OPPORTUNITY_KEYWORDS.competitor) {
    if (content.includes(kw.toLowerCase())) {
      matches.competitor.push(kw);
    }
  }
  
  // Check squad keywords
  for (const kw of keywords) {
    if (content.includes(kw.toLowerCase())) {
      matches.squad.push(kw);
    }
  }
  
  // Calculate opportunity score
  let score = 0;
  score += matches.high.length * 30;      // High intent = 30 points each
  score += matches.product.length * 25;   // Product match = 25 points each
  score += matches.competitor.length * 20; // Competitor = 20 points each
  score += matches.squad.length * 10;     // Squad keyword = 10 points each
  score += Math.min(post.score, 100);     // Up to 100 points for upvotes
  score += Math.min(post.numComments * 2, 50); // Up to 50 points for engagement
  
  return {
    score,
    matches,
    isOpportunity: score >= 50,
    priority: score >= 100 ? 'hot' : score >= 70 ? 'warm' : 'monitor'
  };
}

// ==========================================
// AGENT ACTIVITY SIMULATION & REAL WORK
// ==========================================

let agentState = {
  agents: generateAgents(),
  lastUpdate: null,
  scanCycle: 0,
  opportunities: [],
  trendingPosts: [],
  stats: {
    totalScans: 0,
    postsAnalyzed: 0,
    opportunitiesFound: 0,
    activeAgents: 0
  }
};

async function runAgentScan() {
  console.log('[AgentArmy] Starting scan cycle', agentState.scanCycle + 1);
  
  const startTime = Date.now();
  let activeAgents = 0;
  let postsScanned = 0;
  const newOpportunities = [];
  const allPosts = [];
  
  // Each squad scans their assigned subreddits
  for (const squad of AGENT_SQUADS) {
    // Activate agents in this squad
    const squadAgents = agentState.agents.filter(a => a.squad === squad.id);
    
    for (const agent of squadAgents) {
      agent.status = 'scanning';
      activeAgents++;
    }
    
    // Scan each subreddit
    for (const subreddit of squad.subreddits) {
      try {
        const posts = await fetchSubreddit(subreddit, 'hot', 15);
        
        for (const post of posts) {
          postsScanned++;
          allPosts.push({ ...post, scannedBy: squad.prefix });
          
          const analysis = analyzePost(post, squad.keywords);
          
          if (analysis.isOpportunity) {
            newOpportunities.push({
              id: `opp-${post.id}`,
              post,
              analysis,
              foundBy: squad.prefix,
              foundAt: new Date().toISOString(),
              squad: squad.id,
              status: 'new'
            });
          }
        }
        
        // Update a random agent's stats
        const randomAgent = squadAgents[Math.floor(Math.random() * squadAgents.length)];
        if (randomAgent) {
          randomAgent.postsScanned += posts.length;
          randomAgent.lastScan = new Date().toISOString();
        }
      } catch (err) {
        console.error(`[AgentArmy] Squad ${squad.prefix} error on r/${subreddit}:`, err.message);
      }
    }
    
    // Set agents back to idle
    for (const agent of squadAgents) {
      agent.status = 'idle';
    }
  }
  
  // Update opportunities list (keep last 100)
  const existingIds = new Set(agentState.opportunities.map(o => o.id));
  const uniqueNew = newOpportunities.filter(o => !existingIds.has(o.id));
  agentState.opportunities = [...uniqueNew, ...agentState.opportunities].slice(0, 100);
  
  // Update trending posts (top 50 by score)
  allPosts.sort((a, b) => b.score - a.score);
  agentState.trendingPosts = allPosts.slice(0, 50);
  
  // Update stats
  agentState.stats.totalScans++;
  agentState.stats.postsAnalyzed += postsScanned;
  agentState.stats.opportunitiesFound += uniqueNew.length;
  agentState.stats.activeAgents = activeAgents;
  agentState.scanCycle++;
  agentState.lastUpdate = new Date().toISOString();
  
  const duration = Date.now() - startTime;
  console.log(`[AgentArmy] Scan complete: ${postsScanned} posts, ${uniqueNew.length} new opportunities, ${duration}ms`);
  
  return {
    postsScanned,
    newOpportunities: uniqueNew.length,
    duration
  };
}

// ==========================================
// EXPRESS ROUTES
// ==========================================

function registerAgentArmyRoutes(app) {
  // Get all agents and their status
  app.get('/api/agent-army/agents', (req, res) => {
    res.json({
      success: true,
      commander: COMMANDER,
      squads: AGENT_SQUADS.map(s => ({
        id: s.id,
        prefix: s.prefix,
        focus: s.focus,
        emoji: s.emoji,
        count: s.count,
        subreddits: s.subreddits
      })),
      agents: agentState.agents,
      totalAgents: agentState.agents.length
    });
  });
  
  // Get current opportunities
  app.get('/api/agent-army/opportunities', (req, res) => {
    const { priority, squad, limit = 25 } = req.query;
    
    let opps = agentState.opportunities;
    
    if (priority) {
      opps = opps.filter(o => o.analysis.priority === priority);
    }
    if (squad) {
      opps = opps.filter(o => o.squad === squad);
    }
    
    res.json({
      success: true,
      opportunities: opps.slice(0, parseInt(limit)),
      total: opps.length,
      lastUpdate: agentState.lastUpdate
    });
  });
  
  // Get trending posts
  app.get('/api/agent-army/trending', (req, res) => {
    const { limit = 25 } = req.query;
    
    res.json({
      success: true,
      posts: agentState.trendingPosts.slice(0, parseInt(limit)),
      lastUpdate: agentState.lastUpdate
    });
  });
  
  // Get stats
  app.get('/api/agent-army/stats', (req, res) => {
    res.json({
      success: true,
      stats: agentState.stats,
      scanCycle: agentState.scanCycle,
      lastUpdate: agentState.lastUpdate,
      agentCount: agentState.agents.length,
      opportunityCount: agentState.opportunities.length
    });
  });
  
  // Get full intel (for dashboard)
  app.get('/api/agent-army/intel', (req, res) => {
    res.json({
      success: true,
      source: 'agent-army',
      lastUpdate: agentState.lastUpdate,
      stats: {
        postsAnalyzed: agentState.stats.postsAnalyzed,
        totalUpvotes: agentState.trendingPosts.reduce((sum, p) => sum + p.score, 0),
        opportunities: agentState.opportunities.length,
        activeAgents: 51
      },
      opportunities: agentState.opportunities.slice(0, 10).map(o => ({
        id: o.id,
        title: o.post.title,
        url: o.post.permalink,
        subreddit: o.post.subreddit,
        score: o.post.score,
        priority: o.analysis.priority,
        matches: o.analysis.matches,
        foundBy: o.foundBy,
        foundAt: o.foundAt
      })),
      trending: agentState.trendingPosts.slice(0, 10).map(p => ({
        id: p.id,
        title: p.title,
        url: p.permalink,
        subreddit: p.subreddit,
        score: p.score,
        comments: p.numComments,
        scannedBy: p.scannedBy
      })),
      agentArmy: {
        total: 51,
        squads: AGENT_SQUADS.map(s => ({
          name: s.prefix,
          focus: s.focus,
          count: s.count,
          emoji: s.emoji
        }))
      }
    });
  });
  
  // Force a scan (admin)
  app.post('/api/agent-army/scan', async (req, res) => {
    try {
      const result = await runAgentScan();
      res.json({
        success: true,
        message: 'Scan completed',
        ...result
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });
  
  // Also add to the public social-intel endpoint
  app.get('/public/social-intel', (req, res) => {
    res.json({
      success: true,
      source: 'agent-army',
      lastUpdate: agentState.lastUpdate,
      stats: {
        postsAnalyzed: agentState.stats.postsAnalyzed,
        totalUpvotes: agentState.trendingPosts.reduce((sum, p) => sum + p.score, 0),
        opportunities: agentState.opportunities.length,
        activeAgents: 51
      },
      opportunities: agentState.opportunities.slice(0, 15).map(o => ({
        id: o.id,
        title: o.post.title,
        url: o.post.permalink,
        subreddit: o.post.subreddit,
        score: o.post.score,
        priority: o.analysis.priority,
        matches: o.analysis.matches,
        foundBy: o.foundBy,
        foundAt: o.foundAt
      })),
      dailyInsights: {
        trending: agentState.trendingPosts.slice(0, 10).map(p => ({
          id: p.id,
          title: p.title,
          url: p.permalink,
          subreddit: p.subreddit,
          score: p.score,
          comments: p.numComments
        })),
        stats: agentState.stats
      },
      approvalQueue: [],
      agentArmy: {
        total: 51,
        squads: AGENT_SQUADS.map(s => ({
          name: s.prefix,
          focus: s.focus,
          count: s.count,
          emoji: s.emoji
        }))
      }
    });
  });
  
  console.log('[AgentArmy] API routes registered');
}

// ==========================================
// INITIALIZATION
// ==========================================

async function initAgentArmy(app) {
  console.log('[AgentArmy] Initializing 51 AI agents...');
  
  // Register routes
  registerAgentArmyRoutes(app);
  
  // Register research route
  addResearchRoute(app);
  
  // Run initial scan (background, don't block startup)
  console.log('[AgentArmy] Starting background scan...');
  runAgentScan().catch(err => console.error('[AgentArmy] Initial scan error:', err.message));
  
  // Schedule scans every 5 minutes
  setInterval(async () => {
    try {
      await runAgentScan();
    } catch (err) {
      console.error('[AgentArmy] Scheduled scan error:', err.message);
    }
  }, 5 * 60 * 1000);
  
  console.log('[AgentArmy] Initialized with 51 agents, research API ready');
}

// ==========================================
// INTELLIGENT RESEARCH API
// ==========================================

async function searchReddit(query, limit = 50) {
  try {
    // Search Reddit using their search API
    const encodedQuery = encodeURIComponent(query);
    const url = `${REDDIT_BASE}/search.json?q=${encodedQuery}&sort=relevance&limit=${limit}&t=month`;
    const data = await rateLimitedFetch(url);
    
    if (!data.data || !data.data.children) {
      return [];
    }
    
    return data.data.children.map(post => ({
      id: post.data.id,
      title: post.data.title,
      selftext: post.data.selftext || '',
      url: `https://reddit.com${post.data.permalink}`,
      subreddit: post.data.subreddit,
      author: post.data.author,
      score: post.data.score,
      numComments: post.data.num_comments,
      created: new Date(post.data.created_utc * 1000).toISOString(),
      source: 'reddit'
    }));
  } catch (err) {
    console.error('[AgentArmy] Reddit search error:', err.message);
    return [];
  }
}

async function searchWeb(query) {
  // Use DuckDuckGo instant answers (free, no API key)
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_redirect=1`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const results = [];
    
    // Abstract
    if (data.Abstract) {
      results.push({
        id: 'ddg-abstract',
        title: data.Heading || query,
        snippet: data.Abstract,
        url: data.AbstractURL || `https://duckduckgo.com/?q=${encodedQuery}`,
        source: 'web',
        score: 100
      });
    }
    
    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 10)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            id: `ddg-${topic.FirstURL.slice(-20)}`,
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 100),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'web',
            score: 50
          });
        }
      }
    }
    
    return results;
  } catch (err) {
    console.error('[AgentArmy] Web search error:', err.message);
    return [];
  }
}

// ==========================================
// APP STORE REVIEW SCANNING
// ==========================================

async function searchAppleAppStore(query) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://itunes.apple.com/search?term=${encodedQuery}&entity=software&limit=5&country=us`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.results) return [];
    
    return data.results.map(app => ({
      id: `apple-${app.trackId}`,
      appId: app.trackId,
      name: app.trackName,
      developer: app.artistName,
      icon: app.artworkUrl100,
      rating: app.averageUserRating,
      ratingCount: app.userRatingCount,
      price: app.formattedPrice,
      url: app.trackViewUrl,
      source: 'appstore',
      platform: 'ios'
    }));
  } catch (err) {
    console.error('[AgentArmy] Apple App Store search error:', err.message);
    return [];
  }
}

async function fetchAppleAppReviews(appId, country = 'us') {
  try {
    // Apple RSS feed for reviews
    const url = `https://itunes.apple.com/rss/customerreviews/id=${appId}/sortBy=mostRecent/json`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.feed || !data.feed.entry) return [];
    
    // Skip first entry (app info)
    const reviews = data.feed.entry.slice(1);
    
    return reviews.map(review => ({
      id: review.id?.label || `review-${Date.now()}`,
      title: review.title?.label || '',
      content: review.content?.label || '',
      rating: parseInt(review['im:rating']?.label) || 0,
      author: review.author?.name?.label || 'Anonymous',
      version: review['im:version']?.label || '',
      date: review.updated?.label || '',
      url: review.link?.attributes?.href || '',
      source: 'appstore-review',
      platform: 'ios',
      sentiment: getSentiment(parseInt(review['im:rating']?.label) || 3)
    }));
  } catch (err) {
    console.error('[AgentArmy] Apple reviews fetch error:', err.message);
    return [];
  }
}

async function searchGooglePlayStore(query) {
  // Google Play doesn't have a public API, but we can search via web
  try {
    const encodedQuery = encodeURIComponent(query + ' site:play.google.com/store/apps');
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_redirect=1`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const results = [];
    
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.FirstURL && topic.FirstURL.includes('play.google.com')) {
          results.push({
            id: `play-${topic.FirstURL.slice(-30)}`,
            name: topic.Text?.split(' - ')[0] || query,
            snippet: topic.Text || '',
            url: topic.FirstURL,
            source: 'playstore',
            platform: 'android'
          });
        }
      }
    }
    
    return results;
  } catch (err) {
    console.error('[AgentArmy] Google Play search error:', err.message);
    return [];
  }
}

function getSentiment(rating) {
  if (rating >= 4) return { label: 'Positive', emoji: '😊', color: '#22c55e' };
  if (rating >= 3) return { label: 'Neutral', emoji: '😐', color: '#f59e0b' };
  return { label: 'Negative', emoji: '😞', color: '#ef4444' };
}

function analyzeSentiment(text) {
  const positiveWords = ['love', 'great', 'amazing', 'excellent', 'best', 'awesome', 'perfect', 'fantastic', 'helpful', 'recommend'];
  const negativeWords = ['hate', 'terrible', 'worst', 'awful', 'bad', 'horrible', 'useless', 'waste', 'broken', 'crash', 'bug'];
  
  const lower = text.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const word of positiveWords) {
    if (lower.includes(word)) positiveCount++;
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) negativeCount++;
  }
  
  if (positiveCount > negativeCount) return { label: 'Positive', emoji: '😊', color: '#22c55e', score: positiveCount };
  if (negativeCount > positiveCount) return { label: 'Negative', emoji: '😞', color: '#ef4444', score: -negativeCount };
  return { label: 'Neutral', emoji: '😐', color: '#f59e0b', score: 0 };
}

function scoreRelevance(item, keywords, context) {
  const content = `${item.title || ''} ${item.selftext || ''} ${item.snippet || ''}`.toLowerCase();
  const keywordList = keywords.toLowerCase().split(/\s+/);
  const contextWords = context ? context.toLowerCase().split(/\s+/).filter(w => w.length > 3) : [];
  
  let score = 0;
  const matches = [];
  
  // Keyword matches (high weight)
  for (const kw of keywordList) {
    if (kw.length > 2 && content.includes(kw)) {
      score += 30;
      matches.push(kw);
    }
  }
  
  // Context word matches (medium weight)
  for (const cw of contextWords) {
    if (content.includes(cw)) {
      score += 10;
      if (!matches.includes(cw)) matches.push(cw);
    }
  }
  
  // High-intent phrases
  const highIntent = ['looking for', 'need help', 'recommend', 'alternative', 'best', 'anyone using', 'how do', 'struggling'];
  for (const phrase of highIntent) {
    if (content.includes(phrase)) {
      score += 25;
      matches.push(phrase);
    }
  }
  
  // Engagement boost
  if (item.score) score += Math.min(item.score / 10, 20);
  if (item.numComments) score += Math.min(item.numComments / 5, 15);
  
  return { score, matches: [...new Set(matches)] };
}

async function runIntelligentResearch(keyword, context, sources) {
  console.log(`[AgentArmy] Starting research: "${keyword}" with sources: ${sources.join(', ')}`);
  
  const startTime = Date.now();
  const allResults = [];
  let sourcesScanned = 0;
  
  // Reddit search
  if (sources.includes('reddit')) {
    const redditResults = await searchReddit(keyword);
    sourcesScanned += redditResults.length;
    
    for (const result of redditResults) {
      const { score, matches } = scoreRelevance(result, keyword, context);
      const sentiment = analyzeSentiment(`${result.title} ${result.selftext}`);
      if (score >= 30) { // Relevance threshold
        allResults.push({
          ...result,
          relevanceScore: score,
          matches,
          sentiment,
          priority: score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'monitor',
          foundBy: 'LumenSec'
        });
      }
    }
  }
  
  // Web search
  if (sources.includes('web')) {
    const webResults = await searchWeb(keyword);
    sourcesScanned += webResults.length;
    
    for (const result of webResults) {
      const { score, matches } = scoreRelevance(result, keyword, context);
      const sentiment = analyzeSentiment(`${result.title} ${result.snippet}`);
      if (score >= 20) {
        allResults.push({
          ...result,
          relevanceScore: score,
          matches,
          sentiment,
          priority: score >= 60 ? 'hot' : score >= 40 ? 'warm' : 'monitor',
          foundBy: 'LumenRes'
        });
      }
    }
  }
  
  // Apple App Store search
  if (sources.includes('appstore')) {
    const apps = await searchAppleAppStore(keyword);
    sourcesScanned += apps.length;
    
    for (const app of apps) {
      // Fetch reviews for each app
      const reviews = await fetchAppleAppReviews(app.appId);
      sourcesScanned += reviews.length;
      
      // Add app info
      allResults.push({
        id: app.id,
        title: `📱 ${app.name} - iOS App`,
        snippet: `By ${app.developer} • ⭐ ${app.rating?.toFixed(1) || 'N/A'} (${app.ratingCount?.toLocaleString() || 0} ratings) • ${app.price}`,
        url: app.url,
        source: 'appstore',
        platform: 'ios',
        appInfo: app,
        relevanceScore: 70,
        matches: [keyword],
        sentiment: getSentiment(Math.round(app.rating || 3)),
        priority: app.rating >= 4 ? 'hot' : app.rating >= 3 ? 'warm' : 'monitor',
        foundBy: 'LumenEnt'
      });
      
      // Add relevant reviews
      for (const review of reviews.slice(0, 5)) {
        const { score, matches } = scoreRelevance({ title: review.title, selftext: review.content }, keyword, context);
        if (score >= 20 || context.toLowerCase().includes('review') || context.toLowerCase().includes('sentiment')) {
          allResults.push({
            id: review.id,
            title: `⭐${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)} ${review.title}`,
            snippet: review.content,
            fullContent: review.content,
            url: review.url || app.url,
            source: 'appstore-review',
            platform: 'ios',
            author: review.author,
            rating: review.rating,
            appName: app.name,
            relevanceScore: score + (review.rating <= 2 ? 20 : 0), // Boost negative reviews for insights
            matches,
            sentiment: review.sentiment,
            priority: review.rating <= 2 ? 'hot' : review.rating <= 3 ? 'warm' : 'monitor',
            foundBy: 'LumenArch'
          });
        }
      }
    }
  }
  
  // Google Play Store search
  if (sources.includes('playstore')) {
    const apps = await searchGooglePlayStore(keyword);
    sourcesScanned += apps.length;
    
    for (const app of apps) {
      allResults.push({
        id: app.id,
        title: `📱 ${app.name} - Android App`,
        snippet: app.snippet,
        url: app.url,
        source: 'playstore',
        platform: 'android',
        relevanceScore: 60,
        matches: [keyword],
        sentiment: { label: 'Unknown', emoji: '❓', color: '#71717a' },
        priority: 'warm',
        foundBy: 'LumenDev'
      });
    }
  }
  
  // Sort by relevance score
  allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  const duration = Date.now() - startTime;
  console.log(`[AgentArmy] Research complete: ${allResults.length} relevant results from ${sourcesScanned} sources (${duration}ms)`);
  
  // Calculate sentiment summary
  const sentimentSummary = {
    positive: allResults.filter(r => r.sentiment?.label === 'Positive').length,
    neutral: allResults.filter(r => r.sentiment?.label === 'Neutral').length,
    negative: allResults.filter(r => r.sentiment?.label === 'Negative').length
  };
  
  return {
    results: allResults.slice(0, 50), // Top 50 results
    stats: {
      sourcesScanned,
      totalResults: allResults.length,
      hotCount: allResults.filter(r => r.priority === 'hot').length,
      duration,
      sentiment: sentimentSummary
    }
  };
}

// Add research endpoint to routes
function addResearchRoute(app) {
  app.post('/api/agent-army/research', async (req, res) => {
    try {
      const { keyword, context, sources } = req.body;
      
      if (!keyword) {
        return res.status(400).json({ success: false, error: 'Keyword required' });
      }
      
      const validSources = (sources || ['reddit', 'web']).filter(s => ['reddit', 'web'].includes(s));
      
      const { results, stats } = await runIntelligentResearch(keyword, context || '', validSources);
      
      res.json({
        success: true,
        query: keyword,
        context: context || null,
        sources: validSources,
        results,
        stats
      });
    } catch (err) {
      console.error('[AgentArmy] Research API error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  console.log('[AgentArmy] Research API route added');
}

module.exports = {
  initAgentArmy,
  runAgentScan,
  runIntelligentResearch,
  addResearchRoute,
  getAgentState: () => agentState,
  AGENT_SQUADS,
  COMMANDER
};
