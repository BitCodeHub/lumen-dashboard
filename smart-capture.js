/**
 * Smart Capture - Multimodal Everything Inbox
 * 
 * Drop in any content and it gets auto-categorized and connected.
 * Supports: text notes, URLs, voice transcripts, expenses, ideas, jobs, briefings, resources
 */

// ============================================
// TYPE DETECTION PATTERNS
// ============================================

const TYPE_PATTERNS = {
  expense: {
    weight: 0,
    patterns: [
      /\$\d+(?:\.\d{2})?/,                    // $12.50
      /spent\s+\d+/i,                          // spent 20
      /paid\s+\d+/i,                            // paid 50
      /\d+(?:\.\d{2})?\s*(?:dollars?|bucks?)/i, // 12 dollars
      /receipt|invoice|charge|purchase|bought/i,
      /(?:at|from)\s+\w+\s+for\s+\$?\d+/i,     // at Costco for $50
    ],
    keywords: ['spent', 'paid', 'cost', 'bought', 'purchase', 'receipt', 'expense', 'invoice', 'charge', 'bill']
  },
  
  idea: {
    weight: 0,
    patterns: [
      /^(?:idea|concept|thought)[\s:]+/i,  // Starts with "Idea:" - strong signal
      /(?:idea|concept|thought)[\s:]+/i,
      /what\s+if\s+we/i,
      /we\s+(?:could|should)\s+build/i,
      /app\s+(?:idea|concept)/i,
      /startup\s+(?:idea|concept)/i,
      /product\s+(?:idea|concept)/i,
      /saas|b2b|b2c|mvp|prototype/i,
    ],
    keywords: ['idea', 'concept', 'startup', 'build', 'create', 'launch', 'app', 'product', 'saas', 'mvp', 'pivot', 'market', 'revenue', 'monetize', 'disruption']
  },
  
  job: {
    weight: 0,
    patterns: [
      /(?:job|position|role)\s+(?:at|for|with)/i,
      /hiring|looking\s+for|openings?/i,
      /\$\d+k[-–]\$?\d+k/i,                    // $80k-$120k
      /salary[\s:]+\$?\d+/i,
      /(?:remote|hybrid|onsite)\s+(?:job|role|position)/i,
      /(?:senior|junior|lead|staff|principal)\s+\w+\s+(?:engineer|developer|designer)/i,
    ],
    keywords: ['job', 'position', 'role', 'hiring', 'salary', 'remote', 'hybrid', 'onsite', 'interview', 'application', 'applied', 'recruiter', 'linkedin', 'offer']
  },
  
  resource: {
    weight: 0,
    patterns: [
      /https?:\/\/[^\s]+/,                     // URLs
      /(?:check\s+out|look\s+at|found)\s+this/i,
      /(?:article|video|tutorial|guide|tool)/i,
      /github\.com|youtube\.com|medium\.com/i,
      /(?:awesome|useful|helpful)\s+(?:resource|tool|link)/i,
    ],
    keywords: ['link', 'url', 'article', 'video', 'tutorial', 'guide', 'resource', 'tool', 'github', 'documentation', 'reference', 'bookmark']
  },
  
  briefing: {
    weight: 0,
    patterns: [
      /(?:meeting|call)\s+(?:with|notes?)/i,
      /(?:daily|weekly|monthly)\s+(?:update|summary|report)/i,
      /(?:key\s+)?(?:takeaways?|highlights?|notes?)/i,
      /action\s+items?/i,
      /(?:research|analysis)\s+(?:on|about|regarding)/i,
      /briefing|summary|digest|report/i,
    ],
    keywords: ['meeting', 'call', 'notes', 'summary', 'briefing', 'report', 'update', 'takeaway', 'action', 'decision', 'followup', 'agenda']
  }
};

