/**
 * 🎲 SERENDIPITY ENGINE
 * Surfaces unexpected, valuable connections across all user data
 * 
 * "That coffee shop expense 3 months ago? The founder of the company 
 * you're interviewing with has meetings there."
 * 
 * Jimmy & Lumen AI Solutions
 */

// =============================================================================
// CONNECTION PATTERNS - What we're looking for
// =============================================================================

const CONNECTION_PATTERNS = {
  // Temporal patterns - things that happen around the same time
  temporal: {
    name: 'Temporal Correlation',
    description: 'Events or activities clustered in time',
    weight: 0.7
  },
  
  // Location/Vendor patterns - same places appearing in different contexts
  location: {
    name: 'Location Link',
    description: 'Same location appearing across different data types',
    weight: 0.85
  },
  
  // Keyword/Semantic patterns - shared themes across data
  semantic: {
    name: 'Semantic Thread',
    description: 'Shared themes, keywords, or concepts',
    weight: 0.8
  },
  
  // Financial patterns - expense patterns that correlate with other data
  financial: {
    name: 'Financial Signal',
    description: 'Spending patterns that indicate interest or preparation',
    weight: 0.75
  },
  
  // Network patterns - people/companies appearing in multiple places
  network: {
    name: 'Network Connection',
    description: 'People or organizations appearing across different contexts',
    weight: 0.9
  },
  
  // Opportunity patterns - potential actions based on combined data
  opportunity: {
    name: 'Hidden Opportunity',
    description: 'Actionable insights from connecting disparate data',
    weight: 0.95
  }
};

// =============================================================================
// SEED PATTERNS - Known valuable connection types
// =============================================================================

const SEED_CONNECTIONS = [
  {
    id: 'job-expense-location',
    name: 'Interview Prep Indicator',
    sources: ['jobs', 'expenses'],
    detect: (job, expense) => {
      if (!job.company || !expense.vendor) return null;
      const companyLower = job.company.toLowerCase();
      const vendorLower = expense.vendor.toLowerCase();
      
      // Check if expense is near company or mentions company
      if (expense.description?.toLowerCase().includes(companyLower)) {
        return {
          score: 0.9,
          insight: `You had an expense at "${expense.vendor}" related to "${job.company}". This could be reconnaissance or interview prep.`
        };
      }
      return null;
    }
  },
  {
    id: 'idea-resource-skill',
    name: 'Skill Gap Discovery',
    sources: ['ideas', 'resources'],
    detect: (idea, resource) => {
      if (!idea.tech_stack || !resource.title) return null;
      
      const techStack = idea.tech_stack.map(t => t.toLowerCase());
      const resourceTitle = resource.title.toLowerCase();
      const resourceDesc = (resource.description || '').toLowerCase();
      
      // Check if resource teaches something in idea's tech stack
      for (const tech of techStack) {
        if (resourceTitle.includes(tech) || resourceDesc.includes(tech)) {
          return {
            score: 0.85,
            insight: `Your saved resource "${resource.title}" teaches ${tech}, which is in the tech stack for your idea "${idea.name}". Perfect alignment!`
          };
        }
      }
      return null;
    }
  },
  {
    id: 'briefing-job-timing',
    name: 'Market Timing Signal',
    sources: ['briefings', 'jobs'],
    detect: (briefing, job) => {
      const briefingContent = (briefing.content || '').toLowerCase();
      const jobTitle = job.title.toLowerCase();
      const company = job.company.toLowerCase();
      
      // Check if briefing mentions the company or job type
      if (briefingContent.includes(company) || briefingContent.includes(jobTitle)) {
        return {
          score: 0.88,
          insight: `Your briefing "${briefing.title}" mentions "${job.company}". They might be making news - good time to apply!`
        };
      }
      return null;
    }
  },
  {
    id: 'expense-idea-validation',
    name: 'Personal Pain Point',
    sources: ['expenses', 'ideas'],
    detect: (expense, idea) => {
      const category = (expense.category || '').toLowerCase();
      const ideaDesc = (idea.description || '').toLowerCase();
      const ideaName = idea.name.toLowerCase();
      
      // Check if expense category relates to idea
      if (ideaDesc.includes(category) || ideaName.includes(category)) {
        return {
          score: 0.8,
          insight: `You're spending money on "${expense.category}" - and your idea "${idea.name}" addresses this! You're solving your own problem.`
        };
      }
      return null;
    }
  },
  {
    id: 'resource-briefing-trend',
    name: 'Trend Convergence',
    sources: ['resources', 'briefings'],
    detect: (resource, briefing) => {
      const resourceTags = (resource.tags || []).map(t => t.toLowerCase());
      const briefingTags = (briefing.tags || []).map(t => t.toLowerCase());
      
      // Find overlapping tags
      const overlap = resourceTags.filter(t => briefingTags.includes(t));
      if (overlap.length > 0) {
        return {
          score: 0.75,
          insight: `Both your resource "${resource.title}" and briefing "${briefing.title}" are tagged with [${overlap.join(', ')}]. You're tracking this trend from multiple angles.`
        };
      }
      return null;
    }
  }
];

