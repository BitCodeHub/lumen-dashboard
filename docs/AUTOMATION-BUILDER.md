# 🤖 Automation Builder - Natural Language Workflows

**"Invisible Automation"** - Create powerful automations from plain English.

## Overview

The Automation Builder lets you create expense tracking automations by describing what you want in natural language. No coding required.

## Quick Start

```bash
# Create an automation
curl -X POST http://localhost:3000/api/automations \
  -H "Content-Type: application/json" \
  -d '{"description": "When Food spending exceeds $500, alert me"}'

# List all automations  
curl http://localhost:3000/api/automations

# Manually trigger an automation
curl -X POST http://localhost:3000/api/automations/1/run

# Delete an automation
curl -X DELETE http://localhost:3000/api/automations/1
```

## API Reference

### `POST /api/automations`

Create a new automation from natural language.

**Request:**
```json
{
  "description": "When Food spending exceeds $500, alert me",
  "name": "Food Budget Alert (optional)",
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "automation": {
    "id": 1,
    "name": "Food Budget Alert → Notification",
    "description": "When Food spending exceeds $500, alert me",
    "trigger_type": "expense_threshold",
    "trigger_event": "expense_threshold",
    "action_type": "notify",
    "confidence": 0.88,
    "enabled": true,
    "parsed": {
      "trigger": { "type": "expense_threshold", "threshold": 500, "category": "Food" },
      "conditions": [{ "field": "category", "operator": "=", "value": "Food" }],
      "action": { "type": "notify", "action": "notify" }
    }
  },
  "confidence": 0.88,
  "confidence_explanation": "High confidence - automation will work as expected"
}
```

### `GET /api/automations`

List all automations.

**Query Parameters:**
- `enabled` - Filter by enabled status (true/false)
- `trigger_type` - Filter by trigger type
- `limit` - Max results (default: 50)

**Response:**
```json
{
  "automations": [...],
  "count": 5,
  "trigger_types": ["expense_added", "expense_threshold", "time_based", "pattern_match", "daily_summary"],
  "action_types": ["notify", "email", "tag", "flag", "summary", "log"]
}
```

### `GET /api/automations/:id`

Get a single automation with run history.

### `PATCH /api/automations/:id`

Update an automation.

**Request:**
```json
{
  "name": "New Name",
  "enabled": false,
  "description": "New description to re-parse"
}
```

### `POST /api/automations/:id/run`

Manually trigger an automation.

**Request:**
```json
{
  "test_data": {
    "amount": 150,
    "category": "Food",
    "vendor": "Chipotle"
  },
  "dry_run": false
}
```

### `POST /api/automations/:id/toggle`

Toggle automation enabled/disabled.

### `DELETE /api/automations/:id`

Delete an automation.

### `POST /api/automations/parse`

Preview parsing without creating automation.

**Request:**
```json
{
  "description": "When I spend over $50, tag it"
}
```

**Response:**
```json
{
  "input": "When I spend over $50, tag it",
  "parsed": { ... },
  "would_create": { ... },
  "confidence": 0.76,
  "ready_to_create": true
}
```

### `GET /api/automations/runs`

Get automation run history.

**Query Parameters:**
- `limit` - Max results (default: 50)
- `automation_id` - Filter by automation

### `GET /api/automations/examples`

Get example automations for inspiration.

---

## Natural Language Syntax

### Triggers (When/If)

| Trigger | Example Phrases |
|---------|-----------------|
| `expense_added` | "When I add an expense...", "On new expense..." |
| `expense_threshold` | "When Food spending exceeds $500...", "If total exceeds..." |
| `time_based` | "Every Monday at 9am...", "Daily at 6pm..." |
| `pattern_match` | "When I spend at Costco...", "If vendor contains..." |
| `daily_summary` | "Daily spending summary...", "End of day report..." |

### Conditions

| Condition | Example |
|-----------|---------|
| Category | "Food", "Transport", "Shopping", "Entertainment" |
| Amount > | "over $100", "more than $50", "exceeds $200" |
| Amount < | "under $50", "less than $100" |
| Vendor | "at Costco", "from Starbucks" |
| Time period | "per day", "this week", "monthly" |