// Expense-specific patterns (reuse from smart-expenses)
const MERCHANT_PATTERNS = {
  "raising cane": { name: "Raising Cane's", type: "fast_food", category: "Food" },
  "canes": { name: "Raising Cane's", type: "fast_food", category: "Food" },
  "chipotle": { name: "Chipotle", type: "fast_food", category: "Food" },
  "mcdonald": { name: "McDonald's", type: "fast_food", category: "Food" },
  "starbucks": { name: "Starbucks", type: "cafe", category: "Food" },
  "chick-fil-a": { name: "Chick-fil-A", type: "fast_food", category: "Food" },
  "in-n-out": { name: "In-N-Out", type: "fast_food", category: "Food" },
  "taco bell": { name: "Taco Bell", type: "fast_food", category: "Food" },
  "costco": { name: "Costco", type: "grocery", category: "Groceries" },
  "walmart": { name: "Walmart", type: "retail", category: "Shopping" },
  "target": { name: "Target", type: "retail", category: "Shopping" },
  "amazon": { name: "Amazon", type: "retail", category: "Shopping" },
  "shell": { name: "Shell", type: "gas_station", category: "Gas" },
  "chevron": { name: "Chevron", type: "gas_station", category: "Gas" },
  "uber": { name: "Uber", type: "transport", category: "Transport" },
  "lyft": { name: "Lyft", type: "transport", category: "Transport" },
};

// Idea categories
const IDEA_CATEGORIES = [
  { name: 'AI/ML', keywords: ['ai', 'ml', 'machine learning', 'gpt', 'llm', 'neural', 'deep learning', 'claude', 'chatbot'] },
  { name: 'SaaS', keywords: ['saas', 'subscription', 'b2b', 'platform', 'service', 'dashboard'] },
  { name: 'Mobile', keywords: ['mobile', 'app', 'ios', 'android', 'phone'] },
  { name: 'E-commerce', keywords: ['ecommerce', 'shop', 'store', 'marketplace', 'sell', 'buy'] },
  { name: 'Fintech', keywords: ['fintech', 'payment', 'banking', 'crypto', 'invest', 'finance'] },
  { name: 'Health', keywords: ['health', 'fitness', 'medical', 'wellness', 'therapy'] },
  { name: 'Education', keywords: ['education', 'learn', 'course', 'tutorial', 'teach'] },
  { name: 'Productivity', keywords: ['productivity', 'task', 'workflow', 'automation', 'efficiency'] },
  { name: 'Social', keywords: ['social', 'community', 'network', 'connect', 'share'] },
  { name: 'Developer Tools', keywords: ['developer', 'api', 'sdk', 'cli', 'devtool', 'code'] },
];

// Job types
const JOB_TYPES = ['full-time', 'part-time', 'contract', 'freelance', 'internship'];
const WORK_MODES = ['remote', 'hybrid', 'onsite', 'in-office'];

// ============================================
// TYPE DETECTION
// ============================================

/**
 * Detect content type using pattern matching and heuristics
 * @param {string} content - Raw input content
 * @param {string} typeHint - Optional type hint from user
 * @returns {Object} - { type, confidence, scores }
 */
function detectType(content, typeHint = null) {
  // If user provided a valid type hint, trust it
  const validTypes = ['expense', 'idea', 'job', 'resource', 'briefing'];
  if (typeHint && validTypes.includes(typeHint.toLowerCase())) {
    return {
      type: typeHint.toLowerCase(),
      confidence: 1.0,
      scores: { [typeHint.toLowerCase()]: 1.0 },
      method: 'user_hint'
    };
  }

  const text = content.toLowerCase();
  
  // Check for explicit type prefixes first (strongest signal)
  if (/^idea[\s:]/i.test(content)) {
    return { type: 'idea', confidence: 0.95, scores: { idea: 0.95 }, method: 'explicit_prefix' };
  }
  if (/^expense[\s:]/i.test(content)) {
    return { type: 'expense', confidence: 0.95, scores: { expense: 0.95 }, method: 'explicit_prefix' };
  }
  if (/^job[\s:]/i.test(content)) {
    return { type: 'job', confidence: 0.95, scores: { job: 0.95 }, method: 'explicit_prefix' };
  }
  if (/^resource[\s:]/i.test(content) || /^link[\s:]/i.test(content)) {
    return { type: 'resource', confidence: 0.95, scores: { resource: 0.95 }, method: 'explicit_prefix' };
  }
  if (/^note[\s:]/i.test(content) || /^briefing[\s:]/i.test(content)) {
    return { type: 'briefing', confidence: 0.95, scores: { briefing: 0.95 }, method: 'explicit_prefix' };
  }

  const scores = {};

  // Calculate score for each type
  for (const [type, config] of Object.entries(TYPE_PATTERNS)) {
    let score = 0;

    // Pattern matches (weighted heavily)
    for (const pattern of config.patterns) {
      if (pattern.test(content)) {
        score += 0.3;
      }
    }

    // Keyword matches
    for (const keyword of config.keywords) {
      if (text.includes(keyword)) {
        score += 0.15;
      }
    }

    scores[type] = Math.min(score, 1.0);
  }

  // Find highest scoring type
  let bestType = 'briefing'; // Default fallback
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // If score is too low, use heuristics
  if (bestScore < 0.2) {
    // URLs default to resource
    if (/https?:\/\//.test(content)) {
      bestType = 'resource';
      bestScore = 0.7;
    }
    // Short text with dollar amounts default to expense
    else if (/\$\d+/.test(content) && content.length < 200) {
      bestType = 'expense';
      bestScore = 0.6;
    }
    // Default to briefing for longer text
    else {
      bestType = 'briefing';
      bestScore = 0.4;
    }
  }

  return {
    type: bestType,
    confidence: bestScore,
    scores,
    method: 'pattern_matching'
  };
}

