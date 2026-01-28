# GitHub API Polling for Template Sync

This dashboard automatically syncs templates from the `davila7/claude-code-templates` repository using GitHub API polling instead of webhooks.

## How It Works

1. **Polling Schedule**: The server checks the GitHub API every 15 minutes (at :05, :20, :35, :50 past each hour)
2. **Change Detection**: Compares the latest commit SHA with the previously seen SHA
3. **Automatic Sync**: When a new commit is detected, automatically clones/pulls the repo and updates templates in the database

## Rate Limits

- GitHub API allows **60 requests/hour** for unauthenticated requests
- Polling 4 times per hour = **4 requests/hour** (well within limits)
- Exponential backoff is implemented if rate limited

## Endpoints

### GET /api/lumen-tools/github-status
Returns the current GitHub polling status:
```json
{
  "enabled": true,
  "lastCheckAt": "2025-01-28T12:20:00.000Z",
  "lastCheckAgo": "5 min ago",
  "lastCommitSha": "abc1234def5678...",
  "lastCommitShort": "abc1234",
  "lastCommitMessage": "Add new template",
  "lastCommitAuthor": "davila7",
  "lastSyncAt": "2025-01-28T12:20:05.000Z",
  "lastSyncSuccess": true,
  "templatesUpdated": 45,
  "pollCount": 12,
  "rateLimitRemaining": 56,
  "sourceRepo": "davila7/claude-code-templates"
}
```

### POST /api/lumen-tools/github-sync
Manually trigger a GitHub check and sync (if changes detected).

### POST /api/lumen-tools/github-force-sync
Force a sync from GitHub regardless of whether changes were detected.

### GET /api/lumen-tools/sync-status
Returns combined status for both hourly scrape and GitHub polling.

## Advantages Over Webhooks

1. **No Configuration Required**: Works out of the box without setting up GitHub webhooks
2. **No Secret Management**: No webhook secrets to configure or secure
3. **Firewall Friendly**: No need for incoming webhook traffic
4. **Simple Setup**: Just deploy and it works
5. **Within Free Tier**: Uses minimal API requests

## Migration from Webhooks

The old webhook endpoints redirect to the new polling endpoints:
- `GET /api/webhooks/github/status` → `GET /api/lumen-tools/github-status`
- `POST /api/webhooks/github/sync` → `POST /api/lumen-tools/github-sync`

## UI Indicators

The dashboard shows two sync status indicators:
1. **Hourly Scrape Status**: Shows last aitmpl.com scrape time and item count
2. **GitHub Polling Status**: Shows last GitHub check time and commit SHA

When new commits are detected, the GitHub indicator shows "New commits detected!" with a pulsing green dot.
