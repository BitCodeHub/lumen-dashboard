/**
 * 🔔 PROACTIVE NOTIFICATIONS ENGINE
 * "Proactive Jimmy" - AI that alerts BEFORE you ask
 * 
 * Rule Types:
 * - spending_threshold: Alert if category spending > amount
 * - time_based: Remind after X days (bills, follow-ups)
 * - pattern_match: Alert if new item matches criteria
 * - anomaly_detect: Alert on unusual patterns
 * - milestone: Celebrate achievements
 */

// ============================================
// RULE EVALUATORS
// ============================================

/**
 * Evaluate spending threshold rules
 * "Alert me if I spend more than $200 on Food this week"
 */
async function evaluateSpendingThreshold(pool, rule) {
  const { category, amount, period = 'week' } = rule.config;
  
  // Calculate date range
  const now = new Date();
  let startDate;
  switch (period) {
    case 'day':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    default:
      startDate = new Date(now.setDate(now.getDate() - 7));
  }

  const result = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM lumen_expenses
    WHERE category = $1 AND date >= $2
  `, [category, startDate]);

  const totalSpent = parseFloat(result.rows[0].total) || 0;
  
  if (totalSpent > amount) {
    const overage = (totalSpent - amount).toFixed(2);
    const percentOver = ((totalSpent / amount - 1) * 100).toFixed(0);
    
    return {
      triggered: true,
      severity: percentOver > 50 ? 'high' : percentOver > 20 ? 'medium' : 'low',
      title: `💰 ${category} Spending Alert`,
      message: `You've spent $${totalSpent.toFixed(2)} on ${category} this ${period} — that's $${overage} (${percentOver}%) over your $${amount} threshold.`,
      data: { totalSpent, threshold: amount, overage, percentOver, period, category }
    };
  }
  
  return { triggered: false };
}

/**
 * Evaluate time-based rules
 * "Remind me 3 days before rent is due", "Follow up on job in 5 days"
 */
async function evaluateTimeBased(pool, rule) {
  const { table, condition_field, days_before, filter = {} } = rule.config;
  
  // Validate allowed tables
  const allowedTables = ['lumen_jobs', 'lumen_briefings', 'lumen_expenses', 'lumen_ideas'];
  if (!allowedTables.includes(table)) {
    return { triggered: false, error: 'Invalid table' };
  }

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days_before);
  
  // Build dynamic query based on table
  let query, params;
  
  if (table === 'lumen_jobs' && condition_field === 'applied_at') {
    // Jobs that were applied to X days ago (follow-up reminder)
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() - days_before);
    
    query = `
      SELECT id, title, company, applied_at
      FROM lumen_jobs
      WHERE applied_at IS NOT NULL 
        AND applied_at <= $1
        AND status NOT IN ('rejected', 'withdrawn', 'hired')
      ORDER BY applied_at DESC
      LIMIT 5
    `;
    params = [reminderDate];
    
    const result = await pool.query(query, params);
    
    if (result.rows.length > 0) {
      const jobs = result.rows.map(j => `• ${j.company}: ${j.title}`).join('\n');
      return {
        triggered: true,
        severity: 'medium',
        title: `📧 Job Follow-Up Reminder`,
        message: `It's been ${days_before}+ days since you applied. Time to follow up?\n\n${jobs}`,
        data: { jobs: result.rows, days_before }
      };
    }
  }
  
  if (table === 'lumen_briefings' && rule.config.type) {
    // Briefings that haven't been read
    query = `
      SELECT id, title, type, created_at
      FROM lumen_briefings
      WHERE type = $1 AND read = FALSE
        AND created_at <= NOW() - INTERVAL '${days_before} days'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    params = [rule.config.type];
    
    const result = await pool.query(query, params);
    
    if (result.rows.length > 0) {
      return {
        triggered: true,
        severity: 'low',
        title: `📚 Unread ${rule.config.type} Briefings`,
        message: `You have ${result.rows.length} unread ${rule.config.type} briefing(s) from ${days_before}+ days ago.`,
        data: { briefings: result.rows, days_before }
      };
    }
  }

  return { triggered: false };
}

/**
 * Evaluate pattern match rules
 * "Alert me if a new job matches 'AI Engineer' in San Francisco"
 */
async function evaluatePatternMatch(pool, rule) {
  const { table, patterns = {}, since_hours = 24 } = rule.config;
  
  const sinceDate = new Date();
  sinceDate.setHours(sinceDate.getHours() - since_hours);

  if (table === 'lumen_jobs') {
    const conditions = [];
    const params = [sinceDate];
    let paramIdx = 2;

    if (patterns.title) {
      conditions.push(`LOWER(title) LIKE $${paramIdx}`);
      params.push(`%${patterns.title.toLowerCase()}%`);
      paramIdx++;
    }
    if (patterns.company) {
      conditions.push(`LOWER(company) LIKE $${paramIdx}`);
      params.push(`%${patterns.company.toLowerCase()}%`);
      paramIdx++;
    }
    if (patterns.location) {
      conditions.push(`LOWER(location) LIKE $${paramIdx}`);
      params.push(`%${patterns.location.toLowerCase()}%`);
      paramIdx++;
    }
    if (patterns.min_salary) {
      conditions.push(`(salary_min >= $${paramIdx} OR salary_max >= $${paramIdx})`);
      params.push(patterns.min_salary);
      paramIdx++;
    }

    if (conditions.length === 0) {
      return { triggered: false };
    }

    const query = `
      SELECT id, title, company, location, salary_text, created_at
      FROM lumen_jobs
      WHERE created_at >= $1 AND (${conditions.join(' AND ')})
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const result = await pool.query(query, params);

    if (result.rows.length > 0) {
      const matchList = result.rows.map(j => 
        `• ${j.title} at ${j.company}${j.salary_text ? ` (${j.salary_text})` : ''}`
      ).join('\n');
      
      return {
        triggered: true,
        severity: result.rows.length > 3 ? 'high' : 'medium',
        title: `🎯 ${result.rows.length} New Job Match${result.rows.length > 1 ? 'es' : ''}!`,
        message: `Found jobs matching your criteria in the last ${since_hours} hours:\n\n${matchList}`,
        data: { jobs: result.rows, patterns, since_hours }
      };
    }
  }

  if (table === 'lumen_ideas') {
    const conditions = [];
    const params = [sinceDate];
    let paramIdx = 2;

    if (patterns.category) {
      conditions.push(`LOWER(category) LIKE $${paramIdx}`);
      params.push(`%${patterns.category.toLowerCase()}%`);
      paramIdx++;
    }
    if (patterns.revenue_potential) {
      conditions.push(`revenue_potential = $${paramIdx}`);
      params.push(patterns.revenue_potential);
      paramIdx++;
    }

    if (conditions.length === 0) {
      return { triggered: false };
    }

    const query = `
      SELECT id, name, category, revenue_potential, created_at
      FROM lumen_ideas
      WHERE created_at >= $1 AND (${conditions.join(' AND ')})
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const result = await pool.query(query, params);

    if (result.rows.length > 0) {
      return {
        triggered: true,
        severity: 'medium',
        title: `💡 New Idea Alert`,
        message: `${result.rows.length} new idea(s) match your criteria!`,
        data: { ideas: result.rows, patterns }
      };
    }
  }

  return { triggered: false };
}

/**
 * Evaluate anomaly detection rules
 * "Alert me if daily spending is 2x the average"
 */
async function evaluateAnomalyDetect(pool, rule) {
  const { metric, multiplier = 2.0, lookback_days = 30 } = rule.config;

  if (metric === 'daily_spending') {
    // Get average daily spending over lookback period
    const avgResult = await pool.query(`
      SELECT AVG(daily_total) as avg_daily
      FROM (
        SELECT DATE(date) as day, SUM(amount) as daily_total
        FROM lumen_expenses
        WHERE date >= NOW() - INTERVAL '${lookback_days} days'
          AND date < CURRENT_DATE
        GROUP BY DATE(date)
      ) daily
    `);

    // Get today's spending
    const todayResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as today_total
      FROM lumen_expenses
      WHERE DATE(date) = CURRENT_DATE
    `);

    const avgDaily = parseFloat(avgResult.rows[0].avg_daily) || 0;
    const todayTotal = parseFloat(todayResult.rows[0].today_total) || 0;

    if (avgDaily > 0 && todayTotal > avgDaily * multiplier) {
      const ratio = (todayTotal / avgDaily).toFixed(1);
      return {
        triggered: true,
        severity: ratio > 3 ? 'high' : 'medium',
        title: `📊 Unusual Spending Detected`,
        message: `Today's spending ($${todayTotal.toFixed(2)}) is ${ratio}x your ${lookback_days}-day average ($${avgDaily.toFixed(2)}/day).`,
        data: { todayTotal, avgDaily, ratio, multiplier }
      };
    }
  }

  if (metric === 'category_spike') {
    const { category } = rule.config;
    
    // Compare this week to average
    const avgResult = await pool.query(`
      SELECT AVG(weekly_total) as avg_weekly
      FROM (
        SELECT DATE_TRUNC('week', date) as week, SUM(amount) as weekly_total
        FROM lumen_expenses
        WHERE category = $1 
          AND date >= NOW() - INTERVAL '${lookback_days} days'
          AND date < DATE_TRUNC('week', NOW())
        GROUP BY DATE_TRUNC('week', date)
      ) weekly
    `, [category]);

    const thisWeekResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as week_total
      FROM lumen_expenses
      WHERE category = $1 
        AND date >= DATE_TRUNC('week', NOW())
    `, [category]);

    const avgWeekly = parseFloat(avgResult.rows[0].avg_weekly) || 0;
    const thisWeek = parseFloat(thisWeekResult.rows[0].week_total) || 0;

    if (avgWeekly > 0 && thisWeek > avgWeekly * multiplier) {
      const ratio = (thisWeek / avgWeekly).toFixed(1);
      return {
        triggered: true,
        severity: 'medium',
        title: `📈 ${category} Spending Spike`,
        message: `This week's ${category} spending ($${thisWeek.toFixed(2)}) is ${ratio}x your usual average ($${avgWeekly.toFixed(2)}/week).`,
        data: { thisWeek, avgWeekly, ratio, category }
      };
    }
  }

  return { triggered: false };
}