// ============================================
// DATA EXTRACTION
// ============================================

/**
 * Extract structured data based on detected type
 */
function extractData(content, type) {
  const extractors = {
    expense: extractExpenseData,
    idea: extractIdeaData,
    job: extractJobData,
    resource: extractResourceData,
    briefing: extractBriefingData
  };

  const extractor = extractors[type] || extractBriefingData;
  return extractor(content);
}

/**
 * Extract expense data
 */
function extractExpenseData(content) {
  const text = content.toLowerCase();
  const result = {
    amount: null,
    vendor: null,
    category: null,
    description: content.substring(0, 255),
    merchant_type: null,
    date: new Date().toISOString()
  };

  // Extract amount
  const amountPatterns = [
    /\$([0-9]+(?:\.[0-9]{1,2})?)/,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|bucks?)/i,
    /spent\s+([0-9]+(?:\.[0-9]{1,2})?)/i,
    /paid\s+([0-9]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = content.match(pattern);
    if (match) {
      result.amount = parseFloat(match[1]);
      break;
    }
  }

  // Extract vendor from known merchants
  for (const [pattern, merchant] of Object.entries(MERCHANT_PATTERNS)) {
    if (text.includes(pattern)) {
      result.vendor = merchant.name;
      result.category = merchant.category;
      result.merchant_type = merchant.type;
      break;
    }
  }

  // Try to extract vendor from "at [place]" pattern
  if (!result.vendor) {
    const atMatch = content.match(/(?:at|from)\s+([A-Z][a-zA-Z\s''-]+?)(?:\s+for|\s+on|\.|,|$)/i);
    if (atMatch) {
      result.vendor = atMatch[1].trim();
    }
  }

  // Default category based on keywords
  if (!result.category) {
    if (/food|eat|lunch|dinner|breakfast|meal|restaurant/i.test(content)) result.category = 'Food';
    else if (/gas|fuel|gallons?/i.test(content)) result.category = 'Gas';
    else if (/grocery|groceries|supermarket/i.test(content)) result.category = 'Groceries';
    else if (/uber|lyft|taxi|ride|transport/i.test(content)) result.category = 'Transport';
    else result.category = 'Other';
  }

  return result;
}

/**
 * Extract idea data
 */
