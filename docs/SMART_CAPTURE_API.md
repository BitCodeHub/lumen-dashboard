# Smart Capture API

**Everything Inbox** - Drop in any content and it gets auto-categorized, structured, and connected to related items.

## Quick Start

```bash
# Capture anything
curl -X POST https://your-api.com/api/capture \
  -H "Content-Type: application/json" \
  -d '{"content": "$45 at Chipotle for lunch"}'
```

Response:
```json
{
  "success": true,
  "message": "Captured as expense (85% confidence)",
  "type": "expense",
  "confidence": 0.85,
  "item": { "id": 42, "table": "lumen_expenses" },
  "data": {
    "amount": 45,
    "vendor": "Chipotle",
    "category": "Food"
  },
  "related": { ... }
}
```

---

## Endpoints

### POST /api/capture

Main capture endpoint. Accepts any text content and:
1. Auto-detects the content type
2. Extracts structured data
3. Stores in the appropriate table
4. Finds related items

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | ✅ | Raw text to capture |
| `type_hint` | string | ❌ | Override auto-detection (`expense`, `idea`, `job`, `resource`, `briefing`) |
| `source` | string | ❌ | Where the capture came from (e.g., `voice`, `web`, `ios`) |

**Response:**

```json
{
  "success": true,
  "message": "Captured as idea (75% confidence)",
  "type": "idea",
  "confidence": 0.75,
  "method": "pattern_matching",
  "scores": {
    "expense": 0.1,
    "idea": 0.75,
    "job": 0.2,
    "resource": 0.15,
    "briefing": 0.3
  },
  "item": {
    "id": 123,
    "table": "lumen_ideas"
  },
  "data": {
    "name": "AI-powered meeting summarizer",
    "description": "Build an app that uses AI to summarize meetings...",
    "category": "AI/ML",
    "type": "saas",
    "tech_stack": ["react", "python", "aws"]
  },
  "related": {
    "briefings": [...],
    "ideas": [...],
    "jobs": [...],
    "resources": [...]
  },
  "raw_input": "Build an app that uses AI to summarize meetings..."
}
```

---

### POST /api/capture/detect

Preview detection without storing. Useful for testing or building UI previews.

**Request:**
```json
{
  "content": "Senior React Developer at Stripe $150k-200k remote"
}
```

**Response:**
```json
{
  "type": "job",
  "confidence": 0.7,
  "method": "pattern_matching",
  "scores": { ... },
  "extracted_data": {
    "title": "Senior React Developer",
    "company": "Stripe",
    "salary_min": 150000,
    "salary_max": 200000,
    "salary_text": "$150K - $200K",
    "tags": ["remote", "react"]
  },
  "would_store_in": "lumen_jobs"
}
```

---

### GET /api/capture/types

List all supported capture types with descriptions and examples.

**Response:**
```json
{
  "types": [
    {
      "type": "expense",
      "description": "Financial transactions, purchases, receipts",
      "examples": ["$25 at Chipotle for lunch", "Spent 50 bucks on gas"],
      "stored_in": "lumen_expenses",
      "fields": ["amount", "vendor", "category", "description"]
    },
    ...
  ]
}
```

---

### GET /api/capture/recent

Get recently captured items across all types.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 20 | Max items to return (max 100) |

**Response:**
```json
{
  "count": 15,
  "items": [
    {
      "id": 42,
      "title": "$45 at Chipotle",
      "type": "Food",
      "capture_type": "expense",
      "created_at": "2024-01-29T10:30:00Z"
    },
    ...
  ]
}
```

---

## Supported Types

### 💰 Expense

Detects: dollar amounts, merchant names, purchase keywords

**Pattern triggers:**
- `$12.50`, `spent 20`, `paid 50`, `12 dollars`
- Keywords: spent, paid, cost, bought, purchase, receipt

**Extracted fields:**
- `amount` - Dollar amount
- `vendor` - Merchant/store name
- `category` - Food, Gas, Groceries, Transport, Shopping, etc.
- `description` - Generated description
- `merchant_type` - fast_food, grocery, retail, gas_station, etc.

**Examples:**
```
$45.50 at Raising Cane's for lunch
Spent 80 bucks on groceries at Costco
Uber ride from airport $32
```

---

### 💡 Idea

Detects: idea/concept keywords, startup language, product descriptions

**Pattern triggers:**
- `idea:`, `what if we`, `we should build`
- Keywords: startup, mvp, saas, b2b, monetize, product

**Extracted fields:**
- `name` - Idea title
- `description` - Full description
- `category` - AI/ML, SaaS, Mobile, Fintech, etc.
- `type` - app, saas, mobile app, extension, api/service
- `revenue_potential` - If mentioned ($100K, etc.)
- `build_time` - If mentioned (2 weeks to MVP)
- `tech_stack` - Detected technologies

**Examples:**
```
Idea: AI meeting summarizer that auto-generates action items
Build a SaaS dashboard for expense tracking, could charge $20/month
What if we created a mobile app for habit tracking with AI coaching?
```