/**
 * Evaluate milestone rules
 * "Celebrate when I save $1000", "Alert when 10 jobs applied"
 */
async function evaluateMilestone(pool, rule) {
  const { metric, threshold, direction = 'above' } = rule.config;

  if (metric === 'jobs_applied') {
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM lumen_jobs WHERE applied_at IS NOT NULL
    `);
    const count = parseInt(result.rows[0].count);

    if (direction === 'above' && count >= threshold) {
      return {
        triggered: true,
        severity: 'celebration',
        title: `🎉 Milestone: ${threshold} Jobs Applied!`,
        message: `You've applied to ${count} jobs! Keep up the momentum!`,
        data: { count, threshold }
      };
    }
  }

  if (metric === 'ideas_created') {
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM lumen_ideas
    `);
    const count = parseInt(result.rows[0].count);

    if (count >= threshold) {
      return {
        triggered: true,
        severity: 'celebration',
        title: `🎉 Milestone: ${threshold} Ideas Logged!`,
        message: `You've captured ${count} ideas! Time to build something?`,
        data: { count, threshold }
      };
    }
  }

  if (metric === 'briefings_read') {
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM lumen_briefings WHERE read = TRUE
    `);
    const count = parseInt(result.rows[0].count);

    if (count >= threshold) {
      return {
        triggered: true,
        severity: 'celebration',
        title: `📚 Milestone: ${threshold} Briefings Read!`,
        message: `You've read ${count} briefings. Knowledge is power!`,
        data: { count, threshold }
      };
    }
  }

  return { triggered: false };
}