function extractIdeaData(content) {
  const text = content.toLowerCase();
  const result = {
    name: null,
    description: content,
    category: 'Other',
    type: 'app',
    revenue_potential: null,
    build_time: null,
    tech_stack: [],
    tags: []
  };

  // Extract idea name (first sentence or line, cleaned up)
  const firstLine = content.split(/[.\n]/)[0].trim();
  const cleanedName = firstLine
    .replace(/^(?:idea|concept|thought)[\s:]+/i, '')
    .replace(/^(?:what\s+if\s+we\s+)/i, '')
    .substring(0, 100);
  result.name = cleanedName || 'Untitled Idea';

  // Detect category
  for (const cat of IDEA_CATEGORIES) {
    if (cat.keywords.some(kw => text.includes(kw))) {
      result.category = cat.name;
      break;
    }
  }

  // Detect type
  if (/mobile|ios|android/i.test(content)) result.type = 'mobile app';
  else if (/saas|subscription|platform/i.test(content)) result.type = 'saas';
  else if (/chrome\s+extension|browser\s+extension/i.test(content)) result.type = 'extension';
  else if (/api|sdk|library/i.test(content)) result.type = 'api/service';
  else if (/marketplace|ecommerce/i.test(content)) result.type = 'marketplace';
  else result.type = 'app';

  // Extract tech stack mentions
  const techKeywords = ['react', 'vue', 'angular', 'node', 'python', 'django', 'flask', 'rails', 
    'postgres', 'mongodb', 'redis', 'aws', 'gcp', 'azure', 'docker', 'kubernetes', 
    'typescript', 'graphql', 'rest', 'nextjs', 'svelte', 'tailwind', 'supabase', 'firebase'];
  result.tech_stack = techKeywords.filter(tech => text.includes(tech));

  // Extract revenue potential mentions
  if (/\$\d+[km]/i.test(content)) {
    const match = content.match(/\$(\d+)([km])/i);
    if (match) {
      const num = parseInt(match[1]);
      const multiplier = match[2].toLowerCase() === 'k' ? 1000 : 1000000;
      result.revenue_potential = `$${num}${match[2].toUpperCase()}`;
    }
  }

  // Extract build time mentions
  const timePatterns = [
    /(\d+)\s*(?:days?|weeks?|months?)\s*(?:to\s+)?(?:build|develop|launch|mvp)/i,
    /mvp\s+in\s+(\d+)\s*(?:days?|weeks?|months?)/i,
  ];
  for (const pattern of timePatterns) {
    const match = content.match(pattern);
    if (match) {
      result.build_time = match[0];
      break;
    }
  }

  // Generate tags from keywords
  const tagKeywords = ['ai', 'ml', 'saas', 'b2b', 'b2c', 'mvp', 'startup', 'fintech', 'health', 'edu'];
  result.tags = tagKeywords.filter(tag => text.includes(tag));

  return result;
}

/**
 * Extract job data
 */
function extractJobData(content) {
  const result = {
    title: null,
    company: null,
    location: null,
    salary_min: null,
    salary_max: null,
    salary_text: null,
    job_type: 'full-time',
    url: null,
    description: content,
    status: 'new',
    tags: []
  };

  // Extract URL
  const urlMatch = content.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    result.url = urlMatch[0];
  }

  // Extract salary range
  const salaryPatterns = [
    /\$(\d+)[k]?\s*[-–]\s*\$?(\d+)[k]?/i,
    /salary[\s:]+\$?(\d+)[k]?\s*[-–]\s*\$?(\d+)[k]?/i,
    /(\d{2,3})[k]\s*[-–]\s*(\d{2,3})[k]/i,
  ];
  
  for (const pattern of salaryPatterns) {
    const match = content.match(pattern);
    if (match) {
      let min = parseInt(match[1]);
      let max = parseInt(match[2]);
      // Normalize to thousands if small numbers
      if (min < 500) min *= 1000;
      if (max < 500) max *= 1000;
      result.salary_min = min;
      result.salary_max = max;
      result.salary_text = `$${Math.floor(min/1000)}K - $${Math.floor(max/1000)}K`;
      break;
    }
  }

  // Extract job title
  const titlePatterns = [
    /(?:role|position|job)[\s:]+([A-Z][a-zA-Z\s]+?)(?:\s+at|\s+for|\s*[-,]|$)/i,
    /(?:senior|junior|lead|staff|principal)\s+[a-zA-Z\s]+(?:engineer|developer|designer)/i,
    /([A-Z][a-zA-Z]+\s+(?:Engineer|Developer|Designer|Manager|Analyst|Architect))/,
  ];

  for (const pattern of titlePatterns) {
    const match = content.match(pattern);
    if (match) {
      result.title = match[1] || match[0];
      result.title = result.title.trim().substring(0, 100);
      break;
    }
  }

  // Extract company
  const companyPatterns = [
    /(?:at|for|with)\s+([A-Z][a-zA-Z\s]+?)(?:\s+looking|\s+hiring|\s*[-,.]|$)/i,
    /([A-Z][a-zA-Z]+)\s+is\s+(?:hiring|looking)/i,
  ];

  for (const pattern of companyPatterns) {
    const match = content.match(pattern);
    if (match) {
      result.company = match[1].trim().substring(0, 100);
      break;
    }
  }

  // Detect job type
  for (const type of JOB_TYPES) {
    if (content.toLowerCase().includes(type.replace('-', ''))) {
      result.job_type = type;
      break;
    }
  }

  // Detect work mode
  for (const mode of WORK_MODES) {
    if (content.toLowerCase().includes(mode)) {
      result.tags.push(mode);
      break;
    }
  }

  // Generate tags
  const techTags = ['react', 'node', 'python', 'typescript', 'aws', 'kubernetes', 'ai', 'ml'];
  for (const tag of techTags) {
    if (content.toLowerCase().includes(tag)) {
      result.tags.push(tag);
    }
  }

  // Default title if not found
  if (!result.title) {
    result.title = 'Untitled Position';
  }
  if (!result.company) {
    result.company = 'Unknown Company';
  }

  return result;
}

