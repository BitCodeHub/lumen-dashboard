/**
 * 🕰️ CONTEXT RESURRECTION ENGINE
 * Time Travel for Decisions - Recreate the full context of any past moment
 * 
 * "What was I thinking when I made that decision?"
 * "What was happening in my life around that date?"
 * "Show me the context behind that choice."
 * 
 * Jimmy & Lumen AI Solutions
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_WINDOW_DAYS = 7;  // Default ±7 days around target date
const MAX_ITEMS_PER_TYPE = 50;  // Max items to return per category
const RELEVANCE_WEIGHTS = {
  exact_date: 1.0,      // Exact date match
  same_day: 0.95,       // Same day
  within_3_days: 0.8,   // Within 3 days
  within_7_days: 0.6,   // Within a week
  keyword_match: 0.3,   // Keyword boost
  description_match: 0.2 // Description match boost
};

// =============================================================================
// CONTEXT CATEGORIES - What we're looking for
// =============================================================================

const CONTEXT_CATEGORIES = {
  briefings: {
    name: 'Briefings & Reports',
    icon: '📋',
    description: 'What you were being informed about',
    table: 'lumen_briefings',
    dateField: 'created_at',
    relevantFields: ['title', 'content', 'summary', 'type', 'tags']
  },
  expenses: {
    name: 'Spending Activity',
    icon: '💰',
    description: 'What you were spending money on',
    table: 'lumen_expenses',
    dateField: 'date',
    relevantFields: ['description', 'vendor', 'category', 'amount', 'items']
  },
  jobs: {
    name: 'Career Tracking',
    icon: '💼',
    description: 'Jobs you were tracking or considering',
    table: 'lumen_jobs',
    dateField: 'created_at',
    relevantFields: ['title', 'company', 'description', 'status', 'fit_notes']
  },
  ideas: {
    name: 'Ideas & Projects',
    icon: '💡',
    description: 'Ideas you were exploring',
    table: 'lumen_ideas',
    dateField: 'created_at',
    relevantFields: ['name', 'description', 'category', 'status', 'notes', 'tech_stack']
  },
  resources: {
    name: 'Saved Resources',
    icon: '🔗',
    description: 'Links and resources you were collecting',
    table: 'lumen_resources',
    dateField: 'created_at',
    relevantFields: ['title', 'description', 'url', 'category', 'tags']
  },
  pitches: {
    name: 'Shark Tank Pitches',
    icon: '🦈',
    description: 'Ideas you were pitching/evaluating',
    table: 'lumen_pitches',
    dateField: 'pitch_date',
    relevantFields: ['idea_name', 'pitch_content', 'verdict', 'trend_signal']
  }
};

// =============================================================================
// CORE RESURRECTION FUNCTIONS
// =============================================================================

/**
 * Query a specific table for items within the date range
 */
async function queryTimeRange(pool, tableName, dateField, startDate, endDate, keywords = []) {
  try {
    let query = `
      SELECT *, 
             $3::timestamp AS target_start,
             $4::timestamp AS target_end,
             ${dateField} AS item_date
      FROM ${tableName}
      WHERE ${dateField} BETWEEN $1 AND $2
      ORDER BY ${dateField} DESC
      LIMIT $5
    `;
    
    const result = await pool.query(query, [
      startDate, 
      endDate, 
      startDate, 
      endDate,
      MAX_ITEMS_PER_TYPE
    ]);
    
    return result.rows;
  } catch (err) {
    console.error(`[ContextResurrection] Error querying ${tableName}:`, err.message);
    return [];
  }
}

/**
 * Calculate relevance score for an item based on date proximity and keyword matches
 */
function calculateRelevance(item, targetDate, keywords = []) {
  const itemDate = new Date(item.item_date || item.created_at || item.date);
  const target = new Date(targetDate);
  
  // Calculate days difference
  const daysDiff = Math.abs((itemDate - target) / (1000 * 60 * 60 * 24));
  
  // Base score from date proximity
  let score = 0;
  if (daysDiff === 0) {
    score = RELEVANCE_WEIGHTS.exact_date;
  } else if (daysDiff < 1) {
    score = RELEVANCE_WEIGHTS.same_day;
  } else if (daysDiff <= 3) {
    score = RELEVANCE_WEIGHTS.within_3_days;
  } else if (daysDiff <= 7) {
    score = RELEVANCE_WEIGHTS.within_7_days;
  } else {
    score = Math.max(0.1, 0.5 - (daysDiff * 0.05));
  }
  
  // Boost for keyword matches
  if (keywords.length > 0) {
    const itemText = JSON.stringify(item).toLowerCase();
    let keywordMatches = 0;
    
    for (const keyword of keywords) {
      if (itemText.includes(keyword.toLowerCase())) {
        keywordMatches++;
      }
    }
    
    if (keywordMatches > 0) {
      score += RELEVANCE_WEIGHTS.keyword_match * (keywordMatches / keywords.length);
    }
  }
  
  return Math.min(1.0, score);
}

