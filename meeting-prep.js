/**
 * Meeting Prep Autopilot
 * Generates comprehensive briefings before meetings - like having a chief of staff
 * 
 * @module meeting-prep
 */

// ============================================
// CONFIGURATION
// ============================================

const PREP_CONFIG = {
  // Minimum context to generate a useful briefing
  minPersonNameLength: 2,
  // Max items to pull from history
  maxHistoryItems: 10,
  // How many days back to look for "recent" interactions
  recentDays: 90,
  // Briefing components
  sections: [
    'person_background',
    'company_intel', 
    'interaction_history',
    'talking_points',
    'potential_gotchas',
    'meeting_agenda'
  ]
};

// Known company patterns for better matching
const COMPANY_ALIASES = {
  'google': ['google', 'alphabet', 'goog', 'googl'],
  'amazon': ['amazon', 'aws', 'amzn'],
  'microsoft': ['microsoft', 'msft', 'azure'],
  'apple': ['apple', 'aapl', 'cupertino'],
  'meta': ['meta', 'facebook', 'fb', 'instagram', 'whatsapp'],
  'netflix': ['netflix', 'nflx'],
  'salesforce': ['salesforce', 'sfdc', 'crm'],
  'stripe': ['stripe'],
  'openai': ['openai', 'open ai'],
  'anthropic': ['anthropic', 'claude'],
};

// Role detection patterns
const ROLE_PATTERNS = {
  executive: ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'chief', 'president', 'founder', 'co-founder', 'partner'],
  director: ['director', 'vp', 'vice president', 'head of', 'svp', 'evp'],
  manager: ['manager', 'lead', 'team lead', 'supervisor'],
  individual: ['engineer', 'developer', 'designer', 'analyst', 'specialist', 'consultant'],
  sales: ['sales', 'account executive', 'ae', 'bdr', 'sdr', 'business development'],
  investor: ['investor', 'vc', 'venture', 'angel', 'capital', 'fund']
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize text for matching
 */
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}

/**
 * Check if text contains any pattern from array
 */
function containsAny(text, patterns) {
  const normalized = normalizeText(text);
  return patterns.some(p => normalized.includes(normalizeText(p)));
}

/**
 * Detect likely role category from title
 */
function detectRoleCategory(title) {
  if (!title) return 'unknown';
  const normalized = normalizeText(title);
  
  for (const [category, patterns] of Object.entries(ROLE_PATTERNS)) {
    if (containsAny(normalized, patterns)) {
      return category;
    }
  }
  return 'unknown';
}

/**
 * Find company aliases for better matching
 */
function getCompanySearchTerms(company) {
  if (!company) return [];
  const normalized = normalizeText(company);
  
  for (const [canonical, aliases] of Object.entries(COMPANY_ALIASES)) {
    if (aliases.some(a => normalized.includes(a))) {
      return [company, ...aliases];
    }
  }
  return [company];
}

/**
 * Format date for display
 */
