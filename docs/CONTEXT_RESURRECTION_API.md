# 🕰️ Context Resurrection API

**Time Travel for Decisions** - Recreate the full context of any past moment in your data.

## Overview

Ever wondered "What was I thinking when I made that decision?" The Context Resurrection API answers that question by pulling together everything in your data from around a specific date:

- **Briefings** you were reading
- **Expenses** you were making
- **Jobs** you were tracking
- **Ideas** you were exploring
- **Resources** you were saving
- **Pitches** you were evaluating

It generates a comprehensive "context snapshot" with relevance scoring and narrative insights.

## Quick Start

```bash
# Resurrect context for a specific date
curl -X POST http://localhost:3000/api/context/resurrect \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-01-15",
    "event_description": "When I decided to switch jobs",
    "keywords": ["startup", "offer"]
  }'
```

## Endpoints

### `GET /api/context/status`

Check service status and available date range.

**Response:**
```json
{
  "service": "Context Resurrection Engine",
  "version": "1.0.0",
  "status": "operational",
  "description": "Time travel through your data...",
  "date_range": {
    "earliest": "2023-06-15T00:00:00.000Z",
    "latest": "2024-01-28T00:00:00.000Z",
    "has_data": true
  },
  "categories": [
    { "key": "briefings", "name": "Briefings & Reports", "icon": "📋" },
    { "key": "expenses", "name": "Spending Activity", "icon": "💰" },
    { "key": "jobs", "name": "Career Tracking", "icon": "💼" },
    { "key": "ideas", "name": "Ideas & Projects", "icon": "💡" },
    { "key": "resources", "name": "Saved Resources", "icon": "🔗" },
    { "key": "pitches", "name": "Shark Tank Pitches", "icon": "🦈" }
  ],
  "endpoints": { ... }
}
```

---

### `POST /api/context/resurrect`

**The main endpoint.** Resurrect full context around a date or event.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | ✅ Yes | Target date (ISO format: `YYYY-MM-DD` or full timestamp) |
| `event_description` | string | No | What happened? Helps extract keywords for relevance scoring |
| `keywords` | string[] | No | Specific keywords to boost relevance |
| `window_days` | number | No | Days before/after to search (default: 7, max: 90) |
| `categories` | string[] | No | Specific categories to search (default: all) |

**Example Request:**
```json
{
  "date": "2024-01-15",
  "event_description": "When I decided to accept the startup offer",
  "keywords": ["startup", "equity", "remote"],
  "window_days": 14,
  "categories": ["briefings", "expenses", "jobs", "ideas"]
}
```

**Response:**
```json
{
  "target_date": "2024-01-15T00:00:00.000Z",
  "window": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-01-29T00:00:00.000Z",
    "days": 14
  },
  "event_description": "When I decided to accept the startup offer",
  "keywords": ["startup", "equity", "remote", "decided", "accept", "offer"],
  "categories": {
    "briefings": {
      "name": "Briefings & Reports",
      "icon": "📋",
      "description": "What you were being informed about",
      "items": [
        {
          "id": 42,
          "type": "tech-news",
          "title": "AI Startup Funding Trends Q1 2024",
          "content": "...",
          "relevance_score": 0.92
        }
      ],
      "count": 12,
      "high_relevance_count": 3
    },
    "expenses": {
      "name": "Spending Activity",
      "icon": "💰",
      "items": [
        {
          "id": 156,
          "amount": "45.00",
          "vendor": "Uber",
          "category": "Transport",
          "description": "Interview trip downtown",
          "relevance_score": 0.88
        }
      ],
      "count": 23,
      "high_relevance_count": 5
    },
    "jobs": { ... },
    "ideas": { ... }
  },
  "snapshot": "# Context Snapshot: Monday, January 15, 2024\n\n> **Event/Decision:** When I decided to accept the startup offer\n\n## Overview\nFound **47 items** in your data around this date (11 highly relevant).\n\n## 📋 Briefings & Reports (12)\n...",
  "meta": {
    "total_items": 47,
    "high_relevance_items": 11,
    "generated_at": "2024-01-28T22:45:00.000Z"
  }
}
```

---

### `GET /api/context/timeline`

