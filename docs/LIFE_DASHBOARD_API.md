# 🌟 Life Dashboard API Documentation

## Overview

The Life Dashboard API provides unified analytics across ALL user data in Lumen Dashboard. It gives you the 30,000 foot view of your life by cross-referencing expenses, briefings, jobs, ideas, resources, and pitches.

**Base URL:** `/api/analytics/life-dashboard`

## Endpoints

### 1. Full Life Dashboard

**GET** `/api/analytics/life-dashboard`

Returns comprehensive life analytics across all data types.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 90 | Time window in days to analyze |
| `correlations` | boolean | true | Include correlation analysis |
| `insights` | boolean | true | Include AI-generated insights |

#### Example Request

```bash
curl "http://localhost:3000/api/analytics/life-dashboard?days=30"
```

#### Example Response

```json
{
  "success": true,
  "generatedAt": "2024-01-29T10:30:00.000Z",
  "timeWindow": {
    "days": 30,
    "start": "2023-12-30T10:30:00.000Z",
    "end": "2024-01-29T10:30:00.000Z"
  },
  "summary": {
    "totalExpenses": 145,
    "totalBriefings": 89,
    "totalJobs": 23,
    "totalIdeas": 12,
    "totalResources": 34,
    "totalPitches": 5,
    "dataPoints": 303
  },
  "expenses": {
    "total": 145,
    "totalAmount": 2847.50,
    "avgAmount": 19.64,
    "maxAmount": 156.99,
    "minAmount": 2.50,
    "byCategory": [
      { "category": "Food", "count": 67, "total": 892.50, "average": 13.32, "percentage": 31 },
      { "category": "Transport", "count": 23, "total": 456.00, "average": 19.83, "percentage": 16 }
    ],
    "daily": [
      { "date": "2024-01-28", "total": 45.67, "count": 3 }
    ],
    "weekly": [
      { "week": "2024-01-22", "total": 312.50, "count": 15 }
    ],
    "monthly": [
      { "month": "2024-01", "total": 2847.50, "count": 145 }
    ],
    "byMealType": [
      { "mealType": "lunch", "count": 23, "total": 287.50 }
    ],
    "topVendors": [
      { "vendor": "Chipotle", "visits": 8, "totalSpent": 112.00, "avgSpent": 14.00 }
    ],
    "byDayOfWeek": [
      { "dayOfWeek": 1, "dayName": "Monday", "count": 22, "total": 389.50, "average": 17.70 }
    ]
  },
  "briefings": {
    "total": 89,
    "read": 72,
    "unread": 17,
    "starred": 12,
    "archived": 5,
    "readRate": 81,
    "avgReadTimeHours": 2.3,
    "byType": [
      { "type": "news", "count": 45, "readCount": 38, "readRate": 84 }
    ],
    "daily": [
      { "date": "2024-01-28", "created": 5, "read": 3 }
    ],
    "topTags": [
      { "tag": "tech", "count": 23 }
    ]
  },
  "jobs": {
    "total": 23,
    "byStatus": {
      "new": 8,
      "applied": 12,
      "interviewing": 2,
      "offered": 1,
      "rejected": 0
    },
    "starred": 5,
    "avgSalaryRange": { "min": 120000, "max": 180000 },
    "conversionRates": {
      "applyRate": 65,
      "interviewRate": 17,
      "offerRate": 50
    },
    "topCompanies": [
      { "company": "Anthropic", "total": 3, "applied": 2 }
    ],
    "applicationTimeline": [
      { "date": "2024-01-25", "applications": 2 }
    ]
  },
  "ideas": {
    "total": 12,
    "byStatus": {
      "idea": 6,
      "exploring": 3,
      "building": 2,
      "launched": 1,
      "paused": 0
    },
    "avgPriority": 6.5,
    "executionRate": 25,
    "byCategory": [
      { "category": "SaaS", "count": 5 }
    ],
    "activeIdeas": [
      {
        "name": "AI Writing Assistant",
        "category": "SaaS",
        "status": "building",
        "revenuePotential": "high",
        "priority": 9
      }
    ]
  },
  "resources": {
    "total": 34,
    "starred": 8,
    "archived": 2,
    "byType": [
      { "type": "link", "count": 28 }
    ],
    "byCategory": [
      { "category": "AI Tools", "count": 12 }
    ]
  },
  "pitches": {
    "total": 5,
    "byVerdict": {
      "approved": 2,
      "rejected": 1,
      "maybe": 1,
      "pending": 1
    },
    "starred": 2,
    "approvalRate": 40
  },
  "correlations": [
    {
      "id": "spending_vs_ideas",
      "type": "spending_vs_productivity",
      "title": "Spending & Idea Generation",
      "description": "Days with new ideas have lower spending (avg $18 vs $45)",
      "strength": "strong",
      "insight": "Less spending seems to correlate with more creative thinking",
      "data": {
        "avgSpendingIdeaDays": 18.50,
        "avgSpendingNoIdeaDays": 45.20,
        "ideaDayCount": 8,
        "noIdeaDayCount": 22
      }
    },
    {
      "id": "productive_day",
      "type": "productive_days",
      "title": "Most Productive Day",
      "description": "Tuesday is your most productive day",
      "strength": "moderate",
      "insight": "You tend to generate more ideas on Tuesdays"
    }
  ],
  "insights": [
    {
      "id": "spending_trend",
      "category": "finance",
      "title": "📉 Spending Down",
      "description": "Your spending is down 15% from last month ($2847 vs $3350)",
      "priority": "medium",
      "actionable": "Great job managing expenses!"
    },
    {
      "id": "reading_backlog",
      "category": "productivity",
      "title": "📚 Reading Backlog",
      "description": "You have 17 unread briefings waiting",
      "priority": "medium",
      "actionable": "Set aside 30 minutes to catch up on important briefings"
    }
  ],
  "lifeScores": {
    "financial": {
      "score": 78,
      "label": "Good",
      "factors": [
        { "name": "Diversified spending", "impact": "+10" },
        { "name": "Regular expense tracking", "impact": "+10" }
      ]
    },
    "knowledge": {
      "score": 82,
      "label": "Excellent",
      "factors": [
        { "name": "High read rate", "impact": "+20" }
      ]
    },
    "career": {
      "score": 75,
      "label": "Good",
      "factors": [
        { "name": "Active applications", "impact": "+15" },
        { "name": "Good interview rate", "impact": "+15" }
      ]
    },
    "creative": {
      "score": 85,
      "label": "Excellent",
      "factors": [
        { "name": "High execution rate", "impact": "+20" },
        { "name": "Building projects", "impact": "+10" }
      ]
    },
    "overall": 80
  },
  "streaks": {
    "currentActivityStreak": 5,
    "longestActivityStreak": 14,
    "lastActiveDate": "2024-01-28"
  },
  "processingTimeMs": 156
}
```

