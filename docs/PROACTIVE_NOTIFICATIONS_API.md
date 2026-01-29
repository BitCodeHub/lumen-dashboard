# 🔔 Proactive Notifications API

**"Proactive Jimmy"** - AI that alerts BEFORE you ask.

## Overview

The Proactive Notifications system monitors your data and sends intelligent alerts based on configurable rules. It supports multiple rule types:

| Rule Type | Description | Example |
|-----------|-------------|---------|
| `spending_threshold` | Alert if category spending > amount | "Alert if Food > $200/week" |
| `time_based` | Remind after X days | "Follow up on jobs after 5 days" |
| `pattern_match` | Alert if new item matches criteria | "Alert for new AI jobs in SF" |
| `anomaly_detect` | Alert on unusual patterns | "Alert if spending is 2x normal" |
| `milestone` | Celebrate achievements | "Celebrate 10 jobs applied!" |

---

## Endpoints

### Notifications

#### `GET /api/notifications`
Get all notifications with optional filters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by: `pending`, `sent`, `read`, `dismissed` |
| `unread` | boolean | Only show unread notifications |
| `limit` | number | Max results (default: 50) |

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": 1,
      "rule_id": 3,
      "rule_name": "Weekly Food Budget",
      "rule_type": "spending_threshold",
      "title": "💰 Food Spending Alert",
      "message": "You've spent $245.00 on Food this week...",
      "severity": "medium",
      "data": { "totalSpent": 245, "threshold": 200, "overage": 45 },
      "read": false,
      "created_at": "2025-01-29T10:00:00Z"
    }
  ],
  "count": 1,
  "unread_count": 1
}
```

#### `POST /api/notifications/:id/read`
Mark a notification as read.

#### `POST /api/notifications/:id/dismiss`
Dismiss a notification.

---

### Rules

#### `GET /api/notifications/rules`
Get all notification rules.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Filter by enabled status |

**Response:**
```json
{
  "success": true,
  "rules": [...],
  "count": 5,
  "rule_types": ["spending_threshold", "time_based", "pattern_match", "anomaly_detect", "milestone"],
  "examples": [...]
}
```

#### `POST /api/notifications/rules`
Create a new notification rule.

**Request Body:**
```json
{
  "name": "Weekly Food Budget",
  "description": "Alert if Food spending exceeds $200/week",
  "rule_type": "spending_threshold",
  "config": {
    "category": "Food",
    "amount": 200,
    "period": "week"
  },
  "priority": 1,
  "cooldown_hours": 24,
  "enabled": true
}
```

#### `PUT /api/notifications/rules/:id`
Update an existing rule.

#### `DELETE /api/notifications/rules/:id`
Delete a rule.

---

### Rule Check

#### `POST /api/notifications/check`
**Run all notification rules now.** This is the "heartbeat" - call it periodically or on-demand.

**Response:**
```json
{
  "success": true,
  "checked": 5,
  "triggered": 2,
  "notifications": [
    {
      "id": 1,
      "rule_name": "Weekly Food Budget",
      "triggered": true,
      "severity": "medium",
      "title": "💰 Food Spending Alert",
      "message": "You've spent $245.00 on Food this week..."
    }
  ],
  "errors": [],
  "processingTime": "0.15s",
  "checkedAt": "2025-01-29T10:00:00Z"
}
```

---

### Utilities

#### `POST /api/notifications/seed-examples`
Seed the database with example rules to get started.

#### `GET /api/notifications/stats`
Get notification statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "rules": { "total": 5, "active": 4 },
    "notifications": { "total": 23, "unread": 3 },
    "last_24h": { "triggered": 5 }
  },
  "rule_types": ["spending_threshold", "time_based", "pattern_match", "anomaly_detect", "milestone"]
}
```

---

## Rule Configuration Examples

### 1. Spending Threshold
Alert when category spending exceeds a threshold.

```json
{
  "name": "Weekly Food Budget",
  "rule_type": "spending_threshold",
  "config": {
    "category": "Food",
    "amount": 200,
    "period": "week"  // day, week, month
  }
}
```

### 2. Time-Based Reminders
Remind about items after a certain time.

```json
{
  "name": "Job Follow-Up Reminder",
  "rule_type": "time_based",
  "config": {
    "table": "lumen_jobs",
    "condition_field": "applied_at",
    "days_before": 5
  }
}
```

```json
{
  "name": "Unread Briefings",
  "rule_type": "time_based",
  "config": {
    "table": "lumen_briefings",
    "type": "Tech News",
    "days_before": 3
  }
}
```

### 3. Pattern Matching
Alert when new items match criteria.

```json
{
  "name": "AI Jobs Alert",
  "rule_type": "pattern_match",
  "config": {
    "table": "lumen_jobs",
    "patterns": {
      "title": "AI",
      "location": "San Francisco",
      "min_salary": 150000
    },
    "since_hours": 24
  }
}
```