/**
 * Main resurrection function - pull together all context for a date/event
 */
async function resurrectContext(pool, options = {}) {
  const {
    date,                    // Target date (required)
    event_description,       // Optional: description of the event/decision
    keywords = [],           // Optional: specific keywords to look for
    window_days = DEFAULT_WINDOW_DAYS, // Days before and after to search
    categories = Object.keys(CONTEXT_CATEGORIES) // Which categories to search
  } = options;
  
  if (!date) {
    throw new Error('Date is required for context resurrection');
  }
  
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new Error('Invalid date format');
  }
  
  // Calculate date range
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - window_days);
  
  const endDate = new Date(targetDate);
  endDate.setDate(endDate.getDate() + window_days);
  
  console.log(`[ContextResurrection] Resurrecting context for ${targetDate.toISOString()}`);
  console.log(`[ContextResurrection] Window: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  // Extract keywords from event description if provided
  const searchKeywords = [...keywords];
  if (event_description) {
    // Extract meaningful words (3+ chars, not common words)
    const stopWords = ['the', 'and', 'was', 'were', 'with', 'for', 'that', 'this', 'from', 'have', 'had'];
    const words = event_description.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.includes(w));
    searchKeywords.push(...words);
  }
  
  // Query all relevant categories in parallel
  const contextData = {};
  const queryPromises = [];
  
  for (const categoryKey of categories) {
    const category = CONTEXT_CATEGORIES[categoryKey];
    if (!category) continue;
    
    const promise = queryTimeRange(
      pool,
      category.table,
      category.dateField,
      startDate.toISOString(),
      endDate.toISOString(),
      searchKeywords
    ).then(items => {
      // Calculate relevance and sort
      const scoredItems = items.map(item => ({
        ...item,
        relevance_score: calculateRelevance(item, targetDate, searchKeywords)
      })).sort((a, b) => b.relevance_score - a.relevance_score);
      
      contextData[categoryKey] = {
        ...category,
        items: scoredItems,
        count: scoredItems.length,
        high_relevance_count: scoredItems.filter(i => i.relevance_score >= 0.7).length
      };
    });
    
    queryPromises.push(promise);
  }
  
  await Promise.all(queryPromises);
  
  // Generate context snapshot
  const snapshot = generateContextSnapshot(contextData, targetDate, event_description, searchKeywords);
  
  return {
    target_date: targetDate.toISOString(),
    window: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      days: window_days
    },
    event_description,
    keywords: searchKeywords,
    categories: contextData,
    snapshot,
    meta: {
      total_items: Object.values(contextData).reduce((sum, cat) => sum + cat.count, 0),
      high_relevance_items: Object.values(contextData).reduce((sum, cat) => sum + cat.high_relevance_count, 0),
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Generate a narrative snapshot of the context
 */
function generateContextSnapshot(contextData, targetDate, eventDescription, keywords) {
  const dateStr = targetDate.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const sections = [];
  
  // Header
  sections.push(`# Context Snapshot: ${dateStr}`);
  sections.push('');
  
  if (eventDescription) {
    sections.push(`> **Event/Decision:** ${eventDescription}`);
    sections.push('');
  }
  
  // Summary statistics
  const totalItems = Object.values(contextData).reduce((sum, cat) => sum + cat.count, 0);
  const highRelevance = Object.values(contextData).reduce((sum, cat) => sum + cat.high_relevance_count, 0);
  
  sections.push(`## Overview`);
  sections.push(`Found **${totalItems} items** in your data around this date (${highRelevance} highly relevant).`);
  sections.push('');
  
  // Process each category
  for (const [key, category] of Object.entries(contextData)) {
    if (category.count === 0) continue;
    
    sections.push(`## ${category.icon} ${category.name} (${category.count})`);
    sections.push(`*${category.description}*`);
    sections.push('');
    
    // Show top items
    const topItems = category.items.slice(0, 5);
    
    switch(key) {
      case 'briefings':
        topItems.forEach(item => {
          const stars = item.relevance_score >= 0.8 ? '⭐ ' : '';
          sections.push(`- ${stars}**${item.title}** (${item.type})`);
          if (item.summary) {
            sections.push(`  > ${item.summary.substring(0, 150)}...`);
          }
        });
        break;
        
      case 'expenses':
        const totalSpent = category.items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
        sections.push(`*Total spending in window: $${totalSpent.toFixed(2)}*`);
        sections.push('');
        topItems.forEach(item => {
          const stars = item.relevance_score >= 0.8 ? '⭐ ' : '';
          sections.push(`- ${stars}**$${item.amount}** at ${item.vendor || 'Unknown'} (${item.category})`);
          if (item.description) {
            sections.push(`  > ${item.description.substring(0, 100)}`);
          }
        });
        break;
        
      case 'jobs':
        topItems.forEach(item => {
          const stars = item.relevance_score >= 0.8 ? '⭐ ' : '';
          sections.push(`- ${stars}**${item.title}** at ${item.company}`);
          sections.push(`  Status: ${item.status || 'new'} | ${item.salary_text || 'Salary not specified'}`);
        });
        break;
        
      case 'ideas':
        topItems.forEach(item => {
          const stars = item.relevance_score >= 0.8 ? '⭐ ' : '';
          sections.push(`- ${stars}**${item.name}** (${item.category})`);
          sections.push(`  Status: ${item.status || 'idea'} | Revenue: ${item.revenue_potential || 'TBD'}`);
          if (item.description) {
            sections.push(`  > ${item.description.substring(0, 100)}...`);
          }
        });
        break;
        
      case 'resources':
        topItems.forEach(item => {
          const stars = item.relevance_score >= 0.8 ? '⭐ ' : '';
          sections.push(`- ${stars}**${item.title}**`);
          if (item.url) sections.push(`  [${item.url.substring(0, 50)}...]`);
        });
        break;
        
      case 'pitches':
        topItems.forEach(item => {
          const stars = item.relevance_score >= 0.8 ? '⭐ ' : '';
          const verdict = item.verdict === 'approved' ? '✅' : item.verdict === 'rejected' ? '❌' : '⏳';
          sections.push(`- ${stars}${verdict} **${item.idea_name}**`);
          if (item.trend_signal) {
            sections.push(`  > Trend: ${item.trend_signal.substring(0, 100)}`);
          }
        });
        break;
    }
    
    if (category.count > 5) {
      sections.push(`  *...and ${category.count - 5} more*`);
    }
    sections.push('');
  }
  
  // Generate insights section
  sections.push('## 🔮 Context Insights');
  sections.push('');
  
  const insights = generateInsights(contextData, targetDate, keywords);
  insights.forEach(insight => {
    sections.push(`- ${insight}`);
  });
  
  if (insights.length === 0) {
    sections.push('*No specific patterns detected. The data speaks for itself.*');
  }
  
  sections.push('');
  sections.push('---');
  sections.push(`*Generated by Context Resurrection Engine | ${new Date().toISOString()}*`);
  
  return sections.join('\n');
}

