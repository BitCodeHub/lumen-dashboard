# 🎲 Serendipity Engine - Usage Examples

## Quick Test

Once the server is running:

```bash
# Check stats (see if you have enough data)
curl http://localhost:3000/api/serendipity/stats | jq

# Discover connections
curl -X POST http://localhost:3000/api/serendipity/discover \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}' | jq

# Get available patterns
curl http://localhost:3000/api/serendipity/patterns | jq
```

---

## Example Discovery Response

```json
{
  "success": true,
  "discoveries": [
    {
      "id": "opportunity-expense-validation-Food-3",
      "pattern": "Hidden Opportunity",
      "patternType": "opportunity",
      "score": 0.9,
      "insight": "🎯 MARKET VALIDATION: You've spent $156.78 on \"Food\" (12 times). Your idea \"AI Diet Tracker\" solves a problem you personally pay to solve!",
      "sources": [
        { "type": "expenses", "id": 45, "preview": "Food (12 expenses)" },
        { "type": "ideas", "id": 3, "preview": "AI Diet Tracker" }
      ],
      "actionable": true,
      "suggestedAction": "You're the customer. Document your pain points as user research.",
      "stats": { "count": 12, "total": 156.78 },
      "discoveredAt": "2025-01-28T20:00:00.000Z"
    },
    {
      "id": "job-expense-location-7-23",
      "pattern": "Interview Prep Indicator",
      "patternType": "job-expense-location",
      "score": 0.88,
      "insight": "Your briefing \"OpenAI Announces GPT-5\" mentions \"Anthropic\". They might be making news - good time to apply!",
      "sources": [
        { "type": "briefings", "id": 7, "preview": "OpenAI Announces GPT-5" },
        { "type": "jobs", "id": 23, "preview": "ML Engineer at Anthropic" }
      ],
      "discoveredAt": "2025-01-28T20:00:00.000Z"
    },
    {
      "id": "semantic-resources-15-ideas-8",
      "pattern": "Semantic Thread",
      "patternType": "semantic",
      "score": 0.8,
      "insight": "🔗 Shared keywords [react, typescript, dashboard] connect your resource and idea. You're building a theme here.",
      "sources": [
        { "type": "resources", "id": 15, "preview": "React Dashboard Tutorial" },
        { "type": "ideas", "id": 8, "preview": "Analytics Dashboard SaaS" }
      ],
      "keywords": ["react", "typescript", "dashboard"],
      "discoveredAt": "2025-01-28T20:00:00.000Z"
    },
    {
      "id": "entity-companies-jobs-5-briefings-12",
      "pattern": "Network Connection",
      "patternType": "network",
      "score": 0.9,
      "insight": "👥 \"stripe\" appears in both your jobs and briefings. This company is a connection point.",
      "sources": [
        { "type": "jobs", "id": 5, "preview": "Senior Engineer at Stripe" },
        { "type": "briefings", "id": 12, "preview": "Stripe Launches AI Fraud Detection" }
      ],
      "entity": "stripe",
      "entityType": "companies",
      "discoveredAt": "2025-01-28T20:00:00.000Z"
    },
    {
      "id": "opportunity-trend-learning-ai-42",
      "pattern": "Hidden Opportunity",
      "patternType": "opportunity",
      "score": 0.8,
      "insight": "🎯 TREND ALIGNMENT: \"ai\" appeared in 5 of your briefings, and you have a learning resource for it: \"Deep Learning Specialization\". You're tracking something important!",
      "sources": [
        { "type": "briefings", "id": 1, "preview": "ai (5 mentions)" },
        { "type": "resources", "id": 42, "preview": "Deep Learning Specialization" }
      ],
      "actionable": true,
      "suggestedAction": "Prioritize learning \"Deep Learning Specialization\" - this trend is heating up.",
      "discoveredAt": "2025-01-28T20:00:00.000Z"
    }
  ],
  "stats": {
    "totalFound": 23,
    "returned": 5,
    "dataScanned": {
      "expenses": 45,
      "briefings": 12,
      "jobs": 8,
      "ideas": 15,
      "resources": 30
    },
    "patterns": {
      "opportunity": 3,
      "semantic": 1,
      "network": 1
    }
  },
  "generatedAt": "2025-01-28T20:00:00.000Z",
  "processingTime": "0.28s"
}
```

