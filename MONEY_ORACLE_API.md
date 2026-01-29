# 🔮 Money Oracle API Documentation

**Predictive Financial Intelligence for Lumen Dashboard**

The Money Oracle analyzes your expense history to surface hidden patterns, predict future spending, and identify savings opportunities. It's designed to make you say "how did it know that?"

---

## Endpoints

### GET `/api/expenses/oracle`

Full analysis endpoint - returns comprehensive spending insights, predictions, and patterns.

**Response Time:** ~50-200ms depending on data volume

**Response Structure:**

```json
{
  "success": true,
  "summary": {
    "totalExpenses": 247,
    "totalSpent": 3847.52,
    "analyzedPeriod": "7/28/2024 - 1/28/2025",
    "dataPoints": 247,
    "uniqueVendors": 34,
    "categories": 8
  },
  "insights": [
    {
      "type": "weekend_pattern",
      "category": "behavior",
      "severity": "warning",
      "headline": "Weekend splurge detected",
      "detail": "You spend 34% more on weekends than weekdays",
      "icon": "🎉"
    },
    {
      "type": "correlation",
      "category": "hidden_pattern",
      "severity": "insight",
      "headline": "☕ The Morning Effect",
      "detail": "Days starting with an early purchase lead to 47% more total spending",
      "icon": "🔮"
    }
  ],
  "predictions": {
    "nextMonth": 1247.83,
    "confidence": "high",
    "byCategory": {
      "Food": 487.20,
      "Gas": 156.80,
      "Shopping": 312.50
    },
    "factors": ["Upward spending trend detected (+8.3%)"]
  },
  "savings": [
    {
      "type": "frequent_small",
      "vendor": "Starbucks",
      "insight": "23 small purchases at Starbucks totaling $147.23",
      "potential": 44.17,
      "suggestion": "Consider reducing visits or finding alternatives"
    }
  ],
  "patterns": {
    "topSpendingDay": "Saturday",
    "peakSpendingTime": "Lunch Time",
    "spendingTrend": "increasing",
    "weekendVsWeekday": "weekend_higher"
  },
  "correlations": [
    {
      "type": "morning_trigger",
      "insight": "Days starting with an early purchase lead to 47% more total spending"
    },
    {
      "type": "multi_expense_days",
      "insight": "You spend 28% more on days with multiple purchases"
    }
  ],
  "analysis": {
    "dayOfWeek": [
      { "day": "Monday", "average": 23.45, "count": 35, "total": 820.75 }
    ],
    "categories": [
      { "name": "Food", "total": 1247.83, "percentage": 32.4, "count": 89, "trend": "up" }
    ],
    "topVendors": [
      { "name": "Raising Cane's", "total": 234.56, "visits": 12 }
    ]
  },
  "processingTimeMs": 87
}
```

---

### GET `/api/expenses/oracle/quick`

Lightweight endpoint for dashboard widgets. Returns only essential insights.

**Response:**

```json
{
  "success": true,
  "insights": [
    {
      "type": "weekend_pattern",
      "category": "behavior", 
      "severity": "warning",
      "headline": "Weekend splurge detected",
      "detail": "You spend 34% more on weekends than weekdays",
      "icon": "🎉"
    }
  ],
  "predictions": {
    "nextMonth": 1247.83,
    "confidence": "high"
  },
  "patterns": {
    "topSpendingDay": "Saturday",
    "peakSpendingTime": "Lunch Time",
    "spendingTrend": "increasing",
    "weekendVsWeekday": "weekend_higher"
  },
  "summary": {
    "totalSpent": 3847.52,
    "spendingTrend": "increasing"
  }
}
```

---

### GET `/api/expenses/oracle/savings`

Focused on savings opportunities.

**Response:**

```json
{
  "success": true,
  "opportunities": [
    {
      "type": "frequent_small",
      "vendor": "Starbucks",
      "insight": "23 small purchases at Starbucks totaling $147.23",
      "potential": 44.17,
      "suggestion": "Consider reducing visits or finding alternatives"
    },
    {
      "type": "category_overspend",
      "category": "Food",
      "insight": "Food spending is 32.4% of total (typical: 15%)",
      "potential": 127.50,
      "suggestion": "Look for ways to reduce food expenses"
    },
    {
      "type": "expensive_meal",
      "meal": "dinner",
      "insight": "Your average dinner costs $28.50",
      "potential": 270.00,
      "suggestion": "Consider meal prepping or choosing more affordable options for dinner"
    }
  ],
  "totalPotential": 441.67
}
```