/**
 * Generate insights from the collected context
 */
function generateInsights(contextData, targetDate, keywords) {
  const insights = [];
  
  // Check for heavy spending periods
  if (contextData.expenses && contextData.expenses.count > 5) {
    const totalSpent = contextData.expenses.items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    if (totalSpent > 500) {
      const topCategory = findTopCategory(contextData.expenses.items);
      insights.push(`**Spending spike detected:** $${totalSpent.toFixed(2)} spent, primarily on ${topCategory}`);
    }
  }
  
  // Check for job search activity
  if (contextData.jobs && contextData.jobs.count > 2) {
    const companies = [...new Set(contextData.jobs.items.map(j => j.company))];
    insights.push(`**Active job searching:** Tracking ${contextData.jobs.count} roles at ${companies.slice(0, 3).join(', ')}${companies.length > 3 ? '...' : ''}`);
  }
  
  // Check for idea exploration
  if (contextData.ideas && contextData.ideas.count > 1) {
    const statuses = [...new Set(contextData.ideas.items.map(i => i.status))];
    insights.push(`**Ideation phase:** ${contextData.ideas.count} ideas being explored (${statuses.join(', ')})`);
  }
  
  // Check for learning/research activity
  if (contextData.resources && contextData.resources.count > 3) {
    const categories = [...new Set(contextData.resources.items.map(r => r.category).filter(Boolean))];
    if (categories.length > 0) {
      insights.push(`**Research focus:** Collecting resources in ${categories.slice(0, 3).join(', ')}`);
    }
  }
  
  // Cross-category insights
  if (contextData.jobs?.count > 0 && contextData.expenses?.count > 0) {
    // Look for interview-related expenses
    const interviewKeywords = ['coffee', 'uber', 'lyft', 'parking', 'lunch', 'dry clean', 'suit'];
    const possibleInterviewExpenses = contextData.expenses.items.filter(e => {
      const text = `${e.vendor || ''} ${e.description || ''}`.toLowerCase();
      return interviewKeywords.some(k => text.includes(k));
    });
    
    if (possibleInterviewExpenses.length > 0) {
      insights.push(`**Possible interview prep:** Found ${possibleInterviewExpenses.length} expense(s) that might be interview-related`);
    }
  }
  
  // Check for briefing themes
  if (contextData.briefings && contextData.briefings.count > 0) {
    const types = [...new Set(contextData.briefings.items.map(b => b.type))];
    insights.push(`**Information diet:** Consuming ${types.join(', ')} briefings`);
  }
  
  return insights;
}

