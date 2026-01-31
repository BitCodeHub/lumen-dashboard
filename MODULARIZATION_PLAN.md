# Lumen Dashboard Modularization Plan

**Created:** 2025-01-25  
**Author:** Ethan ⚙️ (Engineering Lead)  
**Status:** 🚧 In Progress

## Overview

The `server.js` file has grown to **6,459 lines** - a massive monolith that needs to be broken down into maintainable modules. This plan outlines the extraction strategy, prioritization, and implementation approach.

## Current State Analysis

### File Structure
```
server.js (6,459 lines)
├── Imports & Config (~50 lines)
├── Middleware Setup (~100 lines)
├── Database Pool & Init (~400 lines)
├── GitHub Sync Functions (~300 lines)
├── AITMPL Scraper Functions (~200 lines)
├── Template Data Generator (~400 lines)
├── Team Activity Routes (~150 lines)
├── Briefings Routes (~200 lines)
├── Meeting Prep Routes (~50 lines)
├── Analytics Routes (~100 lines)
├── Life Dashboard Routes (~150 lines)
├── Expenses Routes (~200 lines)
├── Money Oracle Routes (~50 lines)
├── Ideas Routes (~100 lines)
├── Pitches Routes (~200 lines)
├── Resources Routes (~50 lines)
├── Jobs Routes (~100 lines)
├── Lumen Tools/Templates Routes (~300 lines)
├── Sync API Routes (~100 lines)
├── Serendipity Routes (~100 lines)
├── Notifications Routes (~300 lines)
├── Voice Clone Routes (~150 lines)
├── Context Resurrection Routes (~200 lines)
├── Automation Builder Routes (~300 lines)
├── Health & Misc Routes (~50 lines)
├── Cron Jobs (~50 lines)
└── Server Start (~20 lines)
```

## Modularization Strategy

### Phase 1: Route Extraction (Priority: High)
Extract route handlers into `/routes/` directory using Express Router.

| Module | Routes | Est. Lines | Priority | Status |
|--------|--------|------------|----------|--------|
| `briefings.js` | 7 routes | ~200 | 🔴 High | ✅ Done |
| `expenses.js` | 5+ routes | ~200 | 🔴 High | ⏳ Pending |
| `team-activity.js` | 6 routes | ~150 | 🔴 High | ⏳ Pending |
| `analytics.js` | 4 routes | ~100 | 🟡 Medium | ⏳ Pending |
| `notifications.js` | 10+ routes | ~300 | 🟡 Medium | ⏳ Pending |
| `automations.js` | 10+ routes | ~300 | 🟡 Medium | ⏳ Pending |
| `ideas.js` | 5 routes | ~100 | 🟡 Medium | ⏳ Pending |
| `pitches.js` | 8 routes | ~200 | 🟡 Medium | ⏳ Pending |
| `resources.js` | 3 routes | ~50 | 🟢 Low | ⏳ Pending |
| `jobs.js` | 5 routes | ~100 | 🟢 Low | ⏳ Pending |
| `voice.js` | 8 routes | ~150 | 🟢 Low | ⏳ Pending |
| `context.js` | 4 routes | ~200 | 🟢 Low | ⏳ Pending |
| `templates.js` | 4 routes | ~300 | 🟢 Low | ⏳ Pending |
| `serendipity.js` | 3 routes | ~100 | 🟢 Low | ⏳ Pending |
| `meetings.js` | 1 route | ~50 | 🟢 Low | ⏳ Pending |

### Phase 2: Service Extraction (Priority: Medium)
Extract business logic into `/services/` directory.

| Module | Purpose | Est. Lines | Priority |
|--------|---------|------------|----------|
| `database.js` | Pool, init, migrations | ~400 | 🔴 High |
| `github-sync.js` | GitHub polling & sync | ~300 | 🟡 Medium |
| `scraper.js` | AITMPL scraper | ~200 | 🟡 Medium |
| `template-generator.js` | Fallback template data | ~400 | 🟢 Low |
| `sse-manager.js` | SSE client management | ~50 | 🟢 Low |

### Phase 3: Middleware Extraction (Priority: Low)
Extract middleware into `/middleware/` directory.

| Module | Purpose | Est. Lines |
|--------|---------|------------|
| `auth-middleware.js` | API auth & session | ~50 |
| `error-handler.js` | Global error handling | ~30 |

## Target Structure

```
lumen-dashboard/
├── server.js              (~200 lines - orchestration only)
├── routes/
│   ├── index.js           (route aggregator)
│   ├── briefings.js       ✅ DONE
│   ├── expenses.js
│   ├── team-activity.js
│   ├── analytics.js
│   ├── notifications.js
│   ├── automations.js
│   ├── ideas.js
│   ├── pitches.js
│   ├── resources.js
│   ├── jobs.js
│   ├── voice.js
│   ├── context.js
│   ├── templates.js
│   ├── serendipity.js
│   └── meetings.js
├── services/
│   ├── database.js
│   ├── github-sync.js
│   ├── scraper.js
│   ├── template-generator.js
│   └── sse-manager.js
├── middleware/
│   ├── auth-middleware.js
│   └── error-handler.js
└── (existing modules)
    ├── auth.js
    ├── smart-expenses.js
    ├── serendipity.js
    ├── meeting-prep.js
    ├── money-oracle.js
    ├── life-dashboard.js
    ├── deal-radar.js
    ├── smart-capture.js
    ├── automation-builder.js
    ├── context-resurrection.js
    ├── proactive-notifications.js
    └── voice-clone.js
```

## Implementation Guidelines

### Route Module Template
```javascript
const express = require('express');
const router = express.Router();

// Routes receive pool via app.locals or closure
module.exports = (pool) => {
  router.get('/', async (req, res) => {
    // handler
  });
  
  return router;
};
```

### Integration Pattern
```javascript
// In server.js
const briefingsRoutes = require('./routes/briefings')(pool);
app.use('/api/briefings', briefingsRoutes);
```

## Progress Tracking

### Completed
- [x] Analysis of server.js structure
- [x] Identification of 15 route groups
- [x] Created modularization plan
- [x] Extracted `/routes/briefings.js`

### In Progress
- [ ] Verify briefings.js integration works
- [ ] Extract `/routes/expenses.js`

### Next Steps
1. Test briefings.js module
2. Extract expenses.js (high traffic)
3. Extract team-activity.js (SSE complexity)
4. Extract database.js service

## Estimated Impact

| Metric | Before | After (Projected) |
|--------|--------|-------------------|
| server.js lines | 6,459 | ~200 |
| Avg module size | N/A | ~150 lines |
| Number of modules | 1 | 20+ |
| Testability | Low | High |
| Maintainability | Poor | Excellent |

## Notes

- Existing modules (auth.js, smart-expenses.js, etc.) are already well-structured
- SSE clients for team-activity need careful handling during extraction
- Database pool should be passed via dependency injection, not globals
- Some routes share helper functions - extract to shared utils

---

*Last Updated: 2025-01-25 by Ethan ⚙️*