---

## Insight Types

| Type | Description | Icon |
|------|-------------|------|
| `day_pattern` | Spending varies by day of week | 📅 |
| `weekend_pattern` | Weekend vs weekday spending | 🎉 or 🏆 |
| `time_pattern` | Peak spending time of day | ⏰ |
| `correlation` | Hidden pattern detected | 🔮 |
| `loyalty` | Frequent vendor detected | ⭐ |
| `trend` | New favorite vendor | 📈 |
| `monthly_trend` | Overall spending trend | 📊 or 📉 |
| `anomaly` | Unusual transaction | ⚠️ |
| `meal_pattern` | Meal spending patterns | 🍽️ |
| `cuisine_preference` | Favorite cuisine detected | 🥢 |
| `prediction` | Next month forecast | 🔮 |
| `savings_opportunity` | Potential savings found | 💰 |

---

## Severity Levels

| Level | Meaning | Display |
|-------|---------|---------|
| `warning` | Needs attention | Red/Orange |
| `insight` | Hidden pattern ("magic") | Purple |
| `positive` | Good behavior | Green |
| `info` | Neutral information | Blue |

---

## Correlation Detection

The Oracle detects several types of correlations:

### Morning Trigger Effect
Detects if early morning purchases (6-10 AM) correlate with higher total daily spending.

### Momentum Spending
Detects if days with multiple purchases have higher totals than expected.

### Week Rhythm
Compares early week (Mon-Wed) vs late week (Thu-Sat) spending patterns.

---

## Prediction Methodology

1. **Weighted Moving Average**: Recent months weighted higher (25% × 2 most recent, decreasing for older)
2. **Trend Adjustment**: Applies 30% of detected trend to prediction
3. **Category Distribution**: Predicts per-category based on historical percentages
4. **Confidence Levels**:
   - `high`: 6+ months of data
   - `medium`: 3-5 months of data
   - `low`: <3 months of data

---

## Sample Magic Insights

These are the "how did it know that?" moments:

> ☕ **The Morning Effect**  
> Days starting with an early purchase lead to 47% more total spending

> 🔄 **Momentum Spending**  
> You spend 28% more on days with multiple purchases

> 📈 **Week Rhythm**  
> You spend 23% more Thursday-Saturday than Monday-Wednesday

> 🎉 **Weekend splurge detected**  
> You spend 34% more on weekends than weekdays

> ⭐ **You're a regular at Raising Cane's**  
> 12 visits, $234.56 total (avg $19.55/visit)

---

## Usage Examples

### Dashboard Widget
```javascript
// Quick insights for widget
const response = await fetch('/api/expenses/oracle/quick');
const { insights, predictions, patterns } = await response.json();

// Display top insight
if (insights.length > 0) {
  const top = insights[0];
  showWidget(`${top.icon} ${top.headline}`, top.detail);
}

// Show prediction
showWidget(`🔮 Next month: $${predictions.nextMonth.toFixed(2)}`, 
           `Confidence: ${predictions.confidence}`);
```

### Full Analysis Page
```javascript
const response = await fetch('/api/expenses/oracle');
const oracle = await response.json();

// Display all insights
oracle.insights.forEach(insight => {
  addInsightCard({
    icon: insight.icon,
    headline: insight.headline,
    detail: insight.detail,
    severity: insight.severity
  });
});

// Show savings opportunities
oracle.savings.forEach(saving => {
  addSavingCard({
    amount: saving.potential,
    suggestion: saving.suggestion
  });
});
```

---

## Performance

- **Typical response time**: 50-200ms
- **Data analyzed**: Last 6 months of expenses
- **Minimum data for insights**: 10+ expenses
- **Optimal data for predictions**: 3+ months with 50+ expenses

---

## Error Handling

```json
{
  "success": false,
  "error": "Failed to analyze expenses",
  "message": "Database connection error"
}
```

---

*Built with 💜 by Jimmy & Lumen AI Solutions*