Get activity density timeline for visualization.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `start_date` | string | Start of range (optional) |
| `end_date` | string | End of range (optional) |
| `granularity` | string | `day`, `week`, or `month` (default: `day`) |

**Example:**
```
GET /api/context/timeline?granularity=week&start_date=2024-01-01
```

**Response:**
```json
{
  "granularity": "week",
  "start_date": "2024-01-01",
  "end_date": "present",
  "periods": 4,
  "timeline": [
    {
      "period": "2024-01",
      "total": 15,
      "briefings": 5,
      "expenses": 8,
      "jobs": 2
    },
    {
      "period": "2024-02",
      "total": 23,
      "briefings": 8,
      "expenses": 12,
      "jobs": 1,
      "ideas": 2
    }
  ]
}
```

---

### `POST /api/context/compare`

Compare context between two dates (before/after analysis).

**Request Body:**
```json
{
  "date1": "2023-12-01",
  "date2": "2024-01-15",
  "window_days": 7
}
```

**Response:**
```json
{
  "comparison": {
    "date1": "2023-12-01T00:00:00.000Z",
    "date2": "2024-01-15T00:00:00.000Z",
    "window_days": 7,
    "changes": {
      "total_items": 12,
      "high_relevance": 5
    },
    "by_category": {
      "briefings": { "before": 8, "after": 15, "change": 7 },
      "expenses": { "before": 20, "after": 23, "change": 3 },
      "jobs": { "before": 5, "after": 2, "change": -3 },
      "ideas": { "before": 1, "after": 4, "change": 3 }
    }
  },
  "before": { /* full context for date1 */ },
  "after": { /* full context for date2 */ }
}
```

## Use Cases

### 1. Decision Archaeology
*"Why did I decide to change jobs in January?"*

```json
{
  "date": "2024-01-10",
  "event_description": "Job change decision",
  "keywords": ["career", "salary", "opportunity"]
}
```

### 2. Spending Investigation
*"What was going on when my expenses spiked in December?"*

```json
{
  "date": "2023-12-15",
  "event_description": "Expense spike",
  "categories": ["expenses", "briefings"]
}
```

### 3. Project Context
*"What ideas and resources led to starting Project X?"*

```json
{
  "date": "2023-11-01",
  "event_description": "Started Project X",
  "keywords": ["AI", "automation", "project"],
  "categories": ["ideas", "resources", "pitches"]
}
```

### 4. Before/After Analysis
*"How did my activity change after the promotion?"*

```json
POST /api/context/compare
{
  "date1": "2023-10-01",
  "date2": "2023-11-15",
  "window_days": 14
}
```

## Relevance Scoring

Items are scored based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Exact date match | 1.0 | Item is from the target date |
| Same day | 0.95 | Within 24 hours |
| Within 3 days | 0.80 | Close temporal proximity |
| Within 7 days | 0.60 | Within the week |
| Keyword match | +0.30 | Matches search keywords |
| Description match | +0.20 | Matches event description |

Items with `relevance_score >= 0.7` are considered "highly relevant."

## The Snapshot

The `snapshot` field contains a pre-formatted Markdown narrative that:

1. **Summarizes** what was found
2. **Highlights** top items by category
3. **Generates insights** like:
   - Spending spikes detected
   - Active job searching
   - Ideation phases
   - Research focus areas
   - Possible interview prep

This is ready to display or send to an LLM for further analysis.

## Error Responses

**400 Bad Request:**
```json
{
  "error": "Missing required field: date",
  "hint": "Provide a date in ISO format (YYYY-MM-DD)",
  "examples": ["2024-01-15", "2024-01-15T14:30:00Z"]
}
```

**500 Internal Error:**
```json
{
  "error": "Failed to resurrect context",
  "details": "Database connection error"
}
```

---

## Integration Ideas

1. **Chat Interface**: "What was I working on last Tuesday?"
2. **Decision Journal**: Auto-attach context to journal entries
3. **Retrospectives**: Generate weekly/monthly context summaries
4. **Memory Augmentation**: Feed context to AI for personalized assistance

---

*Built by Jimmy & Lumen AI Solutions*
*"Time travel for your data"*