// =============================================================================
// KEYWORD EXTRACTION
// =============================================================================

function extractKeywords(text) {
  if (!text) return [];
  
  // Common words to ignore
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'whom', 'where', 'when',
    'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'some', 'any', 'no', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

function findKeywordOverlap(text1, text2) {
  const keywords1 = new Set(extractKeywords(text1));
  const keywords2 = new Set(extractKeywords(text2));
  
  const overlap = [...keywords1].filter(k => keywords2.has(k));
  const union = new Set([...keywords1, ...keywords2]);
  
  return {
    overlap,
    score: union.size > 0 ? overlap.length / union.size : 0,
    keywords1: [...keywords1],
    keywords2: [...keywords2]
  };
}

// =============================================================================
// TEMPORAL ANALYSIS
// =============================================================================

function getTemporalProximity(date1, date2, windowDays = 7) {
  if (!date1 || !date2) return 0;
  
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d1 - d2);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  if (diffDays <= windowDays) {
    return 1 - (diffDays / windowDays);
  }
  return 0;
}

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

function extractEntities(data) {
  const entities = {
    companies: new Set(),
    people: new Set(),
    locations: new Set(),
    technologies: new Set(),
    categories: new Set()
  };
  
  // Extract from different data types
  if (data.company) entities.companies.add(data.company.toLowerCase());
  if (data.vendor) entities.companies.add(data.vendor.toLowerCase());
  if (data.who_for) entities.people.add(data.who_for.toLowerCase());
  if (data.location) entities.locations.add(data.location.toLowerCase());
  if (data.category) entities.categories.add(data.category.toLowerCase());
  if (data.tech_stack) {
    data.tech_stack.forEach(t => entities.technologies.add(t.toLowerCase()));
  }
  if (data.tags) {
    data.tags.forEach(t => entities.categories.add(t.toLowerCase()));
  }
  
  return entities;
}

function findEntityOverlap(entities1, entities2) {
  const overlaps = [];
  
  for (const [type, set1] of Object.entries(entities1)) {
    const set2 = entities2[type];
    if (!set2) continue;
    
    const overlap = [...set1].filter(e => set2.has(e));
    if (overlap.length > 0) {
      overlaps.push({ type, values: overlap });
    }
  }
  
  return overlaps;
}

// =============================================================================
// DISCOVERY GENERATION
// =============================================================================

function generateInsight(pattern, data1, data2, matchDetails) {
  const templates = {
    temporal: [
      `📅 Within the same week: "${data1.title || data1.name || data1.vendor}" and "${data2.title || data2.name || data2.company}". Coincidence?`,
      `⏰ Interesting timing - these two events happened ${matchDetails.daysDiff || 'close'} days apart.`
    ],
    location: [
      `📍 "${matchDetails.location}" appears in both your expenses and another record. You might know this place better than you think.`,
      `🗺️ Location connection found: ${matchDetails.location}. Physical presence creates opportunities.`
    ],
    semantic: [
      `🔗 The keyword "${matchDetails.keyword}" connects these items. You're building expertise in this area.`,
      `💡 Shared themes detected: [${matchDetails.keywords?.join(', ')}]. Your interests are converging.`
    ],
    financial: [
      `💰 Your spending on "${data1.category}" might relate to your interest in "${data2.name || data2.title}".`,
      `💵 Financial signal: Money flows where attention goes.`
    ],
    network: [
      `👥 "${matchDetails.entity}" appears in multiple contexts. This could be a key connection.`,
      `🌐 Network node detected: ${matchDetails.entity}. Consider strengthening this relationship.`
    ],
    opportunity: [
      `🎯 OPPORTUNITY: ${matchDetails.insight}`,
      `✨ Hidden gem found: ${matchDetails.insight}`
    ]
  };
  
  const options = templates[pattern] || templates.semantic;
  return options[Math.floor(Math.random() * options.length)];
}

// =============================================================================
// MAIN DISCOVERY ENGINE
// =============================================================================