---

### 💼 Job

Detects: job titles, salary ranges, company mentions

**Pattern triggers:**
- `$80k-$120k`, `salary:`, `hiring`, `position at`
- Keywords: job, role, remote, hybrid, interview, recruiter

**Extracted fields:**
- `title` - Job title
- `company` - Company name
- `location` - Location if mentioned
- `salary_min/max` - Salary range
- `salary_text` - Formatted salary
- `job_type` - full-time, part-time, contract
- `url` - Job posting URL if included
- `tags` - remote, technologies, etc.

**Examples:**
```
Senior React Developer at Stripe $150k-200k remote
Found a cool ML Engineer role at OpenAI, looking for 3+ years experience
Junior position at startup, equity heavy, San Francisco
```

---

### 🔗 Resource

Detects: URLs, article/tutorial/tool mentions

**Pattern triggers:**
- `https://...`, `github.com`, `youtube.com`
- Keywords: link, article, video, tutorial, tool, documentation

**Extracted fields:**
- `title` - Resource title
- `url` - Link
- `description` - Full text
- `type` - link, article, video, repository, documentation
- `category` - Code, Media, Reading, Reference

**Examples:**
```
https://github.com/anthropic/claude-code-templates - Great templates for Claude
Found this awesome React hooks tutorial on YouTube
Useful API documentation: https://docs.stripe.com/api
```

---

### 📝 Briefing

Default fallback for general notes, meeting summaries, research.

**Pattern triggers:**
- `meeting with`, `key takeaways`, `action items`
- Keywords: notes, summary, briefing, report, decision

**Extracted fields:**
- `title` - First line of content
- `type` - note, meeting-notes, report, research, decision, action-items
- `content` - Full text
- `summary` - First 2-3 sentences
- `tags` - @mentions and #hashtags extracted

**Examples:**
```
Meeting with John about Q2 roadmap - key decisions: focus on mobile first
Daily standup: Completed the API refactor, starting on tests today
Research notes on competitor pricing models
```

---

## Related Items

Smart Capture automatically finds related content across your database:

- **Full-text search** on briefings
- **Keyword matching** on ideas, resources
- **Company matching** on jobs
- **Vendor matching** on expenses

Related items are returned in the `related` field grouped by type.

---

## Example Flows

### Voice Capture Flow
```javascript
// User speaks: "Just spent forty-five dollars at Chipotle for lunch"
const voiceTranscript = "Just spent forty-five dollars at Chipotle for lunch";

const result = await fetch('/api/capture', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: voiceTranscript,
    source: 'voice'
  })
});

// Automatically creates expense:
// { amount: 45, vendor: "Chipotle", category: "Food" }
```

### Quick Idea Capture
```javascript
// Jot down idea during meeting
const idea = "What if we built a Slack bot that summarizes threads using AI? Could charge $10/user/month for teams.";

const result = await fetch('/api/capture', {
  method: 'POST',
  body: JSON.stringify({ content: idea })
});

// Creates idea with:
// { name: "What if we built a Slack bot...", category: "AI/ML", type: "saas" }
// Plus finds related AI briefings and ideas
```

### URL Save with Notes
```javascript
const bookmark = `
https://github.com/anthropics/claude-code
Great CLI tool for Claude - useful for automating code reviews
#devtools #ai
`;

const result = await fetch('/api/capture', {
  method: 'POST',
  body: JSON.stringify({ content: bookmark })
});

// Creates resource:
// { url: "https://github.com/anthropics/claude-code", type: "repository", tags: ["devtools", "ai"] }
```

### Force Type Override
```javascript
// User knows this is an idea, even if detection is unsure
const result = await fetch('/api/capture', {
  method: 'POST',
  body: JSON.stringify({
    content: "Subscription box for developers",
    type_hint: "idea"  // Force idea type
  })
});
```

---

## Error Handling

**400 Bad Request:**
```json
{
  "error": "Missing required field: content",
  "hint": "Provide the text content you want to capture"
}
```

**500 Server Error:**
```json
{
  "error": "Failed to process capture",
  "details": "Database connection error"
}
```

---

## Integration Ideas

1. **iOS Shortcut** - Quick capture from share sheet
2. **Voice Assistant** - "Hey Siri, capture: ..."
3. **Chrome Extension** - One-click save any page
4. **Slack Bot** - Forward messages to capture
5. **Email Parser** - Auto-capture receipt emails
6. **CLI Tool** - `lumen capture "..."` 

---

## Best Practices

1. **Be specific** - "$45 at Chipotle for lunch" > "spent money on food"
2. **Include context** - "Meeting with Sarah about Q2 goals" > "meeting notes"
3. **Use hashtags** - Help categorization with #ai #startup #urgent
4. **Add URLs** - Links trigger resource detection automatically
5. **Trust the AI** - Override only when confidence is low

---

*Smart Capture - Because capturing ideas should be frictionless.* ✨