### Actions

| Action | Example Phrases |
|--------|-----------------|
| `notify` | "alert me", "notify me", "send notification" |
| `email` | "email me", "send email" |
| `tag` | "tag it", "add tag", "categorize as review" |
| `flag` | "flag for review", "mark as important" |
| `summary` | "send summary", "generate report" |
| `log` | "log it", "record it" |

---

## Example Automations

### 1. Budget Alerts
```
"When Food spending exceeds $500, alert me"
"If Entertainment goes over $200 this month, notify me"
"When Gas exceeds $300, send notification"
```

### 2. Large Expense Tracking
```
"When I add an expense over $200, tag it for review"
"If I spend more than $100 at restaurants, flag it"
"Any expense over $500 should notify me immediately"
```

### 3. Scheduled Reports
```
"Every Monday at 9am, send me a spending summary"
"Daily at 6pm, summarize my expenses"
"Weekly spending report on Friday"
```

### 4. Vendor-Based Rules
```
"When I spend at Costco, categorize as Groceries"
"If vendor is Starbucks, tag as coffee"
"Track all Amazon purchases"
```

---

## Database Schema

### `lumen_automations`
```sql
CREATE TABLE lumen_automations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(100) NOT NULL,
  trigger_event VARCHAR(100) NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  condition_str TEXT,
  conditions JSONB DEFAULT '[]',
  action_type VARCHAR(100) NOT NULL,
  action_config JSONB DEFAULT '{}',
  schedule VARCHAR(100),           -- Cron expression
  schedule_human VARCHAR(255),     -- Human readable
  confidence DECIMAL(3,2) DEFAULT 0,
  raw_input TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMP,
  last_run_result JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

### `lumen_automation_runs`
```sql
CREATE TABLE lumen_automation_runs (
  id SERIAL PRIMARY KEY,
  automation_id INTEGER REFERENCES lumen_automations(id),
  trigger_data JSONB,
  result JSONB,
  success BOOLEAN,
  error TEXT,
  executed_at TIMESTAMP DEFAULT NOW()
);
```

---

## Integration with Expenses

When a new expense is added through `/api/expenses`, you can trigger automation checks:

```javascript
const automationBuilder = require('./automation-builder');

// After adding expense:
const expense = { id: 123, amount: 150, category: 'Food', vendor: 'Chipotle' };
const monthlyTotals = { 'Food': 550, 'Transport': 120 };

const results = await automationBuilder.runAutomationCheck(pool, expense, monthlyTotals);
// Returns array of triggered automation results
```

---

## Confidence Scores

The parser returns a confidence score (0-1) indicating how well it understood the input:

| Score | Meaning |
|-------|---------|
| 0.7-1.0 | **High** - Trigger, conditions, and action clearly identified |
| 0.5-0.7 | **Medium** - Most parts identified, may need verification |
| 0.0-0.5 | **Low** - Parser struggled, review the automation carefully |

---

## Module API (automation-builder.js)

```javascript
const ab = require('./automation-builder');

// Parse natural language
const parsed = ab.parseNaturalLanguage("When Food exceeds $500, alert me");

// Convert to database record
const record = ab.toAutomationRecord(parsed, "My Budget Alert");

// Check conditions against expense
const matches = ab.checkConditions(expense, parsed.conditions, triggerConfig);

// Execute action
const result = await ab.executeAction(automation, context, pool);

// Run automation check on new expense
const results = await ab.runAutomationCheck(pool, expense, monthlyTotals);
```

---

## Tips for Best Results

1. **Be specific** - "When Food spending exceeds $500" is better than "when I spend too much"
2. **Use dollar amounts** - Include $ for monetary values
3. **Mention categories** - Food, Transport, Shopping, Entertainment, Bills, Health, Gas, Groceries
4. **Clear actions** - "alert me", "notify me", "tag for review"
5. **Check confidence** - If confidence < 0.5, rephrase your automation

---

Built with ❤️ by Jimmy & Lumen AI Solutions