// ============================================
// MAIN RULE ENGINE
// ============================================

const RULE_EVALUATORS = {
  spending_threshold: evaluateSpendingThreshold,
  time_based: evaluateTimeBased,
  pattern_match: evaluatePatternMatch,
  anomaly_detect: evaluateAnomalyDetect,
  milestone: evaluateMilestone
};

/**
 * Check if a notification was recently sent for this rule
 * Prevents duplicate notifications
 */
async function wasRecentlySent(pool, ruleId, cooldownHours = 24) {
  const result = await pool.query(`
    SELECT id FROM lumen_notifications
    WHERE rule_id = $1 
      AND created_at > NOW() - INTERVAL '${cooldownHours} hours'
    ORDER BY created_at DESC
    LIMIT 1
  `, [ruleId]);
  
  return result.rows.length > 0;
}

/**
 * Record a sent notification
 */
async function recordNotification(pool, ruleId, notification) {
  const result = await pool.query(`
    INSERT INTO lumen_notifications (
      rule_id, title, message, severity, data, status
    ) VALUES ($1, $2, $3, $4, $5, 'pending')
    RETURNING *
  `, [
    ruleId,
    notification.title,
    notification.message,
    notification.severity,
    JSON.stringify(notification.data)
  ]);
  
  return result.rows[0];
}

