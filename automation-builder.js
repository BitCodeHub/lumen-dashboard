/**
 * automation-builder.js
 * Natural Language Automation Builder for Jimmy & Lumen AI Solutions
 * 
 * "Invisible Automation" - Create automations from plain English
 * 
 * Examples:
 *   "When Food spending exceeds $500, alert me"
 *   "Every Monday at 9am, send me a spending summary"
 *   "If I spend more than $100 at restaurants in a day, notify me"
 *   "When I add an expense over $200, categorize it for review"
 */

// ============================================
// PATTERN DEFINITIONS
// ============================================

const TRIGGER_PATTERNS = {
  expense_added: {
    patterns: [
      /when (?:I |an? )?(?:add|create|log|enter|record)(?:s|ed)? (?:an? )?expense/i,
      /(?:on|after) (?:new |any )?expense/i,
      /expense (?:is )?(?:added|created|logged)/i
    ],
    event: 'expense_added',
    description: 'Triggers when a new expense is added'
  },
  expense_threshold: {
    patterns: [
      /when (?:(?:my )?(\w+) )?spending (?:exceeds?|goes? (?:over|above)|reaches?|hits?) \$?([\d,]+)/i,
      /if (?:(?:my )?(\w+) )?(?:total|spending|expenses?) (?:exceeds?|is over|goes? above) \$?([\d,]+)/i,
      /(?:(\w+) )?budget (?:exceeds?|over) \$?([\d,]+)/i
    ],
    event: 'expense_threshold',
    description: 'Triggers when spending exceeds a threshold'
  },
  time_based: {
    patterns: [
      /every (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /every (day|week|month|morning|evening|night)/i,
      /at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /daily at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /(weekly|monthly|daily)/i
    ],
    event: 'time_based',
    description: 'Triggers on a schedule'
  },
  pattern_match: {
    patterns: [
      /when (?:I )?(?:spend|buy|purchase)(?:s)? (?:at|from) ([\w\s'&-]+)/i,
      /if (?:vendor|merchant|store) (?:is|matches|contains) ([\w\s'&-]+)/i,
      /(?:spending|purchases?) (?:at|from) ([\w\s'&-]+)/i
    ],
    event: 'pattern_match',
    description: 'Triggers when pattern matches expense data'
  },
  daily_summary: {
    patterns: [
      /daily (?:spending )?summary/i,
      /end of day (?:report|summary)/i,
      /summarize (?:my )?(?:daily )?spending/i
    ],
    event: 'daily_summary',
    description: 'Triggers daily summary generation'
  }
};

const CONDITION_PATTERNS = {
  category: {
    patterns: [
      /(?:category|type) (?:is |= ?|equals? )?([\w\s]+)/i,
      /for (food|transport|shopping|entertainment|bills|health|gas|groceries)/i,
      /(food|transport|shopping|entertainment|bills|health|gas|groceries) (?:spending|expenses?)/i
    ],
    extract: (match) => ({ field: 'category', operator: '=', value: match[1].trim() })
  },
  amount_gt: {
    patterns: [
      /(?:amount|expense) (?:is )?>(?:=)? ?\$?([\d,]+)/i,
      /(?:more|over|above|exceeds?) (?:than )?\$?([\d,]+)/i,
      /\$?([\d,]+)\+/i
    ],
    extract: (match) => ({ field: 'amount', operator: '>', value: parseFloat(match[1].replace(/,/g, '')) })
  },
  amount_lt: {
    patterns: [
      /(?:amount|expense) (?:is )?<(?:=)? ?\$?([\d,]+)/i,
      /(?:less|under|below) (?:than )?\$?([\d,]+)/i
    ],
    extract: (match) => ({ field: 'amount', operator: '<', value: parseFloat(match[1].replace(/,/g, '')) })
  },
  vendor: {
    patterns: [
      /(?:at|from) ([\w\s'&-]+?)(?:\s|,|$)/i,
      /vendor (?:is |= ?|equals? )([\w\s'&-]+)/i,
      /merchant (?:is |= ?|equals? )([\w\s'&-]+)/i
    ],
    extract: (match) => ({ field: 'vendor', operator: 'contains', value: match[1].trim() })
  },
  time_period: {
    patterns: [
      /(?:in (?:a|the) )?(day|week|month|year)/i,
      /(?:this|current) (day|week|month)/i,
      /(?:per|each) (day|week|month)/i
    ],
    extract: (match) => ({ field: 'period', operator: '=', value: match[1].toLowerCase() })
  },
  monthly_total: {
    patterns: [
      /monthly (?:total|spending) ?(?:>|exceeds?|over|above) ?\$?([\d,]+)/i,
      /(?:this month|monthly) .*\$?([\d,]+)/i
    ],
    extract: (match) => ({ field: 'monthly_total', operator: '>', value: parseFloat(match[1].replace(/,/g, '')) })
  }
};

const ACTION_PATTERNS = {
  notify: {
    patterns: [
      /(?:alert|notify|tell|remind|warn|ping|message) (?:me|user)/i,
      /send (?:me )?(?:a )?(?:notification|alert|message)/i,
      /(?:push )?notification/i
    ],
    action: 'notify',
    description: 'Send a notification'
  },
  email: {
    patterns: [
      /email (?:me|user)/i,
      /send (?:an? )?email/i
    ],
    action: 'email',
    description: 'Send an email'
  },
  tag: {
    patterns: [
      /(?:tag|label|mark) (?:it |as |for )?([\w\s]+)/i,
      /add (?:a )?tag ([\w\s]+)/i,
      /categorize (?:as |for )?(review|urgent|important)/i
    ],
    action: 'tag',
    description: 'Add a tag to the expense'
  },
  flag: {
    patterns: [
      /flag (?:it |for )?(review|attention)/i,
      /mark (?:it )?(?:as )?(suspicious|unusual|important)/i
    ],
    action: 'flag',
    description: 'Flag for review'
  },
  summary: {
    patterns: [
      /(?:generate|create|send|show) (?:a )?(?:spending )?summary/i,
      /summarize (?:my )?(?:spending|expenses)/i
    ],
    action: 'summary',
    description: 'Generate a spending summary'
  },
  log: {
    patterns: [
      /log (?:it|this)/i,
      /record (?:it|this)/i,
      /save (?:to )?(?:a )?log/i
    ],
    action: 'log',
    description: 'Log the event'
  }
};

// ============================================
// NATURAL LANGUAGE PARSER
// ============================================

/**
 * Parse natural language into structured automation
 * @param {string} input - Natural language description
 * @returns {Object} Parsed automation structure
 */
function parseNaturalLanguage(input) {
  const result = {
    raw_input: input,
    trigger: null,
    conditions: [],
    action: null,
    schedule: null,
    parsed_at: new Date().toISOString(),
    confidence: 0
  };

  let matchCount = 0;
  const inputLower = input.toLowerCase();

  // 1. Parse trigger
  for (const [type, config] of Object.entries(TRIGGER_PATTERNS)) {
    for (const pattern of config.patterns) {
      const match = input.match(pattern);
      if (match) {
        result.trigger = {
          type,
          event: config.event,
          description: config.description,
          raw_match: match[0]
        };

        // Extract threshold value for expense_threshold
        if (type === 'expense_threshold' && match[2]) {
          result.trigger.threshold = parseFloat(match[2].replace(/,/g, ''));
          if (match[1]) {
            result.trigger.category = match[1];
          }
        }

        // Extract schedule for time_based
        if (type === 'time_based') {
          result.schedule = parseSchedule(input);
        }

        matchCount++;
        break;
      }
    }
    if (result.trigger) break;
  }

  // 2. Parse conditions
  for (const [type, config] of Object.entries(CONDITION_PATTERNS)) {
    for (const pattern of config.patterns) {
      const match = input.match(pattern);
      if (match) {
        const condition = config.extract(match);
        if (condition && !result.conditions.find(c => c.field === condition.field)) {
          condition.type = type;
          result.conditions.push(condition);
          matchCount++;
        }
      }
    }
  }

  // 3. Parse action
  for (const [type, config] of Object.entries(ACTION_PATTERNS)) {
    for (const pattern of config.patterns) {
      const match = input.match(pattern);
      if (match) {
        result.action = {
          type,
          action: config.action,
          description: config.description,
          raw_match: match[0]
        };

        // Extract parameters for tag action
        if (type === 'tag' && match[1]) {
          result.action.tag_value = match[1].trim();
        }

        matchCount++;
        break;
      }
    }
    if (result.action) break;
  }

  // Calculate confidence based on what we parsed
  if (result.trigger && result.action) {
    result.confidence = 0.7;
    if (result.conditions.length > 0) result.confidence += 0.1;
    if (result.schedule) result.confidence += 0.1;
    result.confidence = Math.min(result.confidence + (matchCount * 0.02), 1.0);
  } else if (result.trigger || result.action) {
    result.confidence = 0.4;
  } else {
    result.confidence = 0.1;
  }

  // Set defaults if missing
  if (!result.trigger) {
    result.trigger = {
      type: 'expense_added',
      event: 'expense_added',
      description: 'Triggers when a new expense is added',
      inferred: true
    };
  }

  if (!result.action) {
    result.action = {
      type: 'notify',
      action: 'notify',
      description: 'Send a notification',
      inferred: true
    };
  }

  return result;
}

/**
 * Parse schedule from natural language
 */
function parseSchedule(input) {
  const schedule = {
    type: null,
    cron: null,
    human_readable: null
  };

  // Day of week
  const dayMatch = input.match(/every (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (dayMatch) {
    const days = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
    const day = days[dayMatch[1].toLowerCase()];
    schedule.type = 'weekly';
    schedule.day = dayMatch[1];
    schedule.cron = `0 9 * * ${day}`;
    schedule.human_readable = `Every ${dayMatch[1]} at 9:00 AM`;
  }

  // Time
  const timeMatch = input.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const ampm = timeMatch[3]?.toLowerCase();
    
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    if (schedule.cron) {
      schedule.cron = schedule.cron.replace(/^0 9/, `${minute} ${hour}`);
    } else {
      schedule.cron = `${minute} ${hour} * * *`;
      schedule.type = 'daily';
    }
    schedule.human_readable = `At ${hour}:${minute.toString().padStart(2, '0')}`;
  }

  // Frequency
  if (/daily/i.test(input)) {
    schedule.type = 'daily';
    if (!schedule.cron) schedule.cron = '0 9 * * *';
    schedule.human_readable = schedule.human_readable || 'Daily at 9:00 AM';
  } else if (/weekly/i.test(input)) {
    schedule.type = 'weekly';
    if (!schedule.cron) schedule.cron = '0 9 * * 1';
    schedule.human_readable = schedule.human_readable || 'Weekly on Monday at 9:00 AM';
  } else if (/monthly/i.test(input)) {
    schedule.type = 'monthly';
    schedule.cron = '0 9 1 * *';
    schedule.human_readable = 'Monthly on the 1st at 9:00 AM';
  }

  return schedule.type ? schedule : null;
}

/**
 * Convert parsed automation to database format
 */
function toAutomationRecord(parsed, name = null) {
  // Build condition string
  let conditionStr = '';
  if (parsed.conditions.length > 0) {
    conditionStr = parsed.conditions.map(c => {
      const op = c.operator === '=' ? '=' : c.operator === 'contains' ? ' CONTAINS ' : c.operator;
      return `${c.field}${op}${c.value}`;
    }).join(' AND ');
  }

  // Add trigger-specific conditions
  if (parsed.trigger.threshold) {
    if (parsed.trigger.category) {
      conditionStr = conditionStr 
        ? `${conditionStr} AND category=${parsed.trigger.category} AND monthly_total > ${parsed.trigger.threshold}`
        : `category=${parsed.trigger.category} AND monthly_total > ${parsed.trigger.threshold}`;
    } else {
      conditionStr = conditionStr 
        ? `${conditionStr} AND monthly_total > ${parsed.trigger.threshold}`
        : `monthly_total > ${parsed.trigger.threshold}`;
    }
  }

  return {
    name: name || generateAutomationName(parsed),
    description: parsed.raw_input,
    trigger_type: parsed.trigger.type,
    trigger_event: parsed.trigger.event,
    trigger_config: JSON.stringify({
      threshold: parsed.trigger.threshold,
      category: parsed.trigger.category,
      schedule: parsed.schedule
    }),
    condition_str: conditionStr || null,
    conditions: JSON.stringify(parsed.conditions),
    action_type: parsed.action.type,
    action_config: JSON.stringify({
      tag_value: parsed.action.tag_value
    }),
    schedule: parsed.schedule?.cron || null,
    schedule_human: parsed.schedule?.human_readable || null,
    confidence: parsed.confidence,
    raw_input: parsed.raw_input,
    enabled: true
  };
}

/**
 * Generate a friendly automation name
 */
function generateAutomationName(parsed) {
  const triggerNames = {
    expense_added: 'New Expense',
    expense_threshold: parsed.trigger.category 
      ? `${parsed.trigger.category} Budget Alert` 
      : 'Budget Alert',
    time_based: 'Scheduled Task',
    pattern_match: 'Pattern Match',
    daily_summary: 'Daily Summary'
  };

  const actionNames = {
    notify: 'Notification',
    email: 'Email',
    tag: 'Auto-Tag',
    flag: 'Flag',
    summary: 'Summary',
    log: 'Log'
  };

  const trigger = triggerNames[parsed.trigger.type] || 'Automation';
  const action = actionNames[parsed.action.type] || '';

  return action ? `${trigger} → ${action}` : trigger;
}

// ============================================
// AUTOMATION RUNNER
// ============================================

/**
 * Check if an expense matches automation conditions
 */
function checkConditions(expense, conditions, triggerConfig) {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  for (const condition of conditions) {
    const value = expense[condition.field];
    
    switch (condition.operator) {
      case '=':
        if (String(value).toLowerCase() !== String(condition.value).toLowerCase()) {
          return false;
        }
        break;
      case '>':
        if (parseFloat(value) <= condition.value) {
          return false;
        }
        break;
      case '<':
        if (parseFloat(value) >= condition.value) {
          return false;
        }
        break;
      case 'contains':
        if (!String(value).toLowerCase().includes(String(condition.value).toLowerCase())) {
          return false;
        }
        break;
    }
  }

  return true;
}

/**
 * Execute automation action
 */
async function executeAction(automation, context, pool) {
  const actionType = automation.action_type;
  const actionConfig = JSON.parse(automation.action_config || '{}');
  
  const result = {
    automation_id: automation.id,
    automation_name: automation.name,
    action: actionType,
    executed_at: new Date().toISOString(),
    success: true,
    message: null
  };

  try {
    switch (actionType) {
      case 'notify':
        result.message = `🔔 Automation triggered: ${automation.name}`;
        if (context.expense) {
          result.message += `\n💰 Expense: $${context.expense.amount} at ${context.expense.vendor || 'Unknown'}`;
        }
        // In production, this would send a real notification
        console.log(`[Automation] NOTIFY: ${result.message}`);
        break;

      case 'tag':
        if (context.expense_id && actionConfig.tag_value && pool) {
          // This would add a tag to the expense in production
          console.log(`[Automation] TAG: Adding '${actionConfig.tag_value}' to expense ${context.expense_id}`);
          result.message = `Tagged expense with '${actionConfig.tag_value}'`;
        }
        break;

      case 'flag':
        if (context.expense_id && pool) {
          console.log(`[Automation] FLAG: Flagging expense ${context.expense_id} for review`);
          result.message = `Flagged expense for review`;
        }
        break;

      case 'summary':
        result.message = 'Summary generation triggered';
        console.log(`[Automation] SUMMARY: Would generate spending summary`);
        break;

      case 'email':
        result.message = 'Email queued';
        console.log(`[Automation] EMAIL: Would send email notification`);
        break;

      case 'log':
        console.log(`[Automation] LOG: ${JSON.stringify(context)}`);
        result.message = 'Event logged';
        break;

      default:
        result.message = `Unknown action type: ${actionType}`;
        result.success = false;
    }
  } catch (err) {
    result.success = false;
    result.error = err.message;
  }

  return result;
}

/**
 * Run automation check against an expense
 */
async function runAutomationCheck(pool, expense, monthlyTotals = {}) {
  const results = [];

  try {
    // Get all enabled automations
    const automations = await pool.query(
      `SELECT * FROM lumen_automations WHERE enabled = TRUE AND trigger_event = 'expense_added'`
    );

    for (const automation of automations.rows) {
      const conditions = JSON.parse(automation.conditions || '[]');
      const triggerConfig = JSON.parse(automation.trigger_config || '{}');

      // Check threshold-based conditions
      if (triggerConfig.threshold && triggerConfig.category) {
        const categoryTotal = monthlyTotals[triggerConfig.category] || 0;
        if (categoryTotal <= triggerConfig.threshold) {
          continue; // Threshold not met
        }
      }

      // Check regular conditions
      if (checkConditions(expense, conditions, triggerConfig)) {
        const result = await executeAction(automation, { 
          expense, 
          expense_id: expense.id,
          monthly_totals: monthlyTotals 
        }, pool);
        results.push(result);

        // Update last run timestamp
        await pool.query(
          `UPDATE lumen_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = $1`,
          [automation.id]
        );
      }
    }
  } catch (err) {
    console.error('[Automation] Error running checks:', err);
  }

  return results;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  parseNaturalLanguage,
  toAutomationRecord,
  generateAutomationName,
  checkConditions,
  executeAction,
  runAutomationCheck,
  TRIGGER_PATTERNS,
  CONDITION_PATTERNS,
  ACTION_PATTERNS
};