async function discoverConnections(pool, options = {}) {
  const {
    limit = 10,
    minScore = 0.5,
    includeTypes = ['expenses', 'briefings', 'jobs', 'ideas', 'resources'],
    timeWindowDays = 90
  } = options;
  
  const discoveries = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);
  
  // Fetch all relevant data
  const data = {};
  
  try {
    if (includeTypes.includes('expenses')) {
      const result = await pool.query(
        `SELECT id, amount, category, description, vendor, date, meal_type, food_type, who_for
         FROM lumen_expenses 
         WHERE date >= $1 
         ORDER BY date DESC LIMIT 100`,
        [cutoffDate]
      );
      data.expenses = result.rows;
    }
    
    if (includeTypes.includes('briefings')) {
      const result = await pool.query(
        `SELECT id, type, title, content, summary, tags, created_at
         FROM lumen_briefings 
         WHERE (archived = FALSE OR archived IS NULL)
         AND created_at >= $1
         ORDER BY created_at DESC LIMIT 50`,
        [cutoffDate]
      );
      data.briefings = result.rows;
    }
    
    if (includeTypes.includes('jobs')) {
      const result = await pool.query(
        `SELECT id, title, company, location, description, fit_notes, status, tags, created_at
         FROM lumen_jobs 
         WHERE (archived = FALSE OR archived IS NULL)
         ORDER BY created_at DESC LIMIT 50`
      );
      data.jobs = result.rows;
    }
    
    if (includeTypes.includes('ideas')) {
      const result = await pool.query(
        `SELECT id, name, category, type, description, revenue_potential, tech_stack, status, tags, created_at
         FROM lumen_ideas 
         ORDER BY created_at DESC LIMIT 50`
      );
      data.ideas = result.rows;
    }
    
    if (includeTypes.includes('resources')) {
      const result = await pool.query(
        `SELECT id, type, title, url, description, category, tags, created_at
         FROM lumen_resources 
         WHERE (archived = FALSE OR archived IS NULL)
         ORDER BY created_at DESC LIMIT 50`
      );
      data.resources = result.rows;
    }
  } catch (err) {
    console.error('[Serendipity] Error fetching data:', err);
    throw err;
  }
  
  // Run seed pattern detectors
  for (const seedPattern of SEED_CONNECTIONS) {
    const [type1, type2] = seedPattern.sources;
    const items1 = data[type1] || [];
    const items2 = data[type2] || [];
    
    for (const item1 of items1) {
      for (const item2 of items2) {
        try {
          const result = seedPattern.detect(item1, item2);
          if (result && result.score >= minScore) {
            discoveries.push({
              id: `${seedPattern.id}-${item1.id}-${item2.id}`,
              pattern: seedPattern.name,
              patternType: seedPattern.id,
              score: result.score,
              insight: result.insight,
              sources: [
                { type: type1, id: item1.id, preview: item1.title || item1.name || item1.vendor },
                { type: type2, id: item2.id, preview: item2.title || item2.name || item2.company }
              ],
              discoveredAt: new Date().toISOString()
            });
          }
        } catch (err) {
          // Skip failed pattern matching
        }
      }
    }
  }
  
  // Cross-type semantic analysis
  const allItems = [];
  for (const [type, items] of Object.entries(data)) {
    items.forEach(item => {
      const text = [
        item.title, item.name, item.description, item.content,
        item.summary, item.vendor, item.company, item.fit_notes
      ].filter(Boolean).join(' ');
      
      allItems.push({
        type,
        id: item.id,
        item,
        text,
        keywords: extractKeywords(text),
        entities: extractEntities(item),
        date: item.created_at || item.date
      });
    });
  }
  
  // Find cross-type keyword connections
  for (let i = 0; i < allItems.length; i++) {
    for (let j = i + 1; j < allItems.length; j++) {
      const a = allItems[i];
      const b = allItems[j];
      
      // Skip same-type comparisons
      if (a.type === b.type) continue;
      
      // Check keyword overlap
      const keywordOverlap = a.keywords.filter(k => b.keywords.includes(k));
      if (keywordOverlap.length >= 2) {
        const score = Math.min(0.6 + (keywordOverlap.length * 0.1), 0.95);
        
        if (score >= minScore) {
          discoveries.push({
            id: `semantic-${a.type}-${a.id}-${b.type}-${b.id}`,
            pattern: CONNECTION_PATTERNS.semantic.name,
            patternType: 'semantic',
            score,
            insight: `🔗 Shared keywords [${keywordOverlap.slice(0, 3).join(', ')}] connect your ${a.type.slice(0, -1)} and ${b.type.slice(0, -1)}. You're building a theme here.`,
            sources: [
              { type: a.type, id: a.id, preview: a.item.title || a.item.name || a.item.vendor },
              { type: b.type, id: b.id, preview: b.item.title || b.item.name || b.item.company }
            ],
            keywords: keywordOverlap,
            discoveredAt: new Date().toISOString()
          });
        }
      }
      
      // Check entity overlap
      const entityOverlaps = findEntityOverlap(a.entities, b.entities);
      for (const overlap of entityOverlaps) {
        if (overlap.type === 'categories') continue; // Categories are too broad
        
        const score = overlap.type === 'companies' ? 0.9 : 
                     overlap.type === 'people' ? 0.85 : 0.75;
        
        if (score >= minScore) {
          discoveries.push({
            id: `entity-${overlap.type}-${a.type}-${a.id}-${b.type}-${b.id}`,
            pattern: CONNECTION_PATTERNS.network.name,
            patternType: 'network',
            score,
            insight: `👥 "${overlap.values[0]}" appears in both your ${a.type} and ${b.type}. This ${overlap.type.slice(0, -1)} is a connection point.`,
            sources: [
              { type: a.type, id: a.id, preview: a.item.title || a.item.name || a.item.vendor },
              { type: b.type, id: b.id, preview: b.item.title || b.item.name || b.item.company }
            ],
            entity: overlap.values[0],
            entityType: overlap.type,
            discoveredAt: new Date().toISOString()
          });
        }
      }
      
      // Check temporal proximity
      const temporalScore = getTemporalProximity(a.date, b.date, 7);
      if (temporalScore > 0.5 && temporalScore >= minScore) {
        const daysDiff = Math.round((1 - temporalScore) * 7);
        discoveries.push({
          id: `temporal-${a.type}-${a.id}-${b.type}-${b.id}`,
          pattern: CONNECTION_PATTERNS.temporal.name,
          patternType: 'temporal',
          score: temporalScore * 0.7, // Temporal alone is weaker signal
          insight: `📅 These happened ${daysDiff === 0 ? 'the same day' : `within ${daysDiff} days`}: "${a.item.title || a.item.name || a.item.vendor}" and "${b.item.title || b.item.name || b.item.company}". Related activities?`,
          sources: [
            { type: a.type, id: a.id, preview: a.item.title || a.item.name || a.item.vendor },
            { type: b.type, id: b.id, preview: b.item.title || b.item.name || b.item.company }
          ],
          daysDiff,
          discoveredAt: new Date().toISOString()
        });
      }
    }
  }
  
  // Generate opportunity discoveries based on combined patterns
  const opportunityPatterns = await generateOpportunities(data, discoveries);
  discoveries.push(...opportunityPatterns);
  
  // Deduplicate by source pair (keep highest score)
  const seen = new Map();
  const dedupedDiscoveries = [];
  
  for (const d of discoveries) {
    const key = d.sources.map(s => `${s.type}:${s.id}`).sort().join('|');
    const existing = seen.get(key);
    
    if (!existing || d.score > existing.score) {
      seen.set(key, d);
    }
  }
  
  for (const d of seen.values()) {
    dedupedDiscoveries.push(d);
  }
  
  // Sort by score and limit
  dedupedDiscoveries.sort((a, b) => b.score - a.score);
  
  return {
    discoveries: dedupedDiscoveries.slice(0, limit),
    stats: {
      totalFound: dedupedDiscoveries.length,
      returned: Math.min(dedupedDiscoveries.length, limit),
      dataScanned: {
        expenses: (data.expenses || []).length,
        briefings: (data.briefings || []).length,
        jobs: (data.jobs || []).length,
        ideas: (data.ideas || []).length,
        resources: (data.resources || []).length
      },
      patterns: Object.fromEntries(
        Object.entries(
          dedupedDiscoveries.reduce((acc, d) => {
            acc[d.patternType] = (acc[d.patternType] || 0) + 1;
            return acc;
          }, {})
        )
      )
    },
    generatedAt: new Date().toISOString()
  };
}

