/**
 * 🌟 LIFE DASHBOARD ANALYTICS MODULE
 * 
 * Unified analytics across ALL user data in Lumen Dashboard.
 * Provides the 30,000 foot view of your life by cross-referencing:
 * - Expenses & spending patterns
 * - Briefings & reading activity
 * - Job tracking & applications
 * - Ideas & their status
 * - Resources saved
 * - Pitches and their outcomes
 * 
 * Surfaces correlations like "Best idea days = walks + low spending"
 * 
 * @author Jimmy & Lumen AI Solutions
 * @version 1.0.0
 */

// ============================================
// CORRELATION PATTERNS
// ============================================

const CORRELATION_PATTERNS = {
  // Time-based patterns
  PRODUCTIVE_DAYS: {
    id: 'productive_days',
    name: 'Productive Days',
    description: 'Days with high activity across multiple areas'
  },
  SPENDING_VS_PRODUCTIVITY: {
    id: 'spending_vs_productivity',
    name: 'Spending vs Productivity',
    description: 'Correlation between spending levels and creative output'
  },
  FOOD_SPENDING_IDEAS: {
    id: 'food_spending_ideas',
    name: 'Food & Ideas',
    description: 'Connection between food spending and idea generation'
  },
  JOB_MOMENTUM: {
    id: 'job_momentum',
    name: 'Job Search Momentum',
    description: 'Application activity patterns and outcomes'
  },
  KNOWLEDGE_INTAKE: {
    id: 'knowledge_intake',
    name: 'Knowledge Intake',
    description: 'Reading/briefing activity over time'
  }
};

// ============================================
// MAIN ANALYTICS FUNCTION
// ============================================

/**
 * Generate comprehensive life dashboard analytics
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} options - Analytics options
 * @returns {Object} Complete life dashboard data
 */
async function generateLifeDashboard(pool, options = {}) {
  const startTime = Date.now();
  
  const {
    timeWindowDays = 90,
    includeCorrelations = true,
    includeInsights = true
  } = options;

  // Calculate date boundaries
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - timeWindowDays);
  
  // Gather all data in parallel
  const [
    expenseStats,
    briefingStats,
    jobStats,
    ideaStats,
    resourceStats,
    pitchStats,
    dailyActivity,
    categoryBreakdowns
  ] = await Promise.all([
    getExpenseStats(pool, startDate),
    getBriefingStats(pool, startDate),
    getJobStats(pool, startDate),
    getIdeaStats(pool, startDate),
    getResourceStats(pool, startDate),
    getPitchStats(pool, startDate),
    getDailyActivity(pool, startDate),
    getCategoryBreakdowns(pool, startDate)
  ]);

  // Calculate correlations
  const correlations = includeCorrelations 
    ? findCorrelations(dailyActivity, expenseStats, ideaStats)
    : [];

  // Generate insights
  const insights = includeInsights
    ? generateInsights(expenseStats, briefingStats, jobStats, ideaStats, dailyActivity, correlations)
    : [];

  // Calculate overall health scores
  const lifeScores = calculateLifeScores(expenseStats, briefingStats, jobStats, ideaStats, resourceStats);

  // Calculate streaks
  const streaks = calculateStreaks(dailyActivity);

  const processingTimeMs = Date.now() - startTime;

  return {
    success: true,
    generatedAt: now.toISOString(),
    timeWindow: {
      days: timeWindowDays,
      start: startDate.toISOString(),
      end: now.toISOString()
    },
    summary: {
      totalExpenses: expenseStats.total,
      totalBriefings: briefingStats.total,
      totalJobs: jobStats.total,
      totalIdeas: ideaStats.total,
      totalResources: resourceStats.total,
      totalPitches: pitchStats.total,
      dataPoints: expenseStats.total + briefingStats.total + jobStats.total + ideaStats.total + resourceStats.total
    },
    expenses: expenseStats,
    briefings: briefingStats,
    jobs: jobStats,
    ideas: ideaStats,
    resources: resourceStats,
    pitches: pitchStats,
    categories: categoryBreakdowns,
    dailyActivity,
    correlations,
    insights,
    lifeScores,
    streaks,
    processingTimeMs
  };
}

// ============================================
// EXPENSE ANALYTICS
// ============================================