/**
 * Helper: Find the top spending category
 */
function findTopCategory(expenses) {
  const categoryTotals = {};
  for (const expense of expenses) {
    const cat = expense.category || 'Other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(expense.amount || 0);
  }
  
  let topCategory = 'Other';
  let topAmount = 0;
  for (const [cat, amount] of Object.entries(categoryTotals)) {
    if (amount > topAmount) {
      topAmount = amount;
      topCategory = cat;
    }
  }
  
  return topCategory;
}

/**
 * Get available date range for resurrection
 */
async function getAvailableDateRange(pool) {
  try {
    const queries = Object.entries(CONTEXT_CATEGORIES).map(async ([key, cat]) => {
      const result = await pool.query(`
        SELECT MIN(${cat.dateField}) as earliest, MAX(${cat.dateField}) as latest
        FROM ${cat.table}
      `);
      return result.rows[0];
    });
    
    const results = await Promise.all(queries);
    
    let earliest = null;
    let latest = null;
    
    for (const result of results) {
      if (result.earliest) {
        const date = new Date(result.earliest);
        if (!earliest || date < earliest) earliest = date;
      }
      if (result.latest) {
        const date = new Date(result.latest);
        if (!latest || date > latest) latest = date;
      }
    }
    
    return {
      earliest: earliest?.toISOString() || null,
      latest: latest?.toISOString() || null,
      has_data: earliest !== null
    };
  } catch (err) {
    console.error('[ContextResurrection] Error getting date range:', err.message);
    return { earliest: null, latest: null, has_data: false };
  }
}

/**
 * Get a timeline of activity density (for visualization)
 */
async function getActivityTimeline(pool, options = {}) {
  const { start_date, end_date, granularity = 'day' } = options;
  
  const timeFormat = granularity === 'week' ? 'YYYY-WW' : 
                     granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
  
  try {
    // Query each category for activity counts by date
    const activityPromises = Object.entries(CONTEXT_CATEGORIES).map(async ([key, cat]) => {
      let query = `
        SELECT 
          TO_CHAR(${cat.dateField}, '${timeFormat}') as period,
          COUNT(*) as count
        FROM ${cat.table}
        WHERE ${cat.dateField} IS NOT NULL
      `;
      
      const params = [];
      if (start_date) {
        params.push(start_date);
        query += ` AND ${cat.dateField} >= $${params.length}`;
      }
      if (end_date) {
        params.push(end_date);
        query += ` AND ${cat.dateField} <= $${params.length}`;
      }
      
      query += ` GROUP BY period ORDER BY period`;
      
      const result = await pool.query(query, params);
      return { category: key, data: result.rows };
    });
    
    const results = await Promise.all(activityPromises);
    
    // Combine into timeline
    const timeline = {};
    for (const { category, data } of results) {
      for (const row of data) {
        if (!timeline[row.period]) {
          timeline[row.period] = { period: row.period, total: 0 };
        }
        timeline[row.period][category] = parseInt(row.count);
        timeline[row.period].total += parseInt(row.count);
      }
    }
    
    return Object.values(timeline).sort((a, b) => a.period.localeCompare(b.period));
  } catch (err) {
    console.error('[ContextResurrection] Error getting timeline:', err.message);
    return [];
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  resurrectContext,
  getAvailableDateRange,
  getActivityTimeline,
  CONTEXT_CATEGORIES
};
