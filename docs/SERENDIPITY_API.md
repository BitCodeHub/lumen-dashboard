# 🎲 Serendipity Engine API

> *"That coffee shop expense 3 months ago? The founder of the company you're interviewing with has meetings there."*

The Serendipity Engine surfaces unexpected, valuable connections across all your data in Lumen Dashboard.

## Overview

The engine analyzes data from multiple domains:
- **Expenses** - Where you spend money
- **Briefings** - Intelligence reports and news
- **Jobs** - Career opportunities you're tracking
- **Ideas** - Business and project ideas
- **Resources** - Links, articles, learning materials

It finds connections humans would miss by:
1. Detecting shared keywords and themes
2. Finding entity overlaps (companies, people, locations)
3. Identifying temporal correlations
4. Running specialized pattern detectors
5. Generating actionable opportunities

---

## Endpoints

### POST `/api/serendipity/discover`

**The main discovery endpoint.** Analyzes all data and returns ranked connections.

#### Request Body

```json
{
  "limit": 10,
  "minScore": 0.5,
  "includeTypes": ["expenses", "briefings", "jobs", "ideas", "resources"],
  "timeWindowDays": 90
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Maximum discoveries to return |
| `minScore` | number | 0.5 | Minimum relevance score (0-1) |
| `includeTypes` | string[] | all | Data types to analyze |
| `timeWindowDays` | number | 90 | How far back to look |

#### Response

```json
{
  "success": true,
  "discoveries": [
    {
      "id": "opportunity-job-idea-5-12",
      "pattern": "Hidden Opportunity",
      "patternType": "opportunity",
      "score": 0.9,
      "insight": "🎯 OPPORTUNITY: Your job interest at \"Anthropic\" aligns with your idea \"AI Writing Assistant\". This job could fund or accelerate your startup!",
      "sources": [
        { "type": "jobs", "id": 5, "preview": "ML Engineer at Anthropic" },
        { "type": "ideas", "id": 12, "preview": "AI Writing Assistant" }
      ],
      "actionable": true,
      "suggestedAction": "Consider mentioning your AI interests in the interview.",
      "discoveredAt": "2025-01-28T12:00:00.000Z"
    },
    {
      "id": "semantic-expenses-15-briefings-8",
      "pattern": "Semantic Thread",
      "patternType": "semantic",
      "score": 0.75,
      "insight": "🔗 Shared keywords [ai, assistant, productivity] connect your expense and briefing. You're building a theme here.",
      "sources": [
        { "type": "expenses", "id": 15, "preview": "ChatGPT Plus" },
        { "type": "briefings", "id": 8, "preview": "AI Productivity Tools Report" }
      ],
      "keywords": ["ai", "assistant", "productivity"],
      "discoveredAt": "2025-01-28T12:00:00.000Z"
    }
  ],
  "stats": {
    "totalFound": 23,
    "returned": 10,
    "dataScanned": {
      "expenses": 45,
      "briefings": 12,
      "jobs": 8,
      "ideas": 15,
      "resources": 30
    },
    "patterns": {
      "opportunity": 5,
      "semantic": 8,
      "network": 6,
      "temporal": 4
    }
  },
  "generatedAt": "2025-01-28T12:00:00.000Z",
  "processingTime": "0.34s"
}
```

---

### GET `/api/serendipity/patterns`

Returns available connection patterns the engine looks for.

#### Response

```json
{
  "patterns": {
    "temporal": {
      "name": "Temporal Correlation",
      "description": "Events or activities clustered in time",
      "weight": 0.7
    },
    "location": {
      "name": "Location Link",
      "description": "Same location appearing across different data types",
      "weight": 0.85
    },
    "semantic": {
      "name": "Semantic Thread",
      "description": "Shared themes, keywords, or concepts",
      "weight": 0.8
    },
    "financial": {
      "name": "Financial Signal",
      "description": "Spending patterns that indicate interest or preparation",
      "weight": 0.75
    },
    "network": {
      "name": "Network Connection",
      "description": "People or organizations appearing across different contexts",
      "weight": 0.9
    },
    "opportunity": {
      "name": "Hidden Opportunity",
      "description": "Actionable insights from connecting disparate data",
      "weight": 0.95
    }
  },
  "seedConnections": [
    {
      "id": "job-expense-location",
      "name": "Interview Prep Indicator",
      "sources": ["jobs", "expenses"]
    },
    {
      "id": "idea-resource-skill",
      "name": "Skill Gap Discovery",
      "sources": ["ideas", "resources"]
    }
  ]
}
```

---

### POST `/api/serendipity/analyze`

Analyzes a specific item to find all its connections.

#### Request Body

```json
{
  "type": "jobs",
  "id": 5
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | One of: `expenses`, `briefings`, `jobs`, `ideas`, `resources` |
| `id` | number | Yes | The item's ID |

#### Response

```json
{
  "success": true,
  "item": { "type": "jobs", "id": 5 },
  "connections": [
    {
      "id": "opportunity-job-idea-5-12",
      "pattern": "Hidden Opportunity",
      "score": 0.9,
      "insight": "...",
      "sources": [...]
    }
  ],
  "totalConnections": 3,
  "generatedAt": "2025-01-28T12:00:00.000Z"
}
```

---

### GET `/api/serendipity/stats`

Returns statistics about data coverage and engine readiness.

#### Response

```json
{
  "success": true,
  "dataCounts": {
    "expenses": 45,
    "briefings": 12,
    "jobs": 8,
    "ideas": 15,
    "resources": 30
  },
  "totalItems": 110,
  "potentialConnections": 5995,
  "patternsAvailable": 6,
  "seedDetectors": 5,
  "status": "ready",
  "recommendation": "Good data coverage! Run discovery to find connections."
}
```

---

## Connection Patterns Explained

### 🕐 Temporal Correlation
Events happening close together in time. If you bought a book and attended a conference within the same week, there might be a connection.

### 📍 Location Link
Same physical location appearing in different contexts. The coffee shop in your expenses might be where industry meetups happen.

### 🔗 Semantic Thread
Shared keywords and themes across data. If "machine learning" appears in your job searches, ideas, and saved resources, you're building expertise.

### 💰 Financial Signal
Spending patterns that indicate where your attention goes. Recurring expenses in a category might validate a business idea.

### 👥 Network Connection
People or organizations appearing in multiple places. If a company appears in your briefings AND your job list, that's a hot lead.

### 🎯 Hidden Opportunity
Actionable insights from combining patterns. The engine generates specific recommendations when it finds strong correlations.

---

## Example Use Cases

### 1. Job Interview Prep
```bash
curl -X POST http://localhost:3000/api/serendipity/discover \
  -H "Content-Type: application/json" \
  -d '{"includeTypes": ["jobs", "briefings", "expenses"], "limit": 5}'
```

Might reveal: "You had coffee at Blue Bottle 3x this month. The CTO of Stripe (on your job list) posts from there every Tuesday."

### 2. Startup Validation
```bash
curl -X POST http://localhost:3000/api/serendipity/discover \
  -H "Content-Type: application/json" \
  -d '{"includeTypes": ["ideas", "expenses"], "minScore": 0.7}'
```

Might reveal: "You've spent $234 on project management tools. Your idea 'Simple PM for Solopreneurs' solves your own problem."

### 3. Learning Path Discovery
```bash
curl -X POST http://localhost:3000/api/serendipity/discover \
  -H "Content-Type: application/json" \
  -d '{"includeTypes": ["resources", "ideas", "jobs"]}'
```

Might reveal: "Your saved course 'Advanced Python' aligns with 3 job listings and 2 of your AI ideas."

---

## Integration Tips

### Frontend Display
Show discoveries as cards with:
- Icon based on `patternType`
- Score as a relevance indicator
- `insight` as the main text
- `sources` as clickable links to the original items

### Periodic Discovery
Run discovery in the background daily and surface top findings:
```javascript
// Cron job example
cron.schedule('0 8 * * *', async () => {
  const discoveries = await fetch('/api/serendipity/discover', {
    method: 'POST',
    body: JSON.stringify({ limit: 5, minScore: 0.7 })
  });
  // Notify user of high-score discoveries
});
```

### Item-Specific Analysis
When viewing any item, show its connections:
```javascript
const connections = await fetch('/api/serendipity/analyze', {
  method: 'POST',
  body: JSON.stringify({ type: 'jobs', id: jobId })
});
// Show as "Related Discoveries" section
```

---

## Technical Details

### Scoring System
- Base score from pattern matching (0-1)
- Boosted by entity matches (+0.1-0.2)
- Boosted by keyword overlap (+0.1 per keyword)
- Capped at 1.0

### Performance
- Queries limited to 50-100 items per table
- Cross-comparison is O(n²) but bounded
- Typical response time: 200-500ms

### Extensibility
Add new seed patterns in `serendipity.js`:
```javascript
SEED_CONNECTIONS.push({
  id: 'my-pattern',
  name: 'My Custom Pattern',
  sources: ['jobs', 'resources'],
  detect: (job, resource) => {
    // Return { score, insight } or null
  }
});
```

---

Built with 🎲 by Jimmy & Lumen AI Solutions