---

### 2. Quick Dashboard (Lightweight)

**GET** `/api/analytics/life-dashboard/quick`

Returns only key metrics for dashboard widgets.

#### Example Request

```bash
curl "http://localhost:3000/api/analytics/life-dashboard/quick"
```

#### Example Response

```json
{
  "success": true,
  "summary": {
    "totalExpenses": 145,
    "totalBriefings": 89,
    "totalJobs": 23,
    "totalIdeas": 12,
    "totalResources": 34,
    "dataPoints": 303
  },
  "lifeScores": {
    "financial": { "score": 78, "label": "Good" },
    "knowledge": { "score": 82, "label": "Excellent" },
    "career": { "score": 75, "label": "Good" },
    "creative": { "score": 85, "label": "Excellent" },
    "overall": 80
  },
  "topInsights": [
    {
      "id": "spending_trend",
      "title": "📉 Spending Down",
      "description": "Your spending is down 15% from last month",
      "priority": "medium"
    }
  ],
  "streaks": {
    "currentActivityStreak": 5,
    "longestActivityStreak": 14
  },
  "quickStats": {
    "monthlySpending": 2847.50,
    "unreadBriefings": 17,
    "activeJobs": 14,
    "ideasInProgress": 5
  },
  "generatedAt": "2024-01-29T10:30:00.000Z"
}
```

---

### 3. Life Scores Only

**GET** `/api/analytics/life-dashboard/scores`

Returns only life scores for status indicators.

#### Example Response

```json
{
  "success": true,
  "scores": {
    "financial": { "score": 78, "label": "Good", "factors": [...] },
    "knowledge": { "score": 82, "label": "Excellent", "factors": [...] },
    "career": { "score": 75, "label": "Good", "factors": [...] },
    "creative": { "score": 85, "label": "Excellent", "factors": [...] },
    "overall": 80
  },
  "generatedAt": "2024-01-29T10:30:00.000Z"
}
```

---

### 4. Correlations Analysis

**GET** `/api/analytics/life-dashboard/correlations`