---

## Frontend Integration Example

```javascript
// React component example
function SerendipityWidget() {
  const [discoveries, setDiscoveries] = useState([]);
  const [loading, setLoading] = useState(false);

  const discoverConnections = async () => {
    setLoading(true);
    const response = await fetch('/api/serendipity/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5, minScore: 0.6 })
    });
    const data = await response.json();
    setDiscoveries(data.discoveries || []);
    setLoading(false);
  };

  const getPatternIcon = (type) => {
    const icons = {
      temporal: '📅',
      location: '📍',
      semantic: '🔗',
      financial: '💰',
      network: '👥',
      opportunity: '🎯'
    };
    return icons[type] || '✨';
  };

  return (
    <div className="serendipity-widget">
      <h2>🎲 Serendipity Engine</h2>
      <button onClick={discoverConnections} disabled={loading}>
        {loading ? 'Discovering...' : 'Find Connections'}
      </button>
      
      <div className="discoveries">
        {discoveries.map(d => (
          <div key={d.id} className="discovery-card" data-score={d.score}>
            <span className="pattern-icon">{getPatternIcon(d.patternType)}</span>
            <span className="score">{Math.round(d.score * 100)}%</span>
            <p className="insight">{d.insight}</p>
            <div className="sources">
              {d.sources.map(s => (
                <a key={`${s.type}-${s.id}`} href={`/${s.type}/${s.id}`}>
                  {s.preview}
                </a>
              ))}
            </div>
            {d.suggestedAction && (
              <p className="action">💡 {d.suggestedAction}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Real-World Scenarios

### Scenario 1: Job Hunting
You have:
- A job listing for "ML Engineer at Anthropic"
- A briefing about "Claude 4 Release"
- An expense at "Philz Coffee" (where Anthropic has offices nearby)

**Discovery:** "Your expense at Philz Coffee is near Anthropic's office. Your briefing about Claude 4 is related to Anthropic. Good time to apply - you already know the neighborhood!"

### Scenario 2: Startup Validation
You have:
- An idea: "Expense Tracker for Freelancers"
- 47 expense entries over 3 months
- A resource: "How to Validate Your Startup Idea"

**Discovery:** "You've tracked 47 expenses over 90 days. Your idea 'Expense Tracker for Freelancers' solves exactly what you're doing manually. Plus, you saved a validation guide!"

### Scenario 3: Skill Building
You have:
- A job requiring "TypeScript, React, GraphQL"
- A resource: "Full Stack Open Course"
- An idea: "SaaS Analytics Dashboard"

**Discovery:** "Your saved course teaches TypeScript and React. This matches the tech stack for your job target AND your SaaS idea. Triple alignment!"

---

## Adding Custom Patterns

Add to `serendipity.js`:

```javascript
// Example: Detect when you're researching a company before an interview
SEED_CONNECTIONS.push({
  id: 'company-research-signal',
  name: 'Interview Research Detected',
  sources: ['jobs', 'resources'],
  detect: (job, resource) => {
    const company = (job.company || '').toLowerCase();
    const resourceText = [resource.title, resource.url, resource.description]
      .filter(Boolean).join(' ').toLowerCase();
    
    if (company && resourceText.includes(company)) {
      return {
        score: 0.85,
        insight: `📚 You saved a resource about "${job.company}" and have them on your job list. Looks like interview prep!`
      };
    }
    return null;
  }
});
```

---

*Happy discovering! 🎲*