/**
 * Run all active rules and generate notifications
 */
async function runAllRules(pool) {
  const results = {
    checked: 0,
    triggered: 0,
    notifications: [],
    errors: []
  };

  try {
    // Get all active rules
    const rulesResult = await pool.query(`
      SELECT * FROM lumen_notification_rules
      WHERE enabled = TRUE
      ORDER BY priority DESC, created_at ASC
    `);

    for (const rule of rulesResult.rows) {
      results.checked++;
      
      try {
        // Check cooldown
        const cooldownHours = rule.cooldown_hours || 24;
        if (await wasRecentlySent(pool, rule.id, cooldownHours)) {
          continue; // Skip - recently sent
        }

        // Get the evaluator for this rule type
        const evaluator = RULE_EVALUATORS[rule.rule_type];
        if (!evaluator) {
          results.errors.push({ ruleId: rule.id, error: `Unknown rule type: ${rule.rule_type}` });
          continue;
        }

        // Evaluate the rule
        const evaluation = await evaluator(pool, rule);

        if (evaluation.triggered) {
          // Record the notification
          const notification = await recordNotification(pool, rule.id, evaluation);
          results.triggered++;
          results.notifications.push({
            id: notification.id,
            rule_name: rule.name,
            ...evaluation
          });

          // Update rule's last triggered time
          await pool.query(`
            UPDATE lumen_notification_rules
            SET last_triggered_at = NOW(), times_triggered = times_triggered + 1
            WHERE id = $1
          `, [rule.id]);
        }
      } catch (err) {
        results.errors.push({ ruleId: rule.id, ruleName: rule.name, error: err.message });
      }
    }
  } catch (err) {
    results.errors.push({ error: err.message });
  }

  return results;
}

// ============================================
// EXAMPLE RULES
// ============================================

const EXAMPLE_RULES = [
  {
    name: 'Weekly Food Budget',
    description: 'Alert if Food spending exceeds $200/week',
    rule_type: 'spending_threshold',
    config: { category: 'Food', amount: 200, period: 'week' },
    priority: 1
  },
  {
    name: 'Job Follow-Up',
    description: 'Remind to follow up 5 days after applying',
    rule_type: 'time_based',
    config: { table: 'lumen_jobs', condition_field: 'applied_at', days_before: 5 },
    priority: 2
  },
  {
    name: 'AI Job Alert',
    description: 'Alert when new AI/ML jobs are posted',
    rule_type: 'pattern_match',
    config: { 
      table: 'lumen_jobs', 
      patterns: { title: 'AI' }, 
      since_hours: 24 
    },
    priority: 3
  },
  {
    name: 'Spending Anomaly',
    description: 'Alert if daily spending is 2x normal',
    rule_type: 'anomaly_detect',
    config: { metric: 'daily_spending', multiplier: 2.0, lookback_days: 30 },
    priority: 1
  },
  {
    name: '10 Jobs Milestone',
    description: 'Celebrate applying to 10 jobs',
    rule_type: 'milestone',
    config: { metric: 'jobs_applied', threshold: 10 },
    priority: 0
  }
];

// ============================================
// EXPORTS
// ============================================

module.exports = {
  RULE_EVALUATORS,
  EXAMPLE_RULES,
  runAllRules,
  wasRecentlySent,
  recordNotification,
  evaluateSpendingThreshold,
  evaluateTimeBased,
  evaluatePatternMatch,
  evaluateAnomalyDetect,
  evaluateMilestone
};