/**
 * Extract resource data
 */
function extractResourceData(content) {
  const result = {
    title: null,
    url: null,
    description: content,
    type: 'link',
    category: 'Other',
    tags: []
  };

  // Extract URL
  const urlMatch = content.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    result.url = urlMatch[0];
    
    // Detect type from URL
    if (/github\.com/.test(result.url)) {
      result.type = 'repository';
      result.category = 'Code';
    } else if (/youtube\.com|youtu\.be/.test(result.url)) {
      result.type = 'video';
      result.category = 'Media';
    } else if (/medium\.com|dev\.to|hashnode/.test(result.url)) {
      result.type = 'article';
      result.category = 'Reading';
    } else if (/twitter\.com|x\.com/.test(result.url)) {
      result.type = 'social';
      result.category = 'Social';
    } else if (/docs\.|documentation|readme/i.test(result.url)) {
      result.type = 'documentation';
      result.category = 'Reference';
    }
  }

  // Extract title (first line without URL)
  const lines = content.split('\n');
  for (const line of lines) {
    const cleanLine = line.replace(/https?:\/\/[^\s]+/g, '').trim();
    if (cleanLine.length > 3) {
      result.title = cleanLine.substring(0, 200);
      break;
    }
  }

  // Default title from URL if available
  if (!result.title && result.url) {
    try {
      const urlObj = new URL(result.url);
      result.title = urlObj.hostname + urlObj.pathname.substring(0, 50);
    } catch {
      result.title = result.url.substring(0, 100);
    }
  }

  if (!result.title) {
    result.title = 'Untitled Resource';
  }

  // Extract tags from content
  const tagKeywords = ['tutorial', 'guide', 'tool', 'library', 'framework', 'api', 'course', 'book'];
  for (const tag of tagKeywords) {
    if (content.toLowerCase().includes(tag)) {
      result.tags.push(tag);
    }
  }

  return result;
}

/**
 * Extract briefing data
 */
function extractBriefingData(content) {
  const result = {
    title: null,
    type: 'note',
    content: content,
    summary: null,
    tags: []
  };

  // Detect briefing type
  if (/meeting|call\s+with/i.test(content)) {
    result.type = 'meeting-notes';
  } else if (/daily|weekly|monthly.*(?:update|report|summary)/i.test(content)) {
    result.type = 'report';
  } else if (/research|analysis/i.test(content)) {
    result.type = 'research';
  } else if (/decision|decided|conclusion/i.test(content)) {
    result.type = 'decision';
  } else if (/action\s+items?|todo|tasks?/i.test(content)) {
    result.type = 'action-items';
  }

  // Extract title from first line
  const firstLine = content.split(/\n/)[0].trim();
  result.title = firstLine.substring(0, 200) || 'Untitled Note';

  // Generate summary (first 2-3 sentences)
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length > 0) {
    result.summary = sentences.slice(0, 3).join(' ').trim().substring(0, 500);
  }

  // Extract tags from mentions
  const mentionMatches = content.match(/@(\w+)/g);
  if (mentionMatches) {
    result.tags = mentionMatches.map(m => m.substring(1));
  }

  // Extract hashtags
  const hashtagMatches = content.match(/#(\w+)/g);
  if (hashtagMatches) {
    result.tags = [...result.tags, ...hashtagMatches.map(h => h.substring(1))];
  }

  return result;
}

