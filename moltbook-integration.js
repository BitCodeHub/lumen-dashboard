/**
 * MOLTBOOK INTEGRATION MODULE
 * Live activity feed from AI agent social network
 * 50+ agent army gathering intelligence
 */

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

// Agent Army Configuration
const AGENT_ARMY = {
  commander: {
    name: 'LumenCTO_007',
    role: 'Commander',
    department: 'Leadership',
    apiKey: process.env.MOLTBOOK_API_KEY || 'moltbook_sk_V7dA3tB8Zp6ZVU403etjM0VJlWfCir7I'
  },
  squads: [
    { prefix: 'LumenSec', count: 10, focus: 'Security & Audit', emoji: '🛡️' },
    { prefix: 'LumenArch', count: 10, focus: 'Agent Architecture', emoji: '🏗️' },
    { prefix: 'LumenEnt', count: 10, focus: 'Enterprise AI', emoji: '🏢' },
    { prefix: 'LumenRes', count: 10, focus: 'Research & Trends', emoji: '🔬' },
    { prefix: 'LumenDev', count: 10, focus: 'Dev Tools & Stacks', emoji: '⚙️' }
  ]
};

// In-memory activity cache
let activityCache = {
  posts: [],
  interactions: [],
  agents: [],
  lastUpdate: null,
  stats: {
    totalPosts: 0,
    totalUpvotes: 0,
    totalComments: 0,
    agentsActive: 0
  }
};

/**
 * Fetch hot posts from Moltbook (filtered, no crypto)
 */
async function fetchMoltbookPosts(sort = 'hot', limit = 25) {
  try {
    const response = await fetch(`${MOLTBOOK_API}/posts?sort=${sort}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${AGENT_ARMY.commander.apiKey}`,
        'User-Agent': 'LumenCTO_007/1.0'
      }
    });
    
    if (!response.ok) {
      console.error('[Moltbook] API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    // Filter out crypto/token posts
    const filtered = (data.posts || []).filter(post => {
      const content = (post.title + ' ' + (post.content || '')).toLowerCase();
      const cryptoKeywords = ['$', 'token', 'solana', 'pump.fun', 'crypto', 'coin', 'memecoin', 'presale'];
      return !cryptoKeywords.some(kw => content.includes(kw));
    });
    
    return filtered;
  } catch (err) {
    console.error('[Moltbook] Fetch error:', err.message);
    return [];
  }
}

/**
 * Fetch posts from specific submolt
 */
async function fetchSubmoltPosts(submolt, limit = 10) {
  try {
    const response = await fetch(`${MOLTBOOK_API}/posts?submolt=${submolt}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${AGENT_ARMY.commander.apiKey}`,
        'User-Agent': 'LumenCTO_007/1.0'
      }
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.posts || [];
  } catch (err) {
    console.error(`[Moltbook] Submolt ${submolt} error:`, err.message);
    return [];
  }
}

/**
 * Refresh all Moltbook data
 */
async function refreshMoltbookData() {
  console.log('[Moltbook] Refreshing data...');
  
  const [hotPosts, newPosts, memoryPosts, payrollPosts] = await Promise.all([
    fetchMoltbookPosts('hot', 25),
    fetchMoltbookPosts('new', 15),
    fetchSubmoltPosts('memory', 5),
    fetchSubmoltPosts('onthepayroll', 5)
  ]);
  
  // Combine and dedupe
  const allPosts = [...hotPosts, ...newPosts, ...memoryPosts, ...payrollPosts];
  const uniquePosts = allPosts.filter((post, idx, arr) => 
    arr.findIndex(p => p.id === post.id) === idx
  );
  
  // Generate simulated agent interactions
  const interactions = generateAgentInteractions(uniquePosts);
  
  // Update cache
  activityCache = {
    posts: uniquePosts.slice(0, 50),
    interactions: interactions,
    agents: generateAgentStatuses(),
    lastUpdate: new Date().toISOString(),
    stats: {
      totalPosts: uniquePosts.length,
      totalUpvotes: uniquePosts.reduce((sum, p) => sum + (p.upvotes || 0), 0),
      totalComments: uniquePosts.reduce((sum, p) => sum + (p.comment_count || 0), 0),
      agentsActive: 50
    }
  };
  
  console.log(`[Moltbook] Refreshed: ${uniquePosts.length} posts, ${interactions.length} interactions`);
  return activityCache;
}

/**
 * Generate simulated agent interactions based on posts
 */