### 4. Anomaly Detection
Alert on unusual patterns.

```json
{
  "name": "Daily Spending Anomaly",
  "rule_type": "anomaly_detect",
  "config": {
    "metric": "daily_spending",
    "multiplier": 2.0,
    "lookback_days": 30
  }
}
```

```json
{
  "name": "Entertainment Spike",
  "rule_type": "anomaly_detect",
  "config": {
    "metric": "category_spike",
    "category": "Entertainment",
    "multiplier": 1.5,
    "lookback_days": 30
  }
}
```

### 5. Milestones
Celebrate achievements.

```json
{
  "name": "10 Jobs Milestone",
  "rule_type": "milestone",
  "config": {
    "metric": "jobs_applied",
    "threshold": 10,
    "direction": "above"
  }
}
```

```json
{
  "name": "50 Ideas Milestone",
  "rule_type": "milestone",
  "config": {
    "metric": "ideas_created",
    "threshold": 50
  }
}
```

---

## Integration Examples

### Run Check on Schedule (cron)
Add to your cron jobs or call from a scheduler:

```bash
# Check every hour
0 * * * * curl -X POST https://your-app.com/api/notifications/check
```

### JavaScript Client

```javascript
// Create a rule
const response = await fetch('/api/notifications/rules', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Gas Budget',
    rule_type: 'spending_threshold',
    config: { category: 'Gas', amount: 100, period: 'week' }
  })
});

// Run check
const check = await fetch('/api/notifications/check', { method: 'POST' });
const result = await check.json();

console.log(`Triggered ${result.triggered} notifications!`);

// Get unread notifications
const notifs = await fetch('/api/notifications?unread=true');
const { notifications } = await notifs.json();

notifications.forEach(n => {
  console.log(`${n.title}: ${n.message}`);
});
```

### Python Client

```python
import requests

BASE = "https://your-app.com/api"

# Create rule
requests.post(f"{BASE}/notifications/rules", json={
    "name": "High Spending Alert",
    "rule_type": "anomaly_detect",
    "config": {
        "metric": "daily_spending",
        "multiplier": 2.0,
        "lookback_days": 30
    }
})

# Run check
result = requests.post(f"{BASE}/notifications/check").json()
print(f"Triggered: {result['triggered']} notifications")

# Get notifications
notifs = requests.get(f"{BASE}/notifications?unread=true").json()
for n in notifs["notifications"]:
    print(f"[{n['severity']}] {n['title']}")
```

---

## Severity Levels

| Severity | When Used | Example |
|----------|-----------|---------|
| `low` | Minor alerts | "Unread briefings" |
| `medium` | Standard alerts | "Spending 20% over budget" |
| `high` | Urgent alerts | "Spending 50%+ over budget" |
| `celebration` | Milestones | "🎉 10 Jobs Applied!" |

---

## Cooldown System

Each rule has a `cooldown_hours` setting (default: 24) that prevents duplicate notifications. After a rule triggers, it won't trigger again until the cooldown expires.

```json
{
  "name": "Daily Anomaly Check",
  "cooldown_hours": 12,  // Can trigger twice per day
  ...
}
```

---

## Quick Start

1. **Seed example rules:**
   ```bash
   curl -X POST /api/notifications/seed-examples
   ```

2. **Run a check:**
   ```bash
   curl -X POST /api/notifications/check
   ```

3. **View notifications:**
   ```bash
   curl /api/notifications?unread=true
   ```

4. **Create your own rule:**
   ```bash
   curl -X POST /api/notifications/rules \
     -H "Content-Type: application/json" \
     -d '{"name":"My Rule","rule_type":"spending_threshold","config":{"category":"Food","amount":100,"period":"week"}}'
   ```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Proactive Jimmy                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐    ┌──────────────────────────────┐  │
│   │ Notification    │    │ Rule Evaluators               │  │
│   │ Rules Table     │───▶│ • spending_threshold          │  │
│   │ (configs)       │    │ • time_based                  │  │
│   └─────────────────┘    │ • pattern_match               │  │
│           │              │ • anomaly_detect              │  │
│           ▼              │ • milestone                   │  │
│   ┌─────────────────┐    └──────────────────────────────┘  │
│   │ POST /check     │                  │                   │
│   │ (heartbeat)     │                  │                   │
│   └─────────────────┘                  ▼                   │
│           │              ┌──────────────────────────────┐  │
│           │              │ Your Data                     │  │
│           │              │ • lumen_expenses              │  │
│           │              │ • lumen_jobs                  │  │
│           │              │ • lumen_briefings             │  │
│           │              │ • lumen_ideas                 │  │
│           │              └──────────────────────────────┘  │
│           ▼                                                │
│   ┌─────────────────┐                                      │
│   │ Notifications   │◀── Triggered alerts go here         │
│   │ Table           │                                      │
│   └─────────────────┘                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

*Proactive Jimmy - Making your app feel alive!* 🔔