async function getExpenseStats(pool, startDate) {
  const client = await pool.connect();
  try {
    // Overall stats
    const overallResult = await client.query(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(AVG(amount), 0) as avg_amount,
        COALESCE(MAX(amount), 0) as max_amount,
        COALESCE(MIN(amount), 0) as min_amount
      FROM lumen_expenses
      WHERE date >= $1
    `, [startDate]);

    // By category
    const byCategoryResult = await client.query(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as total,
        AVG(amount) as average
      FROM lumen_expenses
      WHERE date >= $1
      GROUP BY category
      ORDER BY total DESC
    `, [startDate]);

    // Daily totals
    const dailyResult = await client.query(`
      SELECT 
        DATE(date) as day,
        SUM(amount) as total,
        COUNT(*) as count
      FROM lumen_expenses
      WHERE date >= $1
      GROUP BY DATE(date)
      ORDER BY day
    `, [startDate]);

    // Weekly totals
    const weeklyResult = await client.query(`
      SELECT 
        DATE_TRUNC('week', date) as week,
        SUM(amount) as total,
        COUNT(*) as count
      FROM lumen_expenses
      WHERE date >= $1
      GROUP BY DATE_TRUNC('week', date)
      ORDER BY week
    `, [startDate]);

    // Monthly totals
    const monthlyResult = await client.query(`
      SELECT 
        DATE_TRUNC('month', date) as month,
        SUM(amount) as total,
        COUNT(*) as count
      FROM lumen_expenses
      WHERE date >= $1
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY month
    `, [startDate]);

    // By meal type (if available)
    const mealTypeResult = await client.query(`
      SELECT 
        COALESCE(meal_type, 'unspecified') as meal_type,
        COUNT(*) as count,
        SUM(amount) as total
      FROM lumen_expenses
      WHERE date >= $1 AND category IN ('Food', 'Groceries')
      GROUP BY meal_type
      ORDER BY total DESC
    `, [startDate]);

    // Top vendors
    const vendorResult = await client.query(`
      SELECT 
        vendor,
        COUNT(*) as visit_count,
        SUM(amount) as total_spent,
        AVG(amount) as avg_spent
      FROM lumen_expenses
      WHERE date >= $1 AND vendor IS NOT NULL AND vendor != ''
      GROUP BY vendor
      ORDER BY total_spent DESC
      LIMIT 10
    `, [startDate]);

    // Day of week patterns
    const dayOfWeekResult = await client.query(`
      SELECT 
        EXTRACT(DOW FROM date) as day_of_week,
        COUNT(*) as count,
        SUM(amount) as total,
        AVG(amount) as average
      FROM lumen_expenses
      WHERE date >= $1
      GROUP BY EXTRACT(DOW FROM date)
      ORDER BY day_of_week
    `, [startDate]);

    const overall = overallResult.rows[0];

    return {
      total: parseInt(overall.total_count),
      totalAmount: Math.round(parseFloat(overall.total_amount) * 100) / 100,
      avgAmount: Math.round(parseFloat(overall.avg_amount) * 100) / 100,
      maxAmount: Math.round(parseFloat(overall.max_amount) * 100) / 100,
      minAmount: Math.round(parseFloat(overall.min_amount) * 100) / 100,
      byCategory: byCategoryResult.rows.map(r => ({
        category: r.category,
        count: parseInt(r.count),
        total: Math.round(parseFloat(r.total) * 100) / 100,
        average: Math.round(parseFloat(r.average) * 100) / 100,
        percentage: overall.total_amount > 0 
          ? Math.round((parseFloat(r.total) / parseFloat(overall.total_amount)) * 100) 
          : 0
      })),
      daily: dailyResult.rows.map(r => ({
        date: r.day.toISOString().split('T')[0],
        total: Math.round(parseFloat(r.total) * 100) / 100,
        count: parseInt(r.count)
      })),
      weekly: weeklyResult.rows.map(r => ({
        week: r.week.toISOString().split('T')[0],
        total: Math.round(parseFloat(r.total) * 100) / 100,
        count: parseInt(r.count)
      })),
      monthly: monthlyResult.rows.map(r => ({
        month: r.month.toISOString().slice(0, 7),
        total: Math.round(parseFloat(r.total) * 100) / 100,
        count: parseInt(r.count)
      })),
      byMealType: mealTypeResult.rows.map(r => ({
        mealType: r.meal_type,
        count: parseInt(r.count),
        total: Math.round(parseFloat(r.total) * 100) / 100
      })),
      topVendors: vendorResult.rows.map(r => ({
        vendor: r.vendor,
        visits: parseInt(r.visit_count),
        totalSpent: Math.round(parseFloat(r.total_spent) * 100) / 100,
        avgSpent: Math.round(parseFloat(r.avg_spent) * 100) / 100
      })),
      byDayOfWeek: dayOfWeekResult.rows.map(r => ({
        dayOfWeek: parseInt(r.day_of_week),
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(r.day_of_week)],
        count: parseInt(r.count),
        total: Math.round(parseFloat(r.total) * 100) / 100,
        average: Math.round(parseFloat(r.average) * 100) / 100
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================
// BRIEFING ANALYTICS
// ============================================

async function getBriefingStats(pool, startDate) {
  const client = await pool.connect();
  try {
    // Overall stats
    const overallResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE read = true) as read_count,
        COUNT(*) FILTER (WHERE read = false OR read IS NULL) as unread_count,
        COUNT(*) FILTER (WHERE starred = true) as starred_count,
        COUNT(*) FILTER (WHERE archived = true) as archived_count
      FROM lumen_briefings
      WHERE created_at >= $1
    `, [startDate]);

    // By type
    const byTypeResult = await client.query(`
      SELECT 
        type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE read = true) as read_count
      FROM lumen_briefings
      WHERE created_at >= $1
      GROUP BY type
      ORDER BY count DESC
    `, [startDate]);

    // Daily activity
    const dailyResult = await client.query(`
      SELECT 
        DATE(created_at) as day,
        COUNT(*) as created,
        COUNT(*) FILTER (WHERE read = true) as read
      FROM lumen_briefings
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [startDate]);

    // Top tags
    const tagsResult = await client.query(`
      SELECT 
        unnest(tags) as tag,
        COUNT(*) as count
      FROM lumen_briefings
      WHERE created_at >= $1
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 15
    `, [startDate]);

    // Reading velocity (time between created and read)
    const velocityResult = await client.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (read_at - created_at))) as avg_read_time_seconds
      FROM lumen_briefings
      WHERE created_at >= $1 AND read_at IS NOT NULL
    `, [startDate]);

    const overall = overallResult.rows[0];
    const avgReadTime = velocityResult.rows[0].avg_read_time_seconds;

    return {
      total: parseInt(overall.total),
      read: parseInt(overall.read_count),
      unread: parseInt(overall.unread_count),
      starred: parseInt(overall.starred_count),
      archived: parseInt(overall.archived_count),
      readRate: overall.total > 0 
        ? Math.round((parseInt(overall.read_count) / parseInt(overall.total)) * 100) 
        : 0,
      avgReadTimeHours: avgReadTime ? Math.round(avgReadTime / 3600 * 10) / 10 : null,
      byType: byTypeResult.rows.map(r => ({
        type: r.type,
        count: parseInt(r.count),
        readCount: parseInt(r.read_count),
        readRate: parseInt(r.count) > 0 
          ? Math.round((parseInt(r.read_count) / parseInt(r.count)) * 100) 
          : 0
      })),
      daily: dailyResult.rows.map(r => ({
        date: r.day.toISOString().split('T')[0],
        created: parseInt(r.created),
        read: parseInt(r.read)
      })),
      topTags: tagsResult.rows.map(r => ({
        tag: r.tag,
        count: parseInt(r.count)
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================
// JOB TRACKING ANALYTICS
// ============================================

async function getJobStats(pool, startDate) {
  const client = await pool.connect();
  try {
    // Overall stats
    const overallResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'applied') as applied_count,
        COUNT(*) FILTER (WHERE status = 'interviewing') as interviewing_count,
        COUNT(*) FILTER (WHERE status = 'offered') as offered_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE starred = true) as starred_count,
        AVG(salary_max) FILTER (WHERE salary_max IS NOT NULL) as avg_salary_max,
        AVG(salary_min) FILTER (WHERE salary_min IS NOT NULL) as avg_salary_min
      FROM lumen_jobs
      WHERE created_at >= $1
    `, [startDate]);

    // By status
    const byStatusResult = await client.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM lumen_jobs
      WHERE created_at >= $1
      GROUP BY status
      ORDER BY count DESC
    `, [startDate]);

    // By company
    const byCompanyResult = await client.query(`
      SELECT 
        company,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'applied') as applied
      FROM lumen_jobs
      WHERE created_at >= $1
      GROUP BY company
      ORDER BY count DESC
      LIMIT 10
    `, [startDate]);

    // Application timeline
    const timelineResult = await client.query(`
      SELECT 
        DATE(applied_at) as day,
        COUNT(*) as applications
      FROM lumen_jobs
      WHERE applied_at >= $1 AND applied_at IS NOT NULL
      GROUP BY DATE(applied_at)
      ORDER BY day
    `, [startDate]);

    // By job type
    const byTypeResult = await client.query(`
      SELECT 
        COALESCE(job_type, 'unspecified') as job_type,
        COUNT(*) as count
      FROM lumen_jobs
      WHERE created_at >= $1
      GROUP BY job_type
      ORDER BY count DESC
    `, [startDate]);

    // By source
    const bySourceResult = await client.query(`
      SELECT 
        COALESCE(source, 'unknown') as source,
        COUNT(*) as count
      FROM lumen_jobs
      WHERE created_at >= $1
      GROUP BY source
      ORDER BY count DESC
    `, [startDate]);

    const overall = overallResult.rows[0];

    // Calculate conversion rates
    const totalTracked = parseInt(overall.total);
    const applied = parseInt(overall.applied_count);
    const interviewing = parseInt(overall.interviewing_count);
    const offered = parseInt(overall.offered_count);

    return {
      total: totalTracked,
      byStatus: {
        new: parseInt(overall.new_count),
        applied: applied,
        interviewing: interviewing,
        offered: offered,
        rejected: parseInt(overall.rejected_count)
      },
      starred: parseInt(overall.starred_count),
      avgSalaryRange: {
        min: overall.avg_salary_min ? Math.round(parseFloat(overall.avg_salary_min)) : null,
        max: overall.avg_salary_max ? Math.round(parseFloat(overall.avg_salary_max)) : null
      },
      conversionRates: {
        applyRate: totalTracked > 0 ? Math.round((applied / totalTracked) * 100) : 0,
        interviewRate: applied > 0 ? Math.round((interviewing / applied) * 100) : 0,
        offerRate: interviewing > 0 ? Math.round((offered / interviewing) * 100) : 0
      },
      statusBreakdown: byStatusResult.rows.map(r => ({
        status: r.status || 'unknown',
        count: parseInt(r.count)
      })),
      topCompanies: byCompanyResult.rows.map(r => ({
        company: r.company,
        total: parseInt(r.count),
        applied: parseInt(r.applied)
      })),
      applicationTimeline: timelineResult.rows.map(r => ({
        date: r.day.toISOString().split('T')[0],
        applications: parseInt(r.applications)
      })),
      byJobType: byTypeResult.rows.map(r => ({
        type: r.job_type,
        count: parseInt(r.count)
      })),
      bySource: bySourceResult.rows.map(r => ({
        source: r.source,
        count: parseInt(r.count)
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================
// IDEAS ANALYTICS
// ============================================

async function getIdeaStats(pool, startDate) {
  const client = await pool.connect();
  try {
    // Overall stats
    const overallResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'idea') as idea_count,
        COUNT(*) FILTER (WHERE status = 'exploring') as exploring_count,
        COUNT(*) FILTER (WHERE status = 'building') as building_count,
        COUNT(*) FILTER (WHERE status = 'launched') as launched_count,
        COUNT(*) FILTER (WHERE status = 'paused') as paused_count,
        AVG(priority) as avg_priority
      FROM lumen_ideas
      WHERE created_at >= $1
    `, [startDate]);

    // By category
    const byCategoryResult = await client.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM lumen_ideas
      WHERE created_at >= $1
      GROUP BY category
      ORDER BY count DESC
    `, [startDate]);

    // By revenue potential
    const byRevenueResult = await client.query(`
      SELECT 
        COALESCE(revenue_potential, 'unknown') as revenue_potential,
        COUNT(*) as count
      FROM lumen_ideas
      WHERE created_at >= $1
      GROUP BY revenue_potential
      ORDER BY count DESC
    `, [startDate]);

    // By build time
    const byBuildTimeResult = await client.query(`
      SELECT 
        COALESCE(build_time, 'unknown') as build_time,
        COUNT(*) as count
      FROM lumen_ideas
      WHERE created_at >= $1
      GROUP BY build_time
      ORDER BY count DESC
    `, [startDate]);

    // Ideas over time
    const timelineResult = await client.query(`
      SELECT 
        DATE(created_at) as day,
        COUNT(*) as count
      FROM lumen_ideas
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [startDate]);

    // Status transitions (ideas that moved forward)
    const activeIdeasResult = await client.query(`
      SELECT 
        name,
        category,
        status,
        revenue_potential,
        priority,
        created_at
      FROM lumen_ideas
      WHERE created_at >= $1 AND status IN ('exploring', 'building', 'launched')
      ORDER BY priority DESC, created_at DESC
      LIMIT 10
    `, [startDate]);

    const overall = overallResult.rows[0];
    const total = parseInt(overall.total);

    return {
      total,
      byStatus: {
        idea: parseInt(overall.idea_count),
        exploring: parseInt(overall.exploring_count),
        building: parseInt(overall.building_count),
        launched: parseInt(overall.launched_count),
        paused: parseInt(overall.paused_count)
      },
      avgPriority: overall.avg_priority ? Math.round(parseFloat(overall.avg_priority) * 10) / 10 : 0,
      executionRate: total > 0 
        ? Math.round(((parseInt(overall.building_count) + parseInt(overall.launched_count)) / total) * 100)
        : 0,
      byCategory: byCategoryResult.rows.map(r => ({
        category: r.category,
        count: parseInt(r.count)
      })),
      byRevenuePotential: byRevenueResult.rows.map(r => ({
        potential: r.revenue_potential,
        count: parseInt(r.count)
      })),
      byBuildTime: byBuildTimeResult.rows.map(r => ({
        buildTime: r.build_time,
        count: parseInt(r.count)
      })),
      timeline: timelineResult.rows.map(r => ({
        date: r.day.toISOString().split('T')[0],
        count: parseInt(r.count)
      })),
      activeIdeas: activeIdeasResult.rows.map(r => ({
        name: r.name,
        category: r.category,
        status: r.status,
        revenuePotential: r.revenue_potential,
        priority: r.priority,
        createdAt: r.created_at
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================
// RESOURCE ANALYTICS
// ============================================

async function getResourceStats(pool, startDate) {
  const client = await pool.connect();
  try {
    const overallResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE starred = true) as starred,
        COUNT(*) FILTER (WHERE archived = true) as archived
      FROM lumen_resources
      WHERE created_at >= $1
    `, [startDate]);

    const byTypeResult = await client.query(`
      SELECT 
        type,
        COUNT(*) as count
      FROM lumen_resources
      WHERE created_at >= $1
      GROUP BY type
      ORDER BY count DESC
    `, [startDate]);

    const byCategoryResult = await client.query(`
      SELECT 
        COALESCE(category, 'uncategorized') as category,
        COUNT(*) as count
      FROM lumen_resources
      WHERE created_at >= $1
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `, [startDate]);

    const overall = overallResult.rows[0];

    return {
      total: parseInt(overall.total),
      starred: parseInt(overall.starred),
      archived: parseInt(overall.archived),
      byType: byTypeResult.rows.map(r => ({
        type: r.type,
        count: parseInt(r.count)
      })),
      byCategory: byCategoryResult.rows.map(r => ({
        category: r.category,
        count: parseInt(r.count)
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================
// PITCH ANALYTICS
// ============================================

async function getPitchStats(pool, startDate) {
  const client = await pool.connect();
  try {
    const overallResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE verdict = 'approved') as approved,
        COUNT(*) FILTER (WHERE verdict = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE verdict = 'maybe') as maybe,
        COUNT(*) FILTER (WHERE verdict = 'pending') as pending,
        COUNT(*) FILTER (WHERE starred = true) as starred
      FROM lumen_pitches
      WHERE created_at >= $1
    `, [startDate]);

    const overall = overallResult.rows[0];

    return {
      total: parseInt(overall.total),
      byVerdict: {
        approved: parseInt(overall.approved),
        rejected: parseInt(overall.rejected),
        maybe: parseInt(overall.maybe),
        pending: parseInt(overall.pending)
      },
      starred: parseInt(overall.starred),
      approvalRate: parseInt(overall.total) > 0
        ? Math.round((parseInt(overall.approved) / parseInt(overall.total)) * 100)
        : 0
    };
  } finally {
    client.release();
  }
}

// ============================================
// DAILY ACTIVITY AGGREGATION
// ============================================

async function getDailyActivity(pool, startDate) {
  const client = await pool.connect();
  try {
    // Get all daily activity across data types
    const result = await client.query(`
      WITH expense_days AS (
        SELECT DATE(date) as day, COUNT(*) as expenses, SUM(amount) as expense_total
        FROM lumen_expenses WHERE date >= $1
        GROUP BY DATE(date)
      ),
      briefing_days AS (
        SELECT DATE(created_at) as day, COUNT(*) as briefings
        FROM lumen_briefings WHERE created_at >= $1
        GROUP BY DATE(created_at)
      ),
      idea_days AS (
        SELECT DATE(created_at) as day, COUNT(*) as ideas
        FROM lumen_ideas WHERE created_at >= $1
        GROUP BY DATE(created_at)
      ),
      job_days AS (
        SELECT DATE(created_at) as day, COUNT(*) as jobs
        FROM lumen_jobs WHERE created_at >= $1
        GROUP BY DATE(created_at)
      ),
      resource_days AS (
        SELECT DATE(created_at) as day, COUNT(*) as resources
        FROM lumen_resources WHERE created_at >= $1
        GROUP BY DATE(created_at)
      ),
      all_days AS (
        SELECT day FROM expense_days
        UNION SELECT day FROM briefing_days
        UNION SELECT day FROM idea_days
        UNION SELECT day FROM job_days
        UNION SELECT day FROM resource_days
      )
      SELECT 
        ad.day,
        COALESCE(ed.expenses, 0) as expenses,
        COALESCE(ed.expense_total, 0) as expense_total,
        COALESCE(bd.briefings, 0) as briefings,
        COALESCE(id.ideas, 0) as ideas,
        COALESCE(jd.jobs, 0) as jobs,
        COALESCE(rd.resources, 0) as resources
      FROM all_days ad
      LEFT JOIN expense_days ed ON ad.day = ed.day
      LEFT JOIN briefing_days bd ON ad.day = bd.day
      LEFT JOIN idea_days id ON ad.day = id.day
      LEFT JOIN job_days jd ON ad.day = jd.day
      LEFT JOIN resource_days rd ON ad.day = rd.day
      ORDER BY ad.day
    `, [startDate]);

    return result.rows.map(r => ({
      date: r.day.toISOString().split('T')[0],
      expenses: parseInt(r.expenses),
      expenseTotal: Math.round(parseFloat(r.expense_total) * 100) / 100,
      briefings: parseInt(r.briefings),
      ideas: parseInt(r.ideas),
      jobs: parseInt(r.jobs),
      resources: parseInt(r.resources),
      totalActivity: parseInt(r.expenses) + parseInt(r.briefings) + parseInt(r.ideas) + parseInt(r.jobs) + parseInt(r.resources)
    }));
  } finally {
    client.release();
  }
}

// ============================================
// CATEGORY BREAKDOWNS
// ============================================

async function getCategoryBreakdowns(pool, startDate) {
  const client = await pool.connect();
  try {
    const [expenseCategories, ideaCategories, briefingTypes, jobTypes] = await Promise.all([
      client.query(`
        SELECT category as name, COUNT(*) as count, SUM(amount) as value
        FROM lumen_expenses WHERE date >= $1
        GROUP BY category ORDER BY value DESC
      `, [startDate]),
      client.query(`
        SELECT category as name, COUNT(*) as count
        FROM lumen_ideas WHERE created_at >= $1
        GROUP BY category ORDER BY count DESC
      `, [startDate]),
      client.query(`
        SELECT type as name, COUNT(*) as count
        FROM lumen_briefings WHERE created_at >= $1
        GROUP BY type ORDER BY count DESC
      `, [startDate]),
      client.query(`
        SELECT COALESCE(job_type, 'unspecified') as name, COUNT(*) as count
        FROM lumen_jobs WHERE created_at >= $1
        GROUP BY job_type ORDER BY count DESC
      `, [startDate])
    ]);

    return {
      expenseCategories: expenseCategories.rows.map(r => ({
        name: r.name,
        count: parseInt(r.count),
        value: Math.round(parseFloat(r.value || 0) * 100) / 100
      })),
      ideaCategories: ideaCategories.rows.map(r => ({
        name: r.name,
        count: parseInt(r.count)
      })),
      briefingTypes: briefingTypes.rows.map(r => ({
        name: r.name,
        count: parseInt(r.count)
      })),
      jobTypes: jobTypes.rows.map(r => ({
        name: r.name,
        count: parseInt(r.count)
      }))
    };
  } finally {
    client.release();
  }
}

// ============================================
// CORRELATION ANALYSIS
// ============================================

function findCorrelations(dailyActivity, expenseStats, ideaStats) {
  const correlations = [];

  // Spending vs Idea Generation
  const daysWithIdeas = dailyActivity.filter(d => d.ideas > 0);
  const daysWithoutIdeas = dailyActivity.filter(d => d.ideas === 0);
  
  if (daysWithIdeas.length > 3 && daysWithoutIdeas.length > 3) {
    const avgSpendingIdeaDays = daysWithIdeas.reduce((sum, d) => sum + d.expenseTotal, 0) / daysWithIdeas.length;
    const avgSpendingNoIdeaDays = daysWithoutIdeas.reduce((sum, d) => sum + d.expenseTotal, 0) / daysWithoutIdeas.length;
    
    if (avgSpendingIdeaDays !== avgSpendingNoIdeaDays) {
      const direction = avgSpendingIdeaDays < avgSpendingNoIdeaDays ? 'lower' : 'higher';
      const diff = Math.abs(avgSpendingIdeaDays - avgSpendingNoIdeaDays);
      correlations.push({
        id: 'spending_vs_ideas',
        type: CORRELATION_PATTERNS.SPENDING_VS_PRODUCTIVITY.id,
        title: 'Spending & Idea Generation',
        description: `Days with new ideas have ${direction} spending (avg $${Math.round(avgSpendingIdeaDays)} vs $${Math.round(avgSpendingNoIdeaDays)})`,
        strength: diff > 50 ? 'strong' : diff > 20 ? 'moderate' : 'weak',
        insight: direction === 'lower' 
          ? 'Less spending seems to correlate with more creative thinking' 
          : 'Higher spending days tend to be more productive for ideas',
        data: {
          avgSpendingIdeaDays: Math.round(avgSpendingIdeaDays * 100) / 100,
          avgSpendingNoIdeaDays: Math.round(avgSpendingNoIdeaDays * 100) / 100,
          ideaDayCount: daysWithIdeas.length,
          noIdeaDayCount: daysWithoutIdeas.length
        }
      });
    }
  }

  // Most productive day of week
  const dayOfWeekActivity = {};
  dailyActivity.forEach(d => {
    const dow = new Date(d.date).getDay();
    if (!dayOfWeekActivity[dow]) {
      dayOfWeekActivity[dow] = { ideas: 0, briefings: 0, jobs: 0, count: 0 };
    }
    dayOfWeekActivity[dow].ideas += d.ideas;
    dayOfWeekActivity[dow].briefings += d.briefings;
    dayOfWeekActivity[dow].jobs += d.jobs;
    dayOfWeekActivity[dow].count++;
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let mostProductiveDay = null;
  let maxActivity = 0;
  Object.entries(dayOfWeekActivity).forEach(([dow, data]) => {
    const avgActivity = (data.ideas + data.briefings + data.jobs) / data.count;
    if (avgActivity > maxActivity) {
      maxActivity = avgActivity;
      mostProductiveDay = parseInt(dow);
    }
  });

  if (mostProductiveDay !== null) {
    correlations.push({
      id: 'productive_day',
      type: CORRELATION_PATTERNS.PRODUCTIVE_DAYS.id,
      title: 'Most Productive Day',
      description: `${dayNames[mostProductiveDay]} is your most productive day`,
      strength: 'moderate',
      insight: `You tend to generate more ideas, read more briefings, and track more jobs on ${dayNames[mostProductiveDay]}s`,
      data: {
        dayOfWeek: mostProductiveDay,
        dayName: dayNames[mostProductiveDay],
        avgActivity: Math.round(maxActivity * 10) / 10,
        breakdown: dayOfWeekActivity[mostProductiveDay]
      }
    });
  }

  // High activity days pattern
  const highActivityDays = dailyActivity.filter(d => d.totalActivity >= 5);
  if (highActivityDays.length > 0) {
    const avgSpendingHighActivity = highActivityDays.reduce((sum, d) => sum + d.expenseTotal, 0) / highActivityDays.length;
    correlations.push({
      id: 'high_activity_spending',
      type: CORRELATION_PATTERNS.PRODUCTIVE_DAYS.id,
      title: 'High Activity Days',
      description: `${highActivityDays.length} days with 5+ activities`,
      strength: 'strong',
      insight: `On highly active days, you spend an average of $${Math.round(avgSpendingHighActivity)}`,
      data: {
        highActivityDayCount: highActivityDays.length,
        avgSpending: Math.round(avgSpendingHighActivity * 100) / 100
      }
    });
  }

  return correlations;
}

// ============================================
// INSIGHTS GENERATION
// ============================================

function generateInsights(expenseStats, briefingStats, jobStats, ideaStats, dailyActivity, correlations) {
  const insights = [];

  // Spending trend insight
  if (expenseStats.monthly.length >= 2) {
    const recent = expenseStats.monthly[expenseStats.monthly.length - 1];
    const previous = expenseStats.monthly[expenseStats.monthly.length - 2];
    const change = recent.total - previous.total;
    const changePercent = previous.total > 0 ? Math.round((change / previous.total) * 100) : 0;
    
    insights.push({
      id: 'spending_trend',
      category: 'finance',
      title: change > 0 ? '📈 Spending Up' : '📉 Spending Down',
      description: `Your spending is ${change > 0 ? 'up' : 'down'} ${Math.abs(changePercent)}% from last month ($${Math.round(recent.total)} vs $${Math.round(previous.total)})`,
      priority: Math.abs(changePercent) > 20 ? 'high' : 'medium',
      actionable: change > 0 ? 'Review recent expenses to identify areas to cut back' : 'Great job managing expenses!'
    });
  }

  // Reading backlog insight
  if (briefingStats.unread > 10) {
    insights.push({
      id: 'reading_backlog',
      category: 'productivity',
      title: '📚 Reading Backlog',
      description: `You have ${briefingStats.unread} unread briefings waiting`,
      priority: briefingStats.unread > 50 ? 'high' : 'medium',
      actionable: 'Set aside 30 minutes to catch up on important briefings'
    });
  }

  // Job search momentum
  if (jobStats.total > 0) {
    const recentApplications = jobStats.applicationTimeline.slice(-7).reduce((sum, d) => sum + d.applications, 0);
    if (recentApplications === 0 && jobStats.byStatus.new > 5) {
      insights.push({
        id: 'job_momentum',
        category: 'career',
        title: '🎯 Job Search Stalled',
        description: `No applications this week, but ${jobStats.byStatus.new} jobs saved`,
        priority: 'high',
        actionable: 'Review saved jobs and submit at least 3 applications today'
      });
    } else if (recentApplications > 5) {
      insights.push({
        id: 'job_momentum_positive',
        category: 'career',
        title: '🚀 Great Job Search Momentum',
        description: `${recentApplications} applications in the last week!`,
        priority: 'low',
        actionable: 'Keep up the pace - follow up on pending applications'
      });
    }
  }

  // Ideas in motion
  const ideasInProgress = ideaStats.byStatus.exploring + ideaStats.byStatus.building;
  if (ideasInProgress > 0) {
    insights.push({
      id: 'ideas_in_motion',
      category: 'creative',
      title: '💡 Ideas In Motion',
      description: `${ideasInProgress} ideas actively being worked on`,
      priority: 'low',
      actionable: ideasInProgress > 3 ? 'Consider focusing on fewer ideas for better progress' : 'Good focus - keep building!'
    });
  }

  // Idea to execution gap
  if (ideaStats.total > 10 && ideaStats.executionRate < 10) {
    insights.push({
      id: 'idea_execution_gap',
      category: 'creative',
      title: '⚠️ Idea-to-Action Gap',
      description: `Only ${ideaStats.executionRate}% of ideas are being built or launched`,
      priority: 'medium',
      actionable: 'Pick your top priority idea and commit to exploring it this week'
    });
  }

  // Add correlation-based insights
  correlations.forEach(corr => {
    if (corr.strength === 'strong') {
      insights.push({
        id: `corr_${corr.id}`,
        category: 'pattern',
        title: `🔮 ${corr.title}`,
        description: corr.description,
        priority: 'medium',
        actionable: corr.insight
      });
    }
  });

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return insights;
}

// ============================================
// LIFE SCORES
// ============================================

function calculateLifeScores(expenseStats, briefingStats, jobStats, ideaStats, resourceStats) {
  const scores = {};

  // Financial Health (based on spending patterns)
  const financialScore = calculateFinancialScore(expenseStats);
  scores.financial = financialScore;

  // Knowledge Intake (based on briefing engagement)
  const knowledgeScore = calculateKnowledgeScore(briefingStats);
  scores.knowledge = knowledgeScore;

  // Career Momentum (based on job tracking)
  const careerScore = calculateCareerScore(jobStats);
  scores.career = careerScore;

  // Creative Output (based on idea generation)
  const creativeScore = calculateCreativeScore(ideaStats);
  scores.creative = creativeScore;

  // Overall Life Score (weighted average)
  scores.overall = Math.round(
    (financialScore.score * 0.25 +
     knowledgeScore.score * 0.2 +
     careerScore.score * 0.3 +
     creativeScore.score * 0.25)
  );

  return scores;
}

function calculateFinancialScore(expenseStats) {
  // Score based on spending consistency and category diversity
  const hasData = expenseStats.total > 0;
  if (!hasData) return { score: 50, label: 'No data', factors: [] };

  const factors = [];
  let score = 70; // Base score

  // Reward category diversity (not spending too much in one area)
  const topCategoryPercent = expenseStats.byCategory[0]?.percentage || 0;
  if (topCategoryPercent < 40) {
    score += 10;
    factors.push({ name: 'Diversified spending', impact: '+10' });
  } else if (topCategoryPercent > 60) {
    score -= 10;
    factors.push({ name: 'Concentrated spending', impact: '-10' });
  }

  // Check for consistent tracking
  if (expenseStats.daily.length > 20) {
    score += 10;
    factors.push({ name: 'Regular expense tracking', impact: '+10' });
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    label: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention',
    factors
  };
}

function calculateKnowledgeScore(briefingStats) {
  if (briefingStats.total === 0) return { score: 50, label: 'No data', factors: [] };

  const factors = [];
  let score = 60;

  // Read rate
  if (briefingStats.readRate > 80) {
    score += 20;
    factors.push({ name: 'High read rate', impact: '+20' });
  } else if (briefingStats.readRate > 50) {
    score += 10;
    factors.push({ name: 'Moderate read rate', impact: '+10' });
  } else {
    score -= 10;
    factors.push({ name: 'Low read rate', impact: '-10' });
  }

  // Volume
  if (briefingStats.total > 50) {
    score += 10;
    factors.push({ name: 'Active consumption', impact: '+10' });
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    label: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention',
    factors
  };
}

function calculateCareerScore(jobStats) {
  if (jobStats.total === 0) return { score: 50, label: 'No data', factors: [] };

  const factors = [];
  let score = 60;

  // Application activity
  if (jobStats.byStatus.applied > 10) {
    score += 15;
    factors.push({ name: 'Active applications', impact: '+15' });
  }

  // Interview rate
  if (jobStats.conversionRates.interviewRate > 20) {
    score += 15;
    factors.push({ name: 'Good interview rate', impact: '+15' });
  }

  // Offers
  if (jobStats.byStatus.offered > 0) {
    score += 20;
    factors.push({ name: 'Received offers', impact: '+20' });
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    label: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention',
    factors
  };
}

function calculateCreativeScore(ideaStats) {
  if (ideaStats.total === 0) return { score: 50, label: 'No data', factors: [] };

  const factors = [];
  let score = 60;

  // Idea volume
  if (ideaStats.total > 20) {
    score += 15;
    factors.push({ name: 'Prolific ideation', impact: '+15' });
  }

  // Execution rate
  if (ideaStats.executionRate > 20) {
    score += 20;
    factors.push({ name: 'High execution rate', impact: '+20' });
  } else if (ideaStats.executionRate > 10) {
    score += 10;
    factors.push({ name: 'Moderate execution', impact: '+10' });
  }

  // Active projects
  if (ideaStats.byStatus.building > 0) {
    score += 10;
    factors.push({ name: 'Building projects', impact: '+10' });
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    label: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention',
    factors
  };
}

// ============================================
// STREAK CALCULATIONS
// ============================================

function calculateStreaks(dailyActivity) {
  const streaks = {
    currentActivityStreak: 0,
    longestActivityStreak: 0,
    currentIdeaStreak: 0,
    currentExpenseStreak: 0,
    lastActiveDate: null
  };

  if (dailyActivity.length === 0) return streaks;

  // Sort by date descending
  const sorted = [...dailyActivity].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Calculate current activity streak
  let currentStreak = 0;
  const today = new Date().toISOString().split('T')[0];
  
  for (let i = 0; i < sorted.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const expectedDate = expected.toISOString().split('T')[0];
    
    if (sorted[i] && sorted[i].date === expectedDate && sorted[i].totalActivity > 0) {
      currentStreak++;
    } else {
      break;
    }
  }
  streaks.currentActivityStreak = currentStreak;

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  const sortedAsc = [...dailyActivity].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  for (let i = 0; i < sortedAsc.length; i++) {
    if (sortedAsc[i].totalActivity > 0) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prevDate = new Date(sortedAsc[i - 1].date);
        const currDate = new Date(sortedAsc[i].date);
        const diffDays = (currDate - prevDate) / (1000 * 60 * 60 * 24);
        
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 0;
    }
  }
  streaks.longestActivityStreak = Math.max(longestStreak, tempStreak);

  // Last active date
  const lastActive = sorted.find(d => d.totalActivity > 0);
  streaks.lastActiveDate = lastActive?.date || null;

  return streaks;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  generateLifeDashboard,
  CORRELATION_PATTERNS,
  // Export individual functions for testing/direct use
  getExpenseStats,
  getBriefingStats,
  getJobStats,
  getIdeaStats,
  getResourceStats,
  getPitchStats,
  getDailyActivity,
  findCorrelations,
  generateInsights,
  calculateLifeScores
};