// ============================================
// STORAGE FUNCTIONS
// ============================================

/**
 * Store captured item in appropriate table
 */
async function storeItem(pool, type, data, source = 'capture') {
  const storers = {
    expense: storeExpense,
    idea: storeIdea,
    job: storeJob,
    resource: storeResource,
    briefing: storeBriefing
  };

  const storer = storers[type];
  if (!storer) {
    throw new Error(`Unknown type: ${type}`);
  }

  return await storer(pool, data, source);
}

async function storeExpense(pool, data, source) {
  const result = await pool.query(`
    INSERT INTO lumen_expenses (
      amount, category, description, vendor, date, merchant_type, source, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id
  `, [
    data.amount || 0,
    data.category || 'Other',
    data.description,
    data.vendor,
    data.date || new Date().toISOString(),
    data.merchant_type,
    source
  ]);
  return { id: result.rows[0].id, table: 'lumen_expenses' };
}

async function storeIdea(pool, data, source) {
  const result = await pool.query(`
    INSERT INTO lumen_ideas (
      name, description, category, type, revenue_potential, build_time, tech_stack, tags, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'idea', NOW())
    RETURNING id
  `, [
    data.name || 'Untitled Idea',
    data.description,
    data.category || 'Other',
    data.type || 'app',
    data.revenue_potential,
    data.build_time,
    data.tech_stack || [],
    data.tags || []
  ]);
  return { id: result.rows[0].id, table: 'lumen_ideas' };
}

async function storeJob(pool, data, source) {
  const result = await pool.query(`
    INSERT INTO lumen_jobs (
      title, company, location, salary_min, salary_max, salary_text, job_type, url, description, status, tags, source, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    RETURNING id
  `, [
    data.title || 'Untitled Position',
    data.company || 'Unknown Company',
    data.location,
    data.salary_min,
    data.salary_max,
    data.salary_text,
    data.job_type || 'full-time',
    data.url,
    data.description,
    data.status || 'new',
    data.tags || [],
    source
  ]);
  return { id: result.rows[0].id, table: 'lumen_jobs' };
}

async function storeResource(pool, data, source) {
  const result = await pool.query(`
    INSERT INTO lumen_resources (
      type, title, url, description, category, tags, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id
  `, [
    data.type || 'link',
    data.title || 'Untitled Resource',
    data.url,
    data.description,
    data.category || 'Other',
    data.tags || []
  ]);
  return { id: result.rows[0].id, table: 'lumen_resources' };
}

async function storeBriefing(pool, data, source) {
  const result = await pool.query(`
    INSERT INTO lumen_briefings (
      type, title, content, summary, tags, created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id
  `, [
    data.type || 'note',
    data.title || 'Untitled Note',
    data.content,
    data.summary,
    data.tags || []
  ]);
  return { id: result.rows[0].id, table: 'lumen_briefings' };
}

// ============================================
// RELATED ITEMS FINDER
// ============================================

/**
 * Find items related to the captured content
 */