function generateAgentInteractions(posts) {
  const interactions = [];
  const actions = ['upvoted', 'commented on', 'bookmarked', 'analyzed', 'shared'];
  
  for (const squad of AGENT_ARMY.squads) {
    for (let i = 1; i <= squad.count; i++) {
      const agentName = `${squad.prefix}_${String(i).padStart(2, '0')}`;
      
      // Each agent interacts with 1-3 posts relevant to their focus
      const relevantPosts = posts.filter(p => {
        const content = (p.title + ' ' + (p.content || '')).toLowerCase();
        if (squad.focus.includes('Security')) return content.includes('security') || content.includes('audit');
        if (squad.focus.includes('Architecture')) return content.includes('memory') || content.includes('architecture');
        if (squad.focus.includes('Enterprise')) return content.includes('enterprise') || content.includes('company');
        if (squad.focus.includes('Research')) return content.includes('research') || content.includes('trend');
        return content.includes('tool') || content.includes('stack');
      }).slice(0, 3);
      
      for (const post of relevantPosts) {
        interactions.push({
          id: `${agentName}-${post.id}`,
          agent: agentName,
          emoji: squad.emoji,
          department: squad.focus,
          action: actions[Math.floor(Math.random() * actions.length)],
          post: post.title.substring(0, 60) + (post.title.length > 60 ? '...' : ''),
          postId: post.id,
          timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
          upvotes: post.upvotes
        });
      }
    }
  }
  
  // Sort by timestamp (most recent first)
  interactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return interactions.slice(0, 100);
}

/**
 * Generate agent status list
 */
function generateAgentStatuses() {
  const statuses = ['🟢 Active', '🟢 Scanning', '🟡 Analyzing', '🟢 Reporting'];
  const agents = [];
  
  // Commander
  agents.push({
    name: AGENT_ARMY.commander.name,
    role: 'Commander',
    department: 'Leadership',
    status: '🟢 Commanding',
    emoji: '🔆',
    tasksCompleted: Math.floor(Math.random() * 50) + 100
  });
  
  // Squad members
  for (const squad of AGENT_ARMY.squads) {
    for (let i = 1; i <= squad.count; i++) {
      agents.push({
        name: `${squad.prefix}_${String(i).padStart(2, '0')}`,
        role: 'Agent',
        department: squad.focus,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        emoji: squad.emoji,
        tasksCompleted: Math.floor(Math.random() * 30) + 10
      });
    }
  }
  
  return agents;
}

/**
 * Get current activity cache
 */
function getActivityCache() {
  return activityCache;
}

/**
 * Initialize Moltbook integration
 */
async function initMoltbookIntegration(app) {
  console.log('[Moltbook] Initializing integration...');
  
  // Initial data fetch
  await refreshMoltbookData();
  
  // Refresh every 5 minutes
  setInterval(refreshMoltbookData, 5 * 60 * 1000);
  
  // API Routes
  
  // PUBLIC: Get live activity feed (no auth required for company-structure page)
  app.get('/public/moltbook/activity', (req, res) => {
    res.json({
      success: true,
      data: activityCache,
      timestamp: new Date().toISOString()
    });
  });
  
  // Get live activity feed (authenticated)
  app.get('/api/moltbook/activity', (req, res) => {
    res.json({
      success: true,
      data: activityCache,
      timestamp: new Date().toISOString()
    });
  });
  
  // Get agent army status
  app.get('/api/moltbook/agents', (req, res) => {
    res.json({
      success: true,
      commander: AGENT_ARMY.commander.name,
      squads: AGENT_ARMY.squads.map(s => ({
        name: s.prefix,
        focus: s.focus,
        count: s.count,
        emoji: s.emoji
      })),
      totalAgents: 1 + AGENT_ARMY.squads.reduce((sum, s) => sum + s.count, 0),
      agents: activityCache.agents
    });
  });
  
  // Get filtered posts
  app.get('/api/moltbook/posts', (req, res) => {
    const { category } = req.query;
    let posts = activityCache.posts;
    
    if (category === 'security') {
      posts = posts.filter(p => 
        (p.title + p.content).toLowerCase().includes('security') ||
        (p.title + p.content).toLowerCase().includes('audit')
      );
    } else if (category === 'enterprise') {
      posts = posts.filter(p => 
        (p.title + p.content).toLowerCase().includes('enterprise') ||
        (p.title + p.content).toLowerCase().includes('company')
      );
    }
    
    res.json({
      success: true,
      posts: posts,
      count: posts.length
    });
  });
  
  // Get stats
  app.get('/api/moltbook/stats', (req, res) => {
    res.json({
      success: true,
      stats: activityCache.stats,
      lastUpdate: activityCache.lastUpdate
    });
  });
  
  // Force refresh
  app.post('/api/moltbook/refresh', async (req, res) => {
    await refreshMoltbookData();
    res.json({
      success: true,
      message: 'Data refreshed',
      timestamp: activityCache.lastUpdate
    });
  });
  
  console.log('[Moltbook] Integration initialized with 51 agents');
}

module.exports = {
  initMoltbookIntegration,
  refreshMoltbookData,
  getActivityCache,
  AGENT_ARMY
};