// =============================================================================
// OPPORTUNITY GENERATION
// =============================================================================

async function generateOpportunities(data, existingDiscoveries) {
  const opportunities = [];
  
  // Pattern: Job + Idea alignment
  const jobs = data.jobs || [];
  const ideas = data.ideas || [];
  
  for (const job of jobs) {
    for (const idea of ideas) {
      // Check if job could fund/relate to idea
      const jobText = [job.title, job.description, job.company].filter(Boolean).join(' ').toLowerCase();
      const ideaText = [idea.name, idea.description, idea.category].filter(Boolean).join(' ').toLowerCase();
      
      const overlap = findKeywordOverlap(jobText, ideaText);
      if (overlap.score > 0.1 && overlap.overlap.length >= 1) {
        opportunities.push({
          id: `opportunity-job-idea-${job.id}-${idea.id}`,
          pattern: CONNECTION_PATTERNS.opportunity.name,
          patternType: 'opportunity',
          score: 0.85,
          insight: `🎯 OPPORTUNITY: Your job interest at "${job.company}" aligns with your idea "${idea.name}". This job could fund or accelerate your startup!`,
          sources: [
            { type: 'jobs', id: job.id, preview: `${job.title} at ${job.company}` },
            { type: 'ideas', id: idea.id, preview: idea.name }
          ],
          actionable: true,
          suggestedAction: `Consider mentioning your ${idea.category} interests in the interview.`,
          discoveredAt: new Date().toISOString()
        });
      }
    }
  }
  
  // Pattern: Recurring expense + Idea validation
  const expenses = data.expenses || [];
  const expensesByCategory = {};
  
  for (const expense of expenses) {
    const cat = expense.category || 'Other';
    if (!expensesByCategory[cat]) {
      expensesByCategory[cat] = { count: 0, total: 0, expenses: [] };
    }
    expensesByCategory[cat].count++;
    expensesByCategory[cat].total += parseFloat(expense.amount) || 0;
    expensesByCategory[cat].expenses.push(expense);
  }
  
  for (const idea of ideas) {
    for (const [category, stats] of Object.entries(expensesByCategory)) {
      if (stats.count >= 3) {
        const ideaText = [idea.name, idea.description].filter(Boolean).join(' ').toLowerCase();
        if (ideaText.includes(category.toLowerCase())) {
          opportunities.push({
            id: `opportunity-expense-validation-${category}-${idea.id}`,
            pattern: CONNECTION_PATTERNS.opportunity.name,
            patternType: 'opportunity',
            score: 0.9,
            insight: `🎯 MARKET VALIDATION: You've spent $${stats.total.toFixed(2)} on "${category}" (${stats.count} times). Your idea "${idea.name}" solves a problem you personally pay to solve!`,
            sources: [
              { type: 'expenses', id: stats.expenses[0].id, preview: `${category} (${stats.count} expenses)` },
              { type: 'ideas', id: idea.id, preview: idea.name }
            ],
            actionable: true,
            suggestedAction: `You're the customer. Document your pain points as user research.`,
            stats: { count: stats.count, total: stats.total },
            discoveredAt: new Date().toISOString()
          });
        }
      }
    }
  }
  
  // Pattern: Briefing trend + Resource learning
  const briefings = data.briefings || [];
  const resources = data.resources || [];
  
  const trendTopics = {};
  for (const briefing of briefings) {
    const tags = briefing.tags || [];
    for (const tag of tags) {
      trendTopics[tag.toLowerCase()] = (trendTopics[tag.toLowerCase()] || 0) + 1;
    }
  }
  
  const hotTopics = Object.entries(trendTopics)
    .filter(([_, count]) => count >= 2)
    .map(([topic]) => topic);
  
  for (const resource of resources) {
    const resourceText = [resource.title, resource.description].filter(Boolean).join(' ').toLowerCase();
    
    for (const topic of hotTopics) {
      if (resourceText.includes(topic)) {
        opportunities.push({
          id: `opportunity-trend-learning-${topic}-${resource.id}`,
          pattern: CONNECTION_PATTERNS.opportunity.name,
          patternType: 'opportunity',
          score: 0.8,
          insight: `🎯 TREND ALIGNMENT: "${topic}" appeared in ${trendTopics[topic]} of your briefings, and you have a learning resource for it: "${resource.title}". You're tracking something important!`,
          sources: [
            { type: 'briefings', id: briefings[0].id, preview: `${topic} (${trendTopics[topic]} mentions)` },
            { type: 'resources', id: resource.id, preview: resource.title }
          ],
          actionable: true,
          suggestedAction: `Prioritize learning "${resource.title}" - this trend is heating up.`,
          discoveredAt: new Date().toISOString()
        });
      }
    }
  }
  
  return opportunities;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  discoverConnections,
  CONNECTION_PATTERNS,
  SEED_CONNECTIONS,
  extractKeywords,
  findKeywordOverlap,
  extractEntities,
  getTemporalProximity
};