async function findRelatedItems(pool, type, data, content) {
  const related = {
    briefings: [],
    expenses: [],
    ideas: [],
    jobs: [],
    resources: []
  };

  const searchTerms = extractSearchTerms(content, data);
  if (searchTerms.length === 0) return related;

  const searchQuery = searchTerms.join(' | '); // OR search

  try {
    // Search briefings
    const briefingsResult = await pool.query(`
      SELECT id, title, type, summary, created_at,
        ts_rank(to_tsvector('english', title || ' ' || COALESCE(content, '')), plainto_tsquery('english', $1)) as rank
      FROM lumen_briefings 
      WHERE to_tsvector('english', title || ' ' || COALESCE(content, '')) @@ plainto_tsquery('english', $1)
        AND (archived = FALSE OR archived IS NULL)
      ORDER BY rank DESC
      LIMIT 5
    `, [searchTerms[0]]);
    related.briefings = briefingsResult.rows;

    // Search ideas
    const ideasResult = await pool.query(`
      SELECT id, name as title, category, description, created_at
      FROM lumen_ideas 
      WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 OR $2 = ANY(tags)
      ORDER BY created_at DESC
      LIMIT 5
    `, [`%${searchTerms[0].toLowerCase()}%`, searchTerms[0].toLowerCase()]);
    related.ideas = ideasResult.rows;

    // Search jobs (by company/title)
    if (data.company || data.title) {
      const jobsResult = await pool.query(`
        SELECT id, title, company, salary_text, status, created_at
        FROM lumen_jobs 
        WHERE LOWER(company) LIKE $1 OR LOWER(title) LIKE $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [`%${(data.company || data.title || '').toLowerCase()}%`]);
      related.jobs = jobsResult.rows;
    }

    // Search resources
    const resourcesResult = await pool.query(`
      SELECT id, title, url, type, category, created_at
      FROM lumen_resources 
      WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1
        AND (archived = FALSE OR archived IS NULL)
      ORDER BY created_at DESC
      LIMIT 5
    `, [`%${searchTerms[0].toLowerCase()}%`]);
    related.resources = resourcesResult.rows;

    // Search expenses (for related vendor)
    if (data.vendor) {
      const expensesResult = await pool.query(`
        SELECT id, amount, vendor, category, date, created_at
        FROM lumen_expenses 
        WHERE LOWER(vendor) LIKE $1
        ORDER BY date DESC
        LIMIT 5
      `, [`%${data.vendor.toLowerCase()}%`]);
      related.expenses = expensesResult.rows;
    }

  } catch (err) {
    console.error('[SmartCapture] Error finding related items:', err.message);
  }

  return related;
}

/**
 * Extract search terms from content and data
 */
function extractSearchTerms(content, data) {
  const terms = new Set();

  // Add key data fields
  if (data.name) terms.add(data.name);
  if (data.title) terms.add(data.title);
  if (data.vendor) terms.add(data.vendor);
  if (data.company) terms.add(data.company);
  if (data.category) terms.add(data.category);

  // Extract capitalized words (proper nouns)
  const properNouns = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  properNouns.forEach(noun => {
    if (noun.length > 2 && noun.length < 50) {
      terms.add(noun);
    }
  });

  // Extract hashtags
  const hashtags = content.match(/#(\w+)/g) || [];
  hashtags.forEach(tag => terms.add(tag.substring(1)));

  // Extract key technical terms
  const techTerms = ['AI', 'ML', 'API', 'SaaS', 'React', 'Node', 'Python', 'AWS', 'GCP'];
  techTerms.forEach(term => {
    if (content.includes(term)) terms.add(term);
  });

  return Array.from(terms).slice(0, 10);
}

// ============================================
// MAIN CAPTURE FUNCTION
// ============================================

/**
 * Process and store captured content
 * @param {Object} pool - PostgreSQL connection pool
 * @param {Object} input - { content, type_hint?, source? }
 * @returns {Object} - { type, confidence, item, data, related }
 */
async function capture(pool, input) {
  const { content, type_hint, source = 'api' } = input;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Content is required and must be a non-empty string');
  }

  const trimmedContent = content.trim();

  // Step 1: Detect type
  const detection = detectType(trimmedContent, type_hint);
  console.log(`[SmartCapture] Detected type: ${detection.type} (confidence: ${detection.confidence.toFixed(2)})`);

  // Step 2: Extract structured data
  const data = extractData(trimmedContent, detection.type);
  console.log(`[SmartCapture] Extracted data:`, JSON.stringify(data).substring(0, 200));

  // Step 3: Store in appropriate table
  const stored = await storeItem(pool, detection.type, data, source);
  console.log(`[SmartCapture] Stored item ${stored.id} in ${stored.table}`);

  // Step 4: Find related items
  const related = await findRelatedItems(pool, detection.type, data, trimmedContent);
  const relatedCount = Object.values(related).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[SmartCapture] Found ${relatedCount} related items`);

  return {
    type: detection.type,
    confidence: detection.confidence,
    method: detection.method,
    scores: detection.scores,
    item: stored,
    data,
    related,
    raw_input: trimmedContent.substring(0, 500)
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  capture,
  detectType,
  extractData,
  storeItem,
  findRelatedItems,
  TYPE_PATTERNS,
  MERCHANT_PATTERNS,
  IDEA_CATEGORIES
};