Returns correlation analysis between different data types.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 90 | Time window for analysis |

#### Example Response

```json
{
  "success": true,
  "correlations": [
    {
      "id": "spending_vs_ideas",
      "type": "spending_vs_productivity",
      "title": "Spending & Idea Generation",
      "description": "Days with new ideas have lower spending",
      "strength": "strong",
      "insight": "Less spending correlates with creative thinking"
    }
  ],
  "dailyActivity": [...],
  "patterns": {
    "PRODUCTIVE_DAYS": { "id": "productive_days", "name": "Productive Days" },
    "SPENDING_VS_PRODUCTIVITY": { "id": "spending_vs_productivity", "name": "Spending vs Productivity" }
  },
  "generatedAt": "2024-01-29T10:30:00.000Z"
}
```

---

### 5. Activity Timeline

**GET** `/api/analytics/life-dashboard/timeline`

Returns daily activity timeline for charting.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 30 | Number of days to include |

#### Example Response

```json
{
  "success": true,
  "timeline": [
    {
      "date": "2024-01-28",
      "expenses": 3,
      "expenseTotal": 45.67,
      "briefings": 5,
      "ideas": 1,
      "jobs": 2,
      "resources": 0,
      "totalActivity": 11
    }
  ],
  "summary": {
    "totalDays": 30,
    "activeDays": 28,
    "avgDailyActivity": 8.5
  },
  "generatedAt": "2024-01-29T10:30:00.000Z"
}
```

---

## Data Sources

The Life Dashboard aggregates data from these tables:

| Table | Description |
|-------|-------------|
| `lumen_expenses` | Expense tracking with categories, vendors, amounts |
| `lumen_briefings` | News, research, meeting notes with read/starred status |
| `lumen_jobs` | Job listings with application status tracking |
| `lumen_ideas` | Business ideas with status and priority |
| `lumen_resources` | Saved links and resources |
| `lumen_pitches` | Shark Tank style idea pitches |

---

## Life Scores

The dashboard calculates scores for different life areas:

### Financial Score
- Based on spending diversity and tracking consistency
- Range: 0-100

### Knowledge Score
- Based on briefing consumption and read rates
- Range: 0-100

### Career Score
- Based on job application activity and conversion rates
- Range: 0-100

### Creative Score
- Based on idea generation and execution rates
- Range: 0-100

### Overall Score
Weighted average:
- Financial: 25%
- Knowledge: 20%
- Career: 30%
- Creative: 25%

---

## Correlation Patterns

The system looks for these correlation patterns:

| Pattern | Description |
|---------|-------------|
| `productive_days` | Days with high activity across multiple areas |
| `spending_vs_productivity` | Relationship between spending and creative output |
| `food_spending_ideas` | Connection between food spending and ideation |
| `job_momentum` | Application activity patterns |
| `knowledge_intake` | Reading activity over time |

---

## Insights

Automatically generated insights include:

- **Spending trends** - Month-over-month changes
- **Reading backlog** - Unread briefing alerts
- **Job momentum** - Application activity warnings
- **Ideas in motion** - Active project tracking
- **Execution gaps** - Idea-to-action ratio alerts
- **Pattern-based insights** - From correlation analysis

Priority levels: `high`, `medium`, `low`

---

## Usage Examples

### Dashboard Widget
```javascript
// Get quick stats for a widget
const response = await fetch('/api/analytics/life-dashboard/quick');
const data = await response.json();

console.log(`Overall Life Score: ${data.lifeScores.overall}`);
console.log(`Current Streak: ${data.streaks.currentActivityStreak} days`);
```

### Activity Chart
```javascript
// Get timeline data for a chart
const response = await fetch('/api/analytics/life-dashboard/timeline?days=30');
const data = await response.json();

// data.timeline contains daily activity points
const chartData = data.timeline.map(d => ({
  x: d.date,
  y: d.totalActivity
}));
```

### Full Analysis
```javascript
// Get complete dashboard
const response = await fetch('/api/analytics/life-dashboard?days=90');
const data = await response.json();

// Display top insights
data.insights.forEach(insight => {
  console.log(`${insight.title}: ${insight.description}`);
  console.log(`Action: ${insight.actionable}`);
});
```

---

## Performance Notes

- Full dashboard: ~100-300ms depending on data volume
- Quick dashboard: ~50-150ms
- Timeline/scores: ~30-100ms

All endpoints use connection pooling and parallel queries for optimal performance.
