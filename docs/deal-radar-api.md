# Deal Radar API Documentation

> 24/7 Opportunity Scanner for Jimmy & Lumen AI Solutions

Deal Radar is an AI-powered opportunity detection system that continuously scans and matches opportunities against user-defined search profiles.

## Overview

- **Profiles**: Define your search criteria (job type, salary, location, skills)
- **Opportunities**: Scraped/imported job listings and opportunities
- **Matching**: AI-powered scoring algorithm that ranks opportunities
- **Alerts**: Notifications when high-match opportunities are found

---

## Database Schema

### `lumen_opportunity_profiles`
Stores user-defined search criteria.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(255) | Profile name (required) |
| description | TEXT | Optional description |
| job_types | TEXT[] | e.g., ['full-time', 'contract'] |
| salary_min | INTEGER | Minimum salary |
| salary_max | INTEGER | Maximum salary |
| salary_currency | VARCHAR(10) | Default 'USD' |
| locations | TEXT[] | e.g., ['San Francisco', 'Remote'] |
| remote_only | BOOLEAN | Only remote opportunities |
| keywords | TEXT[] | Search keywords |
| required_skills | TEXT[] | Must-have skills |
| preferred_skills | TEXT[] | Nice-to-have skills |
| exclude_keywords | TEXT[] | Filter out these |
| company_sizes | TEXT[] | e.g., ['startup', 'enterprise'] |
| industries | TEXT[] | e.g., ['tech', 'finance'] |
| exclude_companies | TEXT[] | Company blacklist |
| alert_threshold | INTEGER | Score threshold (0-100) |
| alert_enabled | BOOLEAN | Enable alerts |
| alert_frequency | VARCHAR(20) | 'realtime', 'daily', 'weekly' |
| priority | INTEGER | Higher = more important |
| active | BOOLEAN | Profile is active |
| created_at | TIMESTAMP | Creation date |
| updated_at | TIMESTAMP | Last update |
| last_scan_at | TIMESTAMP | Last scan time |
| total_matches | INTEGER | Total matches found |

### `lumen_opportunities`
Stores found/scanned opportunities.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| external_id | VARCHAR(255) | ID from source |
| source | VARCHAR(100) | 'linkedin', 'indeed', 'manual' |
| source_url | TEXT | Link to original |
| title | VARCHAR(500) | Job title |
| company | VARCHAR(255) | Company name |
| company_size | VARCHAR(50) | Size category |
| industry | VARCHAR(100) | Industry |
| location | VARCHAR(255) | Location |
| is_remote | BOOLEAN | Remote position |
| job_type | VARCHAR(50) | 'full-time', 'contract', etc. |
| salary_min | INTEGER | Min salary |
| salary_max | INTEGER | Max salary |
| salary_currency | VARCHAR(10) | Currency |
| salary_text | VARCHAR(255) | Raw salary text |
| description | TEXT | Full description |
| requirements | TEXT | Requirements |
| responsibilities | TEXT | Responsibilities |
| benefits | TEXT | Benefits |
| skills | TEXT[] | Required skills |
| status | VARCHAR(50) | 'new', 'applied', etc. |
| starred | BOOLEAN | Favorited |
| archived | BOOLEAN | Hidden |
| notes | TEXT | User notes |
| posted_at | TIMESTAMP | When posted |
| expires_at | TIMESTAMP | Expiration |
| created_at | TIMESTAMP | Import date |
| updated_at | TIMESTAMP | Last update |

### `lumen_opportunity_matches`
Junction table linking profiles to opportunities with scores.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| profile_id | INTEGER | FK to profiles |
| opportunity_id | INTEGER | FK to opportunities |
| score | INTEGER | Match score (0-100) |
| score_breakdown | JSONB | Detailed scoring |
| alerted | BOOLEAN | Alert sent |
| alerted_at | TIMESTAMP | When alerted |
| matched_keywords | TEXT[] | Keywords that matched |
| matched_skills | TEXT[] | Skills that matched |
| match_notes | TEXT | Notes |
| created_at | TIMESTAMP | Match date |

---

## API Endpoints

### Profiles

#### Create Profile
```http
POST /api/radar/profiles
Content-Type: application/json

{
  "name": "Senior AI Engineer Roles",
  "description": "Looking for senior AI/ML positions",
  "job_types": ["full-time"],
  "salary_min": 150000,
  "salary_max": 300000,
  "locations": ["San Francisco", "Remote"],
  "remote_only": false,
  "keywords": ["AI", "machine learning", "LLM", "GPT"],
  "required_skills": ["Python", "PyTorch"],
  "preferred_skills": ["Kubernetes", "AWS"],
  "exclude_keywords": ["junior", "intern"],
  "exclude_companies": ["Meta"],
  "alert_threshold": 75,
  "alert_enabled": true,
  "priority": 1
}
```

**Response:**
```json
{
  "message": "Profile created successfully",
  "profile": {
    "id": 1,
    "name": "Senior AI Engineer Roles",
    "...": "..."
  }
}
```

#### List Profiles
```http
GET /api/radar/profiles
GET /api/radar/profiles?active_only=false
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Senior AI Engineer Roles",
    "match_count": 42,
    "high_match_count": 8,
    "best_score": 95,
    "...": "..."
  }
]
```

#### Get Profile
```http
GET /api/radar/profiles/:id
```

#### Update Profile
```http
PATCH /api/radar/profiles/:id
Content-Type: application/json

{
  "salary_min": 175000,
  "keywords": ["AI", "machine learning", "LLM", "GPT", "Claude"]
}
```

#### Delete Profile
```http
DELETE /api/radar/profiles/:id
```

---

### Opportunities

