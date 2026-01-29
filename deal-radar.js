/**
 * ============================================
 * DEAL RADAR - 24/7 OPPORTUNITY SCANNER
 * ============================================
 * 
 * AI-powered opportunity detection system that:
 * - Stores user search profiles (job type, salary, location, keywords)
 * - Scans and stores matching opportunities
 * - Scores opportunities against profiles
 * - Alerts on high-match opportunities
 * 
 * Author: Jimmy & Lumen AI Solutions
 * Version: 1.0.0
 */

// ============================================
// DATABASE INITIALIZATION
// ============================================

/**
 * Initialize Deal Radar database tables
 * @param {Pool} pool - PostgreSQL connection pool
 */
async function initDealRadarTables(pool) {
  const client = await pool.connect();
  try {
    // Opportunity Profiles - user-defined search criteria
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_opportunity_profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Job Criteria
        job_types TEXT[] DEFAULT '{}',           -- ['full-time', 'contract', 'freelance']
        salary_min INTEGER,                       -- Minimum salary
        salary_max INTEGER,                       -- Maximum salary (null = no max)
        salary_currency VARCHAR(10) DEFAULT 'USD',
        
        -- Location Criteria
        locations TEXT[] DEFAULT '{}',           -- ['San Francisco', 'Remote', 'New York']
        remote_only BOOLEAN DEFAULT FALSE,
        
        -- Keywords & Skills
        keywords TEXT[] DEFAULT '{}',            -- ['AI', 'machine learning', 'python']
        required_skills TEXT[] DEFAULT '{}',     -- Must have these
        preferred_skills TEXT[] DEFAULT '{}',    -- Nice to have
        exclude_keywords TEXT[] DEFAULT '{}',    -- Filter out opportunities with these
        
        -- Company Preferences
        company_sizes TEXT[] DEFAULT '{}',       -- ['startup', 'mid', 'enterprise']
        industries TEXT[] DEFAULT '{}',          -- ['tech', 'finance', 'healthcare']
        exclude_companies TEXT[] DEFAULT '{}',   -- Blacklist
        
        -- Alert Settings
        alert_threshold INTEGER DEFAULT 70,      -- Score threshold for alerts (0-100)
        alert_enabled BOOLEAN DEFAULT TRUE,
        alert_frequency VARCHAR(20) DEFAULT 'realtime', -- 'realtime', 'daily', 'weekly'
        
        -- Metadata
        priority INTEGER DEFAULT 0,              -- Higher = more important
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP,
        last_scan_at TIMESTAMP,
        total_matches INTEGER DEFAULT 0
      )
    `);

    // Opportunities - found/scanned opportunities
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_opportunities (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(255),                -- ID from source (job board, etc)
        source VARCHAR(100) NOT NULL,            -- 'linkedin', 'indeed', 'manual', etc
        source_url TEXT,
        
        -- Core Details
        title VARCHAR(500) NOT NULL,
        company VARCHAR(255),
        company_size VARCHAR(50),
        industry VARCHAR(100),
        
        -- Location & Type
        location VARCHAR(255),
        is_remote BOOLEAN DEFAULT FALSE,
        job_type VARCHAR(50),                    -- 'full-time', 'contract', 'freelance'
        
        -- Compensation
        salary_min INTEGER,
        salary_max INTEGER,
        salary_currency VARCHAR(10) DEFAULT 'USD',
        salary_text VARCHAR(255),                -- Raw salary text for display
        
        -- Content
        description TEXT,
        requirements TEXT,
        responsibilities TEXT,
        benefits TEXT,
        skills TEXT[] DEFAULT '{}',
        
        -- Scoring (calculated per profile)
        -- Note: Match scores are stored in junction table
        
        -- Status
        status VARCHAR(50) DEFAULT 'new',        -- 'new', 'reviewing', 'applied', 'interviewing', 'rejected', 'expired'
        starred BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE,
        notes TEXT,
        
        -- Dates
        posted_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP,
        
        -- Prevent duplicates
        UNIQUE(source, external_id)
      )
    `);

    // Junction table - profile-to-opportunity matches with scores
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_opportunity_matches (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER REFERENCES lumen_opportunity_profiles(id) ON DELETE CASCADE,
        opportunity_id INTEGER REFERENCES lumen_opportunities(id) ON DELETE CASCADE,
        
        -- Scoring Breakdown
        score INTEGER NOT NULL,                  -- Overall match score (0-100)
        score_breakdown JSONB DEFAULT '{}',      -- { salary: 90, location: 100, skills: 75, ... }
        
        -- Alert Status
        alerted BOOLEAN DEFAULT FALSE,
        alerted_at TIMESTAMP,
        
        -- Matching Metadata
        matched_keywords TEXT[] DEFAULT '{}',    -- Which keywords matched
        matched_skills TEXT[] DEFAULT '{}',      -- Which skills matched
        match_notes TEXT,
        
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(profile_id, opportunity_id)
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_opportunities_source ON lumen_opportunities(source);
      CREATE INDEX IF NOT EXISTS idx_opportunities_status ON lumen_opportunities(status);
      CREATE INDEX IF NOT EXISTS idx_opportunities_created ON lumen_opportunities(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_opportunities_salary ON lumen_opportunities(salary_min, salary_max);
      CREATE INDEX IF NOT EXISTS idx_matches_score ON lumen_opportunity_matches(score DESC);
      CREATE INDEX IF NOT EXISTS idx_matches_profile ON lumen_opportunity_matches(profile_id);
      CREATE INDEX IF NOT EXISTS idx_profiles_active ON lumen_opportunity_profiles(active);
    `);

    console.log('[DealRadar] Database tables initialized');
  } finally {
    client.release();
  }
}

// ============================================
// MATCHING ALGORITHM
// ============================================

/**
 * Calculate match score between a profile and an opportunity
 * Returns 0-100 score with detailed breakdown
 * 
 * @param {Object} profile - Search profile criteria
 * @param {Object} opportunity - Opportunity to score
 * @returns {Object} { score, breakdown, matchedKeywords, matchedSkills }
 */
function calculateMatchScore(profile, opportunity) {
  const breakdown = {};
  const matchedKeywords = [];
  const matchedSkills = [];
  let totalWeight = 0;
  let weightedScore = 0;

  // ============ SALARY MATCH (Weight: 25) ============
  const salaryWeight = 25;
  totalWeight += salaryWeight;
  
  if (profile.salary_min || profile.salary_max) {
    const oppMin = opportunity.salary_min || 0;
    const oppMax = opportunity.salary_max || oppMin;
    const profMin = profile.salary_min || 0;
    const profMax = profile.salary_max || Infinity;
    
    if (oppMax === 0) {
      // No salary info - neutral score
      breakdown.salary = 50;
      weightedScore += 50 * salaryWeight / 100;
    } else if (oppMin >= profMin && (profMax === Infinity || oppMax <= profMax)) {
      // Perfect match - within range
      breakdown.salary = 100;
      weightedScore += 100 * salaryWeight / 100;
    } else if (oppMax >= profMin) {
      // Partial overlap
      const overlap = Math.min(oppMax, profMax) - Math.max(oppMin, profMin);
      const range = Math.max(oppMax, profMax) - Math.min(oppMin, profMin);
      breakdown.salary = Math.round((overlap / range) * 100);
      weightedScore += breakdown.salary * salaryWeight / 100;
    } else {
      // Below minimum
      breakdown.salary = 0;
    }
  } else {
    breakdown.salary = 100; // No salary requirement
    weightedScore += 100 * salaryWeight / 100;
  }

  // ============ LOCATION MATCH (Weight: 20) ============
  const locationWeight = 20;
  totalWeight += locationWeight;
  
  if (profile.remote_only && opportunity.is_remote) {
    breakdown.location = 100;
    weightedScore += 100 * locationWeight / 100;
  } else if (profile.locations && profile.locations.length > 0) {
    const oppLocation = (opportunity.location || '').toLowerCase();
    const isRemote = opportunity.is_remote || oppLocation.includes('remote');
    
    if (isRemote && profile.locations.some(l => l.toLowerCase() === 'remote')) {
      breakdown.location = 100;
      weightedScore += 100 * locationWeight / 100;
    } else {
      const locationMatch = profile.locations.some(loc => 
        oppLocation.includes(loc.toLowerCase())
      );
      breakdown.location = locationMatch ? 100 : 0;
      weightedScore += breakdown.location * locationWeight / 100;
    }
  } else {
    breakdown.location = 100; // No location requirement
    weightedScore += 100 * locationWeight / 100;
  }

  // ============ JOB TYPE MATCH (Weight: 15) ============
  const typeWeight = 15;
  totalWeight += typeWeight;
  
  if (profile.job_types && profile.job_types.length > 0) {
    const oppType = (opportunity.job_type || '').toLowerCase();
    const typeMatch = profile.job_types.some(t => 
      oppType.includes(t.toLowerCase()) || t.toLowerCase().includes(oppType)
    );
    breakdown.job_type = typeMatch ? 100 : 0;
    weightedScore += breakdown.job_type * typeWeight / 100;
  } else {
    breakdown.job_type = 100;
    weightedScore += 100 * typeWeight / 100;
  }

  // ============ KEYWORD MATCH (Weight: 20) ============
  const keywordWeight = 20;
  totalWeight += keywordWeight;
  
  if (profile.keywords && profile.keywords.length > 0) {
    const content = [
      opportunity.title,
      opportunity.description,
      opportunity.requirements,
      opportunity.company
    ].filter(Boolean).join(' ').toLowerCase();
    
    let keywordMatches = 0;
    profile.keywords.forEach(kw => {
      if (content.includes(kw.toLowerCase())) {
        keywordMatches++;
        matchedKeywords.push(kw);
      }
    });
    
    breakdown.keywords = Math.round((keywordMatches / profile.keywords.length) * 100);
    weightedScore += breakdown.keywords * keywordWeight / 100;
  } else {
    breakdown.keywords = 100;
    weightedScore += 100 * keywordWeight / 100;
  }

  // ============ SKILLS MATCH (Weight: 20) ============
  const skillsWeight = 20;
  totalWeight += skillsWeight;
  
  const allProfileSkills = [
    ...(profile.required_skills || []),
    ...(profile.preferred_skills || [])
  ];
  
  if (allProfileSkills.length > 0) {
    const oppSkills = (opportunity.skills || []).map(s => s.toLowerCase());
    const content = [
      opportunity.title,
      opportunity.description,
      opportunity.requirements
    ].filter(Boolean).join(' ').toLowerCase();
    
    let skillMatches = 0;
    let requiredMet = true;
    
    // Check required skills (must have ALL)
    (profile.required_skills || []).forEach(skill => {
      const skillLower = skill.toLowerCase();
      const found = oppSkills.includes(skillLower) || content.includes(skillLower);
      if (found) {
        skillMatches++;
        matchedSkills.push(skill);
      } else {
        requiredMet = false;
      }
    });
    
    // Check preferred skills
    (profile.preferred_skills || []).forEach(skill => {
      const skillLower = skill.toLowerCase();
      const found = oppSkills.includes(skillLower) || content.includes(skillLower);
      if (found) {
        skillMatches++;
        matchedSkills.push(skill);
      }
    });
    
    if (!requiredMet) {
      breakdown.skills = Math.round((skillMatches / allProfileSkills.length) * 50); // Penalize missing required
    } else {
      breakdown.skills = Math.round((skillMatches / allProfileSkills.length) * 100);
    }
    weightedScore += breakdown.skills * skillsWeight / 100;
  } else {
    breakdown.skills = 100;
    weightedScore += 100 * skillsWeight / 100;
  }

  // ============ EXCLUSION CHECK ============
  const content = [
    opportunity.title,
    opportunity.description,
    opportunity.company
  ].filter(Boolean).join(' ').toLowerCase();
  
  // Check exclude keywords
  if (profile.exclude_keywords && profile.exclude_keywords.length > 0) {
    const hasExcluded = profile.exclude_keywords.some(kw => 
      content.includes(kw.toLowerCase())
    );
    if (hasExcluded) {
      breakdown.excluded = true;
      return { 
        score: 0, 
        breakdown, 
        matchedKeywords, 
        matchedSkills,
        excluded: true 
      };
    }
  }
  
  // Check exclude companies
  if (profile.exclude_companies && profile.exclude_companies.length > 0) {
    const company = (opportunity.company || '').toLowerCase();
    const isExcluded = profile.exclude_companies.some(c => 
      company.includes(c.toLowerCase())
    );
    if (isExcluded) {
      breakdown.excluded = true;
      return { 
        score: 0, 
        breakdown, 
        matchedKeywords, 
        matchedSkills,
        excluded: true 
      };
    }
  }

  // Calculate final score
  const finalScore = Math.round((weightedScore / totalWeight) * 100);
  
  return {
    score: finalScore,
    breakdown,
    matchedKeywords,
    matchedSkills,
    excluded: false
  };
}

// ============================================
// PROFILE MANAGEMENT
// ============================================

/**
 * Create a new search profile
 */
async function createProfile(pool, profileData) {
  const {
    name,
    description,
    job_types,
    salary_min,
    salary_max,
    salary_currency,
    locations,
    remote_only,
    keywords,
    required_skills,
    preferred_skills,
    exclude_keywords,
    company_sizes,
    industries,
    exclude_companies,
    alert_threshold,
    alert_enabled,
    alert_frequency,
    priority
  } = profileData;

  const result = await pool.query(`
    INSERT INTO lumen_opportunity_profiles (
      name, description, job_types, salary_min, salary_max, salary_currency,
      locations, remote_only, keywords, required_skills, preferred_skills,
      exclude_keywords, company_sizes, industries, exclude_companies,
      alert_threshold, alert_enabled, alert_frequency, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
  `, [
    name,
    description || null,
    job_types || [],
    salary_min || null,
    salary_max || null,
    salary_currency || 'USD',
    locations || [],
    remote_only || false,
    keywords || [],
    required_skills || [],
    preferred_skills || [],
    exclude_keywords || [],
    company_sizes || [],
    industries || [],
    exclude_companies || [],
    alert_threshold || 70,
    alert_enabled !== false,
    alert_frequency || 'realtime',
    priority || 0
  ]);

  return result.rows[0];
}

/**
 * Get all profiles
 */
async function getProfiles(pool, { active_only = true, include_stats = true } = {}) {
  let query = `
    SELECT p.*
    ${include_stats ? `, 
      (SELECT COUNT(*) FROM lumen_opportunity_matches m WHERE m.profile_id = p.id) as match_count,
      (SELECT COUNT(*) FROM lumen_opportunity_matches m WHERE m.profile_id = p.id AND m.score >= p.alert_threshold) as high_match_count,
      (SELECT MAX(m.score) FROM lumen_opportunity_matches m WHERE m.profile_id = p.id) as best_score
    ` : ''}
    FROM lumen_opportunity_profiles p
  `;
  
  if (active_only) {
    query += ' WHERE p.active = TRUE';
  }
  
  query += ' ORDER BY p.priority DESC, p.created_at DESC';
  
  const result = await pool.query(query);
  return result.rows;
}

/**
 * Get profile by ID
 */
async function getProfileById(pool, id) {
  const result = await pool.query(
    'SELECT * FROM lumen_opportunity_profiles WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update a profile
 */
async function updateProfile(pool, id, updates) {
  const allowedFields = [
    'name', 'description', 'job_types', 'salary_min', 'salary_max', 
    'salary_currency', 'locations', 'remote_only', 'keywords',
    'required_skills', 'preferred_skills', 'exclude_keywords',
    'company_sizes', 'industries', 'exclude_companies',
    'alert_threshold', 'alert_enabled', 'alert_frequency', 'priority', 'active'
  ];
  
  const setClauses = [];
  const values = [];
  let paramCount = 0;
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      paramCount++;
      setClauses.push(`${key} = $${paramCount}`);
      values.push(value);
    }
  }
  
  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  setClauses.push('updated_at = NOW()');
  paramCount++;
  values.push(id);
  
  const result = await pool.query(
    `UPDATE lumen_opportunity_profiles SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  
  return result.rows[0];
}

/**
 * Delete a profile
 */
async function deleteProfile(pool, id) {
  await pool.query('DELETE FROM lumen_opportunity_profiles WHERE id = $1', [id]);
}

// ============================================
// OPPORTUNITY MANAGEMENT
// ============================================

/**
 * Add or update an opportunity
 */
async function upsertOpportunity(pool, opportunityData) {
  const {
    external_id,
    source,
    source_url,
    title,
    company,
    company_size,
    industry,
    location,
    is_remote,
    job_type,
    salary_min,
    salary_max,
    salary_currency,
    salary_text,
    description,
    requirements,
    responsibilities,
    benefits,
    skills,
    posted_at,
    expires_at
  } = opportunityData;

  const result = await pool.query(`
    INSERT INTO lumen_opportunities (
      external_id, source, source_url, title, company, company_size, industry,
      location, is_remote, job_type, salary_min, salary_max, salary_currency,
      salary_text, description, requirements, responsibilities, benefits,
      skills, posted_at, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (source, external_id) DO UPDATE SET
      title = EXCLUDED.title,
      company = EXCLUDED.company,
      salary_min = EXCLUDED.salary_min,
      salary_max = EXCLUDED.salary_max,
      description = EXCLUDED.description,
      updated_at = NOW()
    RETURNING *
  `, [
    external_id,
    source,
    source_url || null,
    title,
    company || null,
    company_size || null,
    industry || null,
    location || null,
    is_remote || false,
    job_type || null,
    salary_min || null,
    salary_max || null,
    salary_currency || 'USD',
    salary_text || null,
    description || null,
    requirements || null,
    responsibilities || null,
    benefits || null,
    skills || [],
    posted_at || null,
    expires_at || null
  ]);

  return result.rows[0];
}

/**
 * Get opportunities with optional filtering
 */
async function getOpportunities(pool, options = {}) {
  const {
    profile_id,
    min_score,
    status,
    starred,
    source,
    limit = 50,
    offset = 0,
    include_scores = true
  } = options;
  
  let query;
  const params = [];
  let paramCount = 0;
  
  if (profile_id && include_scores) {
    // Get opportunities matched to a specific profile
    query = `
      SELECT o.*, m.score, m.score_breakdown, m.matched_keywords, m.matched_skills
      FROM lumen_opportunities o
      JOIN lumen_opportunity_matches m ON o.id = m.opportunity_id
      WHERE m.profile_id = $${++paramCount}
    `;
    params.push(profile_id);
    
    if (min_score) {
      query += ` AND m.score >= $${++paramCount}`;
      params.push(min_score);
    }
  } else {
    query = 'SELECT * FROM lumen_opportunities o WHERE 1=1';
  }
  
  if (status) {
    query += ` AND o.status = $${++paramCount}`;
    params.push(status);
  } else {
    query += ` AND (o.archived = FALSE OR o.archived IS NULL)`;
  }
  
  if (starred) {
    query += ' AND o.starred = TRUE';
  }
  
  if (source) {
    query += ` AND o.source = $${++paramCount}`;
    params.push(source);
  }
  
  if (profile_id && include_scores) {
    query += ' ORDER BY m.score DESC, o.created_at DESC';
  } else {
    query += ' ORDER BY o.created_at DESC';
  }
  
  query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Update opportunity status
 */
async function updateOpportunityStatus(pool, id, status, notes = null) {
  const result = await pool.query(
    `UPDATE lumen_opportunities 
     SET status = $1, notes = COALESCE($2, notes), updated_at = NOW() 
     WHERE id = $3 RETURNING *`,
    [status, notes, id]
  );
  return result.rows[0];
}

// ============================================
// SCANNING & MATCHING
// ============================================

/**
 * Scan opportunities against all active profiles and store matches
 * Returns summary of scan results
 */
async function scanOpportunities(pool, options = {}) {
  const { profile_id, opportunity_ids } = options;
  
  console.log('[DealRadar] Starting opportunity scan...');
  const startTime = Date.now();
  
  // Get profiles to scan
  let profiles;
  if (profile_id) {
    const profile = await getProfileById(pool, profile_id);
    profiles = profile ? [profile] : [];
  } else {
    profiles = await getProfiles(pool, { active_only: true, include_stats: false });
  }
  
  if (profiles.length === 0) {
    return { success: true, message: 'No active profiles to scan', matches: 0 };
  }
  
  // Get opportunities to score
  let opportunitiesQuery = `
    SELECT * FROM lumen_opportunities 
    WHERE (archived = FALSE OR archived IS NULL)
  `;
  const params = [];
  
  if (opportunity_ids && opportunity_ids.length > 0) {
    opportunitiesQuery += ` AND id = ANY($1)`;
    params.push(opportunity_ids);
  }
  
  const oppResult = await pool.query(opportunitiesQuery, params);
  const opportunities = oppResult.rows;
  
  if (opportunities.length === 0) {
    return { success: true, message: 'No opportunities to scan', matches: 0 };
  }
  
  console.log(`[DealRadar] Scanning ${opportunities.length} opportunities against ${profiles.length} profiles...`);
  
  // Score each profile-opportunity pair
  let totalMatches = 0;
  let highMatches = 0;
  const alerts = [];
  
  for (const profile of profiles) {
    let profileMatches = 0;
    
    for (const opp of opportunities) {
      const result = calculateMatchScore(profile, opp);
      
      // Only store if score > 0 (not excluded)
      if (result.score > 0) {
        await pool.query(`
          INSERT INTO lumen_opportunity_matches (
            profile_id, opportunity_id, score, score_breakdown,
            matched_keywords, matched_skills
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (profile_id, opportunity_id) DO UPDATE SET
            score = EXCLUDED.score,
            score_breakdown = EXCLUDED.score_breakdown,
            matched_keywords = EXCLUDED.matched_keywords,
            matched_skills = EXCLUDED.matched_skills
        `, [
          profile.id,
          opp.id,
          result.score,
          JSON.stringify(result.breakdown),
          result.matchedKeywords,
          result.matchedSkills
        ]);
        
        totalMatches++;
        profileMatches++;
        
        // Check if this is a high-match alert
        if (result.score >= profile.alert_threshold && profile.alert_enabled) {
          highMatches++;
          alerts.push({
            profile_id: profile.id,
            profile_name: profile.name,
            opportunity_id: opp.id,
            opportunity_title: opp.title,
            company: opp.company,
            score: result.score
          });
        }
      }
    }
    
    // Update profile stats
    await pool.query(`
      UPDATE lumen_opportunity_profiles 
      SET last_scan_at = NOW(), total_matches = total_matches + $1
      WHERE id = $2
    `, [profileMatches, profile.id]);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[DealRadar] Scan complete: ${totalMatches} matches, ${highMatches} alerts in ${duration}s`);
  
  return {
    success: true,
    scanned: {
      profiles: profiles.length,
      opportunities: opportunities.length
    },
    matches: totalMatches,
    high_matches: highMatches,
    alerts,
    duration_seconds: parseFloat(duration)
  };
}

/**
 * Get scan/match stats for dashboard
 */
async function getRadarStats(pool) {
  const stats = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM lumen_opportunity_profiles WHERE active = TRUE) as active_profiles,
      (SELECT COUNT(*) FROM lumen_opportunities WHERE archived = FALSE OR archived IS NULL) as total_opportunities,
      (SELECT COUNT(*) FROM lumen_opportunities WHERE status = 'new') as new_opportunities,
      (SELECT COUNT(*) FROM lumen_opportunity_matches) as total_matches,
      (SELECT COUNT(*) FROM lumen_opportunity_matches m 
       JOIN lumen_opportunity_profiles p ON m.profile_id = p.id 
       WHERE m.score >= p.alert_threshold) as high_matches,
      (SELECT AVG(score) FROM lumen_opportunity_matches)::INTEGER as avg_score,
      (SELECT MAX(last_scan_at) FROM lumen_opportunity_profiles) as last_scan
  `);
  
  return stats.rows[0];
}

// ============================================
// EXPRESS ROUTE HANDLERS
// ============================================

/**
 * Register Deal Radar routes with Express app
 */
function registerRoutes(app, pool) {
  
  // ============ PROFILES ============
  
  /**
   * POST /api/radar/profiles - Create a new search profile
   */
  app.post('/api/radar/profiles', async (req, res) => {
    try {
      if (!req.body.name) {
        return res.status(400).json({ error: 'Profile name is required' });
      }
      
      const profile = await createProfile(pool, req.body);
      console.log(`[DealRadar] Created profile: ${profile.name} (id: ${profile.id})`);
      
      res.status(201).json({
        message: 'Profile created successfully',
        profile
      });
    } catch (err) {
      console.error('[DealRadar] Error creating profile:', err);
      res.status(500).json({ error: 'Failed to create profile', details: err.message });
    }
  });
  
  /**
   * GET /api/radar/profiles - List all profiles
   */
  app.get('/api/radar/profiles', async (req, res) => {
    try {
      const { active_only = 'true' } = req.query;
      const profiles = await getProfiles(pool, { 
        active_only: active_only === 'true',
        include_stats: true 
      });
      res.json(profiles);
    } catch (err) {
      console.error('[DealRadar] Error listing profiles:', err);
      res.status(500).json({ error: 'Failed to list profiles' });
    }
  });
  
  /**
   * GET /api/radar/profiles/:id - Get single profile
   */
  app.get('/api/radar/profiles/:id', async (req, res) => {
    try {
      const profile = await getProfileById(pool, req.params.id);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.json(profile);
    } catch (err) {
      console.error('[DealRadar] Error getting profile:', err);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });
  
  /**
   * PATCH /api/radar/profiles/:id - Update profile
   */
  app.patch('/api/radar/profiles/:id', async (req, res) => {
    try {
      const profile = await updateProfile(pool, req.params.id, req.body);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.json({ message: 'Profile updated', profile });
    } catch (err) {
      console.error('[DealRadar] Error updating profile:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });
  
  /**
   * DELETE /api/radar/profiles/:id - Delete profile
   */
  app.delete('/api/radar/profiles/:id', async (req, res) => {
    try {
      await deleteProfile(pool, req.params.id);
      res.json({ message: 'Profile deleted' });
    } catch (err) {
      console.error('[DealRadar] Error deleting profile:', err);
      res.status(500).json({ error: 'Failed to delete profile' });
    }
  });
  
  // ============ OPPORTUNITIES ============
  
  /**
   * GET /api/radar/opportunities - Get matched opportunities
   */
  app.get('/api/radar/opportunities', async (req, res) => {
    try {
      const { 
        profile_id, 
        min_score, 
        status, 
        starred,
        source,
        limit = 50,
        offset = 0 
      } = req.query;
      
      const opportunities = await getOpportunities(pool, {
        profile_id: profile_id ? parseInt(profile_id) : null,
        min_score: min_score ? parseInt(min_score) : null,
        status,
        starred: starred === 'true',
        source,
        limit: parseInt(limit),
        offset: parseInt(offset),
        include_scores: !!profile_id
      });
      
      res.json(opportunities);
    } catch (err) {
      console.error('[DealRadar] Error getting opportunities:', err);
      res.status(500).json({ error: 'Failed to get opportunities' });
    }
  });
  
  /**
   * POST /api/radar/opportunities - Add opportunity manually
   */
  app.post('/api/radar/opportunities', async (req, res) => {
    try {
      if (!req.body.title || !req.body.source) {
        return res.status(400).json({ error: 'Title and source are required' });
      }
      
      // Generate external_id if not provided
      if (!req.body.external_id) {
        req.body.external_id = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const opportunity = await upsertOpportunity(pool, req.body);
      
      // Trigger scan for this new opportunity
      const scanResult = await scanOpportunities(pool, { 
        opportunity_ids: [opportunity.id] 
      });
      
      res.status(201).json({
        message: 'Opportunity added',
        opportunity,
        scan: scanResult
      });
    } catch (err) {
      console.error('[DealRadar] Error adding opportunity:', err);
      res.status(500).json({ error: 'Failed to add opportunity', details: err.message });
    }
  });
  
  /**
   * PATCH /api/radar/opportunities/:id/status - Update opportunity status
   */
  app.patch('/api/radar/opportunities/:id/status', async (req, res) => {
    try {
      const { status, notes } = req.body;
      
      const validStatuses = ['new', 'reviewing', 'applied', 'interviewing', 'rejected', 'expired'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status', 
          valid: validStatuses 
        });
      }
      
      const opportunity = await updateOpportunityStatus(pool, req.params.id, status, notes);
      if (!opportunity) {
        return res.status(404).json({ error: 'Opportunity not found' });
      }
      
      res.json({ message: 'Status updated', opportunity });
    } catch (err) {
      console.error('[DealRadar] Error updating status:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });
  
  /**
   * PATCH /api/radar/opportunities/:id/star - Toggle star
   */
  app.patch('/api/radar/opportunities/:id/star', async (req, res) => {
    try {
      const result = await pool.query(
        'UPDATE lumen_opportunities SET starred = NOT starred WHERE id = $1 RETURNING starred',
        [req.params.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Opportunity not found' });
      }
      
      res.json({ starred: result.rows[0].starred });
    } catch (err) {
      console.error('[DealRadar] Error toggling star:', err);
      res.status(500).json({ error: 'Failed to toggle star' });
    }
  });
  
  // ============ SCANNING ============
  
  /**
   * POST /api/radar/scan - Trigger a scan
   */
  app.post('/api/radar/scan', async (req, res) => {
    try {
      const { profile_id } = req.body;
      
      console.log('[DealRadar] Manual scan triggered');
      const result = await scanOpportunities(pool, { 
        profile_id: profile_id ? parseInt(profile_id) : null 
      });
      
      res.json(result);
    } catch (err) {
      console.error('[DealRadar] Error during scan:', err);
      res.status(500).json({ error: 'Scan failed', details: err.message });
    }
  });
  
  // ============ STATS ============
  
  /**
   * GET /api/radar/stats - Get radar dashboard stats
   */
  app.get('/api/radar/stats', async (req, res) => {
    try {
      const stats = await getRadarStats(pool);
      res.json(stats);
    } catch (err) {
      console.error('[DealRadar] Error getting stats:', err);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });
  
  /**
   * GET /api/radar/score - Score an opportunity against profiles (preview)
   */
  app.post('/api/radar/score', async (req, res) => {
    try {
      const { opportunity, profile_id } = req.body;
      
      if (!opportunity) {
        return res.status(400).json({ error: 'Opportunity data required' });
      }
      
      let profiles;
      if (profile_id) {
        const profile = await getProfileById(pool, profile_id);
        profiles = profile ? [profile] : [];
      } else {
        profiles = await getProfiles(pool, { active_only: true, include_stats: false });
      }
      
      const scores = profiles.map(profile => ({
        profile_id: profile.id,
        profile_name: profile.name,
        ...calculateMatchScore(profile, opportunity)
      }));
      
      res.json({ 
        opportunity_title: opportunity.title,
        scores 
      });
    } catch (err) {
      console.error('[DealRadar] Error scoring:', err);
      res.status(500).json({ error: 'Failed to score opportunity' });
    }
  });
  
  console.log('[DealRadar] Routes registered');
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  initDealRadarTables,
  registerRoutes,
  calculateMatchScore,
  createProfile,
  getProfiles,
  getProfileById,
  updateProfile,
  deleteProfile,
  upsertOpportunity,
  getOpportunities,
  updateOpportunityStatus,
  scanOpportunities,
  getRadarStats
};