function formatDate(date) {
  if (!date) return 'TBD';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Calculate days until meeting
 */
function daysUntil(date) {
  if (!date) return null;
  const meeting = new Date(date);
  const now = new Date();
  const diff = Math.ceil((meeting - now) / (1000 * 60 * 60 * 24));
  return diff;
}

// ============================================
// DATABASE QUERIES
// ============================================

/**
 * Search briefings for mentions of person or company
 */
async function searchBriefingsHistory(pool, personName, company) {
  const searchTerms = [personName, company, ...getCompanySearchTerms(company)].filter(Boolean);
  
  if (searchTerms.length === 0) return [];
  
  // Build search pattern
  const searchPattern = searchTerms.map(t => normalizeText(t)).filter(t => t.length > 2).join('|');
  
  if (!searchPattern) return [];
  
  try {
    const result = await pool.query(`
      SELECT id, type, title, content, summary, created_at, tags
      FROM lumen_briefings
      WHERE (archived = FALSE OR archived IS NULL)
        AND (
          LOWER(title) ~* $1 
          OR LOWER(content) ~* $1 
          OR LOWER(summary) ~* $1
        )
      ORDER BY created_at DESC
      LIMIT $2
    `, [searchPattern, PREP_CONFIG.maxHistoryItems]);
    
    return result.rows;
  } catch (err) {
    console.error('[MeetingPrep] Error searching briefings:', err.message);
    return [];
  }
}

/**
 * Search expenses for mentions of person or company
 */
async function searchExpensesHistory(pool, personName, company) {
  const searchTerms = [personName, company, ...getCompanySearchTerms(company)].filter(Boolean);
  
  if (searchTerms.length === 0) return [];
  
  const searchPattern = searchTerms.map(t => normalizeText(t)).filter(t => t.length > 2).join('|');
  
  if (!searchPattern) return [];
  
  try {
    const result = await pool.query(`
      SELECT id, amount, category, description, vendor, date, who_for
      FROM lumen_expenses
      WHERE 
        LOWER(description) ~* $1 
        OR LOWER(vendor) ~* $1 
        OR LOWER(who_for) ~* $1
      ORDER BY date DESC
      LIMIT $2
    `, [searchPattern, PREP_CONFIG.maxHistoryItems]);
    
    return result.rows;
  } catch (err) {
    console.error('[MeetingPrep] Error searching expenses:', err.message);
    return [];
  }
}

/**
 * Search jobs for mentions of company
 */
async function searchJobsHistory(pool, company) {
  if (!company) return [];
  
  const searchTerms = getCompanySearchTerms(company);
  const searchPattern = searchTerms.map(t => normalizeText(t)).filter(t => t.length > 2).join('|');
  
  if (!searchPattern) return [];
  
  try {
    const result = await pool.query(`
      SELECT id, title, company, location, salary_min, salary_max, description, fit_notes, status
      FROM lumen_jobs
      WHERE LOWER(company) ~* $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [searchPattern]);
    
    return result.rows;
  } catch (err) {
    console.error('[MeetingPrep] Error searching jobs:', err.message);
    return [];
  }
}

/**
 * Search ideas/pitches for mentions of company or person
 */
async function searchIdeasHistory(pool, personName, company) {
  const searchTerms = [personName, company, ...getCompanySearchTerms(company)].filter(Boolean);
  
  if (searchTerms.length === 0) return [];
  
  const searchPattern = searchTerms.map(t => normalizeText(t)).filter(t => t.length > 2).join('|');
  
  if (!searchPattern) return [];
  
  try {
    const result = await pool.query(`
      SELECT id, name, description, category, status, notes
      FROM lumen_ideas
      WHERE 
        LOWER(name) ~* $1 
        OR LOWER(description) ~* $1 
        OR LOWER(notes) ~* $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [searchPattern]);
    
    return result.rows;
  } catch (err) {
    console.error('[MeetingPrep] Error searching ideas:', err.message);
    return [];
  }
}

// ============================================
// BRIEFING GENERATION
// ============================================

/**
 * Generate person background section
 */
function generatePersonBackground(input, research = null) {
  const { person_name, company, role } = input;
  const roleCategory = detectRoleCategory(role);
  
  let section = `## 👤 About ${person_name}\n\n`;
  
  if (company) {
    section += `**Company:** ${company}\n`;
  }
  
  if (role) {
    section += `**Role:** ${role}\n`;
    section += `**Level:** ${roleCategory.charAt(0).toUpperCase() + roleCategory.slice(1)}\n`;
  }
  
  // Add research if available
  if (research && research.person) {
    section += `\n### Background\n${research.person}\n`;
  } else {
    section += `\n*💡 Tip: Research this person on LinkedIn before the meeting*\n`;
  }
  
  return section;
}

/**
 * Generate company intel section
 */
function generateCompanyIntel(input, research = null, jobHistory = []) {
  const { company } = input;
  
  if (!company) {
    return `## 🏢 Company Intel\n\n*No company specified*\n`;
  }
  
  let section = `## 🏢 Company Intel: ${company}\n\n`;
  
  // Add research if available
  if (research && research.company) {
    section += research.company + '\n\n';
  }
  
  // Add job history if found
  if (jobHistory.length > 0) {
    section += `### 📋 Your History with ${company}\n\n`;
    section += `You have **${jobHistory.length} job listing(s)** from this company:\n\n`;
    
    jobHistory.forEach(job => {
      section += `- **${job.title}** (${job.location || 'Remote'})\n`;
      if (job.salary_min && job.salary_max) {
        section += `  Salary: $${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}\n`;
      }
      if (job.status) {
        section += `  Status: ${job.status}\n`;
      }
    });
    section += '\n';
  }
  
  return section;
}

/**
 * Generate interaction history section
 */
function generateInteractionHistory(briefingsHistory, expensesHistory, ideasHistory) {
  let section = `## 📜 Your History\n\n`;
  
  const hasHistory = briefingsHistory.length > 0 || expensesHistory.length > 0 || ideasHistory.length > 0;
  
  if (!hasHistory) {
    section += `*No prior interactions found in your data*\n\n`;
    return section;
  }
  
  // Briefings mentioning them
  if (briefingsHistory.length > 0) {
    section += `### 📝 Relevant Briefings\n\n`;
    briefingsHistory.forEach(b => {
      const date = new Date(b.created_at).toLocaleDateString();
      section += `- **[${b.type}]** ${b.title} *(${date})*\n`;
      if (b.summary) {
        section += `  > ${b.summary.substring(0, 150)}...\n`;
      }
    });
    section += '\n';
  }
  
  // Expenses related to them
  if (expensesHistory.length > 0) {
    section += `### 💸 Related Expenses\n\n`;
    const totalSpent = expensesHistory.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    section += `**Total spent:** $${totalSpent.toFixed(2)} across ${expensesHistory.length} transaction(s)\n\n`;
    
    expensesHistory.slice(0, 5).forEach(e => {
      const date = new Date(e.date).toLocaleDateString();
      section += `- $${parseFloat(e.amount).toFixed(2)} at ${e.vendor || 'Unknown'} *(${date})*`;
      if (e.who_for) section += ` - with ${e.who_for}`;
      section += '\n';
    });
    section += '\n';
  }
  
  // Ideas related to them
  if (ideasHistory.length > 0) {
    section += `### 💡 Related Ideas/Projects\n\n`;
    ideasHistory.forEach(i => {
      section += `- **${i.name}** [${i.status || 'idea'}] - ${i.description?.substring(0, 100)}...\n`;
    });
    section += '\n';
  }
  
  return section;
}

/**
 * Generate talking points based on context
 */
function generateTalkingPoints(input, history) {
  const { meeting_topic, person_name, company, role } = input;
  const roleCategory = detectRoleCategory(role);
  
  let section = `## 🎯 Talking Points\n\n`;
  
  // Topic-specific points
  if (meeting_topic) {
    section += `### On "${meeting_topic}"\n\n`;
    section += `1. What's the main goal or outcome you're hoping for?\n`;
    section += `2. What challenges have you encountered so far?\n`;
    section += `3. What would success look like for this?\n`;
    section += `4. What's the timeline you're working with?\n\n`;
  }
  
  // Role-based questions
  section += `### Questions for ${person_name}\n\n`;
  
  switch (roleCategory) {
    case 'executive':
      section += `- What's your vision for ${company || 'the company'} over the next 12 months?\n`;
      section += `- What's keeping you up at night right now?\n`;
      section += `- How do you see our potential collaboration fitting into your strategy?\n`;
      break;
    case 'investor':
      section += `- What's your investment thesis for this space?\n`;
      section += `- What makes a company stand out to you?\n`;
      section += `- What's your typical check size and involvement level?\n`;
      break;
    case 'sales':
      section += `- Walk me through the decision-making process at ${company || 'your company'}\n`;
      section += `- What's your timeline for making a decision?\n`;
      section += `- Who else needs to be involved in this conversation?\n`;
      break;
    default:
      section += `- What does a typical day look like for you?\n`;
      section += `- What's the most exciting thing you're working on?\n`;
      section += `- What would make this meeting a success for you?\n`;
  }
  
  section += `\n### Your Goals\n\n`;
  section += `- [ ] Build rapport and establish trust\n`;
  section += `- [ ] Understand their needs/challenges\n`;
  section += `- [ ] Share relevant value proposition\n`;
  section += `- [ ] Agree on next steps\n\n`;
  
  return section;
}

/**
 * Generate gotchas and things to avoid
 */
function generateGotchas(input, history) {
  const { person_name, company, role } = input;
  const roleCategory = detectRoleCategory(role);
  
  let section = `## ⚠️ Watch Out For\n\n`;
  
  // Role-specific gotchas
  switch (roleCategory) {
    case 'executive':
      section += `- **Don't waste time** - Execs have tight schedules. Get to the point.\n`;
      section += `- **Come prepared** - They expect you to know their business\n`;
      section += `- **Speak in outcomes** - Focus on results, not processes\n`;
      break;
    case 'investor':
      section += `- **Know your numbers** - They'll ask about metrics, TAM, CAC, LTV\n`;
      section += `- **Be honest about risks** - They appreciate transparency\n`;
      section += `- **Don't oversell** - Sophisticated investors see through hype\n`;
      break;
    case 'sales':
      section += `- **Watch for pressure tactics** - They're trained to close\n`;
      section += `- **Get specifics in writing** - Don't rely on verbal promises\n`;
      section += `- **Understand the full pricing** - Ask about hidden fees\n`;
      break;
    default:
      section += `- **Respect their expertise** - They know their domain\n`;
      section += `- **Listen more than you talk** - Aim for 70/30 ratio\n`;
      section += `- **Avoid jargon** - Use clear, simple language\n`;
  }
  
  section += `\n### General Tips\n\n`;
  section += `- 🎤 **Let them speak first** when possible\n`;
  section += `- 📝 **Take notes** - Shows you care and helps you remember\n`;
  section += `- ⏰ **Be time-conscious** - End 5 min early if possible\n`;
  section += `- 🤝 **Follow up within 24 hours** - While it's fresh\n\n`;
  
  // Add warnings based on history
  if (history.briefings?.length > 0) {
    section += `### 📌 Notes from Previous Interactions\n\n`;
    section += `*Review the ${history.briefings.length} related briefing(s) above for context*\n\n`;
  }
  
  return section;
}

/**
 * Generate meeting agenda suggestion
 */
function generateAgenda(input) {
  const { meeting_topic, date, person_name } = input;
  const days = daysUntil(date);
  
  let section = `## 📅 Meeting Details\n\n`;
  
  section += `**When:** ${formatDate(date)}\n`;
  if (days !== null) {
    if (days === 0) section += `**Timeline:** TODAY! 🔥\n`;
    else if (days === 1) section += `**Timeline:** Tomorrow\n`;
    else if (days < 0) section += `**Timeline:** ${Math.abs(days)} days ago (review meeting)\n`;
    else section += `**Timeline:** ${days} days from now\n`;
  }
  
  if (meeting_topic) {
    section += `**Topic:** ${meeting_topic}\n`;
  }
  
  section += `\n### Suggested Agenda\n\n`;
  section += `| Time | Activity |\n`;
  section += `|------|----------|\n`;
  section += `| 0-5 min | Introductions & rapport building |\n`;
  section += `| 5-15 min | Understand their situation & needs |\n`;
  section += `| 15-25 min | Share relevant insights/value |\n`;
  section += `| 25-30 min | Discuss next steps & action items |\n\n`;
  
  return section;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Generate a comprehensive meeting prep briefing
 * 
 * @param {Object} pool - PostgreSQL connection pool
 * @param {Object} input - Meeting prep input
 * @param {string} input.person_name - Name of person meeting with (required)
 * @param {string} input.company - Company name (optional)
 * @param {string} input.meeting_topic - Topic/purpose of meeting (optional)
 * @param {string} input.date - Meeting date (optional)
 * @param {string} input.role - Person's role/title (optional)
 * @param {Object} research - External research data (optional, for web search results)
 * @returns {Object} Generated briefing
 */
async function generateMeetingPrep(pool, input, research = null) {
  console.log('[MeetingPrep] Generating prep for:', input.person_name);
  
  // Validate input
  if (!input.person_name || input.person_name.length < PREP_CONFIG.minPersonNameLength) {
    throw new Error('Person name is required (minimum 2 characters)');
  }
  
  // Gather all history in parallel
  const [briefingsHistory, expensesHistory, jobsHistory, ideasHistory] = await Promise.all([
    searchBriefingsHistory(pool, input.person_name, input.company),
    searchExpensesHistory(pool, input.person_name, input.company),
    searchJobsHistory(pool, input.company),
    searchIdeasHistory(pool, input.person_name, input.company)
  ]);
  
  const history = {
    briefings: briefingsHistory,
    expenses: expensesHistory,
    jobs: jobsHistory,
    ideas: ideasHistory
  };
  
  console.log(`[MeetingPrep] Found: ${briefingsHistory.length} briefings, ${expensesHistory.length} expenses, ${jobsHistory.length} jobs, ${ideasHistory.length} ideas`);
  
  // Build the briefing content
  const sections = [
    `# Meeting Prep: ${input.person_name}${input.company ? ` @ ${input.company}` : ''}\n`,
    `> 🤖 *Generated by Lumen AI - Your Chief of Staff*\n`,
    `> *Prepared: ${new Date().toLocaleString()}*\n\n`,
    '---\n\n',
    generateAgenda(input),
    '---\n\n',
    generatePersonBackground(input, research),
    '---\n\n',
    generateCompanyIntel(input, research, jobsHistory),
    '---\n\n',
    generateInteractionHistory(briefingsHistory, expensesHistory, ideasHistory),
    '---\n\n',
    generateTalkingPoints(input, history),
    '---\n\n',
    generateGotchas(input, history),
    '---\n\n',
    `## ✅ Pre-Meeting Checklist\n\n`,
    `- [ ] Review this briefing\n`,
    `- [ ] Research ${input.person_name} on LinkedIn\n`,
    input.company ? `- [ ] Check ${input.company}'s recent news\n` : '',
    `- [ ] Prepare your key questions\n`,
    `- [ ] Test your video/audio if virtual\n`,
    `- [ ] Block 10 min before for mental prep\n`,
    `- [ ] Block 15 min after for notes/follow-up\n\n`,
    '---\n\n',
    `*Good luck! You've got this. 🚀*\n`
  ];
  
  const content = sections.filter(Boolean).join('');
  
  // Generate summary
  const summary = `Meeting prep for ${input.person_name}${input.company ? ` at ${input.company}` : ''}${input.meeting_topic ? ` about "${input.meeting_topic}"` : ''}. Found ${briefingsHistory.length + expensesHistory.length + ideasHistory.length} relevant items in your history.`;
  
  // Build tags
  const tags = ['meeting-prep'];
  if (input.company) tags.push(normalizeText(input.company).replace(/\s+/g, '-'));
  if (input.meeting_topic) tags.push('topic:' + normalizeText(input.meeting_topic).split(' ')[0]);
  
  // Build title
  const title = `Meeting Prep: ${input.person_name}${input.company ? ` @ ${input.company}` : ''}${input.date ? ` - ${new Date(input.date).toLocaleDateString()}` : ''}`;
  
  return {
    type: 'meeting-prep',
    title,
    content,
    summary,
    tags,
    metadata: {
      person_name: input.person_name,
      company: input.company,
      meeting_topic: input.meeting_topic,
      meeting_date: input.date,
      role: input.role,
      history_found: {
        briefings: briefingsHistory.length,
        expenses: expensesHistory.length,
        jobs: jobsHistory.length,
        ideas: ideasHistory.length
      },
      generated_at: new Date().toISOString()
    }
  };
}

/**
 * Save meeting prep briefing to database
 */
async function saveMeetingPrep(pool, briefing) {
  try {
    const result = await pool.query(
      `INSERT INTO lumen_briefings (type, title, content, summary, tags) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [briefing.type, briefing.title, briefing.content, briefing.summary, briefing.tags]
    );
    
    return result.rows[0].id;
  } catch (err) {
    console.error('[MeetingPrep] Error saving briefing:', err);
    throw err;
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  generateMeetingPrep,
  saveMeetingPrep,
  searchBriefingsHistory,
  searchExpensesHistory,
  searchJobsHistory,
  searchIdeasHistory,
  PREP_CONFIG
};