#### List Opportunities
```http
GET /api/radar/opportunities
GET /api/radar/opportunities?profile_id=1&min_score=70
GET /api/radar/opportunities?status=new&starred=true
GET /api/radar/opportunities?source=linkedin&limit=20&offset=0
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| profile_id | int | Filter by profile, includes scores |
| min_score | int | Minimum match score |
| status | string | 'new', 'applied', 'rejected', etc. |
| starred | bool | Only starred |
| source | string | Filter by source |
| limit | int | Results per page (default 50) |
| offset | int | Pagination offset |

**Response (with profile_id):**
```json
[
  {
    "id": 1,
    "title": "Senior ML Engineer",
    "company": "OpenAI",
    "salary_min": 200000,
    "salary_max": 350000,
    "location": "San Francisco, CA",
    "is_remote": true,
    "score": 92,
    "score_breakdown": {
      "salary": 100,
      "location": 100,
      "job_type": 100,
      "keywords": 85,
      "skills": 80
    },
    "matched_keywords": ["AI", "machine learning", "LLM"],
    "matched_skills": ["Python", "PyTorch"],
    "...": "..."
  }
]
```

#### Add Opportunity Manually
```http
POST /api/radar/opportunities
Content-Type: application/json

{
  "source": "manual",
  "title": "AI Research Scientist",
  "company": "Anthropic",
  "location": "San Francisco",
  "is_remote": true,
  "job_type": "full-time",
  "salary_min": 200000,
  "salary_max": 400000,
  "description": "Work on frontier AI research...",
  "skills": ["Python", "ML", "Research"],
  "source_url": "https://anthropic.com/careers/..."
}
```

**Response:**
```json
{
  "message": "Opportunity added",
  "opportunity": { "id": 1, "..." },
  "scan": {
    "success": true,
    "matches": 3,
    "high_matches": 1,
    "alerts": [...]
  }
}
```

#### Update Status
```http
PATCH /api/radar/opportunities/:id/status
Content-Type: application/json

{
  "status": "applied",
  "notes": "Applied via company website on 2024-01-15"
}
```

**Valid Statuses:** `new`, `reviewing`, `applied`, `interviewing`, `rejected`, `expired`

#### Toggle Star
```http
PATCH /api/radar/opportunities/:id/star
```

---

### Scanning

#### Trigger Scan
```http
POST /api/radar/scan
Content-Type: application/json

{
  "profile_id": 1  // optional - scan specific profile only
}
```

**Response:**
```json
{
  "success": true,
  "scanned": {
    "profiles": 3,
    "opportunities": 150
  },
  "matches": 89,
  "high_matches": 12,
  "alerts": [
    {
      "profile_id": 1,
      "profile_name": "Senior AI Engineer Roles",
      "opportunity_id": 42,
      "opportunity_title": "Senior ML Engineer",
      "company": "OpenAI",
      "score": 95
    }
  ],
  "duration_seconds": 1.23
}
```

---

### Analytics

#### Get Stats
```http
GET /api/radar/stats
```

**Response:**
```json
{
  "active_profiles": 3,
  "total_opportunities": 250,
  "new_opportunities": 45,
  "total_matches": 180,
  "high_matches": 28,
  "avg_score": 62,
  "last_scan": "2024-01-15T10:30:00Z"
}
```

#### Preview Score (without saving)
```http
POST /api/radar/score
Content-Type: application/json

{
  "opportunity": {
    "title": "ML Engineer",
    "company": "Startup XYZ",
    "salary_min": 180000,
    "description": "Build AI products...",
    "skills": ["Python", "TensorFlow"]
  },
  "profile_id": 1  // optional - test against specific profile
}
```

**Response:**
```json
{
  "opportunity_title": "ML Engineer",
  "scores": [
    {
      "profile_id": 1,
      "profile_name": "Senior AI Engineer Roles",
      "score": 78,
      "breakdown": {
        "salary": 90,
        "location": 50,
        "job_type": 100,
        "keywords": 70,
        "skills": 65
      },
      "matchedKeywords": ["AI"],
      "matchedSkills": ["Python"],
      "excluded": false
    }
  ]
}
```

---

## Matching Algorithm

The scoring algorithm calculates a weighted score (0-100) based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Salary | 25% | Overlap between offer and requirement |
| Location | 20% | Exact match or remote flexibility |
| Job Type | 15% | Full-time, contract, etc. |
| Keywords | 20% | % of profile keywords found |
| Skills | 20% | Required + preferred skills match |

### Special Cases:
- **Exclusions**: Score = 0 if any exclude_keywords or exclude_companies match
- **Required Skills**: Penalty if not all required skills are present
- **No Info**: Neutral score (50) when opportunity lacks data

---

## Usage Examples

### Create a comprehensive profile:
```bash
curl -X POST http://localhost:3000/api/radar/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dream Job Profile",
    "job_types": ["full-time", "contract"],
    "salary_min": 150000,
    "locations": ["Remote", "New York"],
    "keywords": ["AI", "startup", "series A"],
    "required_skills": ["Python", "SQL"],
    "preferred_skills": ["AWS", "Docker"],
    "exclude_companies": ["Amazon"],
    "alert_threshold": 80
  }'
```

### Find top matches:
```bash
curl "http://localhost:3000/api/radar/opportunities?profile_id=1&min_score=75&limit=10"
```

### Run a full scan:
```bash
curl -X POST http://localhost:3000/api/radar/scan
```

---

## Future Enhancements (Placeholder)

- [ ] LinkedIn Jobs API integration
- [ ] Indeed API integration
- [ ] Email/SMS alerts
- [ ] Auto-apply integration
- [ ] Resume matching
- [ ] Interview scheduling
- [ ] Salary negotiation assistant

---

*Built with ❤️ by Jimmy & Lumen AI Solutions*
