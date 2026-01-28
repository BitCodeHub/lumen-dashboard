# GitHub Webhook Setup Instructions

## Overview

The Lumen Dashboard now supports real-time template sync via GitHub webhooks. When you push changes to the `davila7/claude-code-templates` repository, the webhook automatically triggers a sync to update the template database.

## Webhook Configuration

### 1. Set Environment Variable on Render

Add the following environment variable to your Render service:

| Variable | Value |
|----------|-------|
| `GITHUB_WEBHOOK_SECRET` | `b645e4697879dbea2a3104dcd30226e08c0de09059a98a3add42a685b015a495` |

**Steps:**
1. Go to https://dashboard.render.com
2. Select `lumen-dashboard` service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add `GITHUB_WEBHOOK_SECRET` with the value above
6. Click **Save Changes** (this will trigger a redeploy)

### 2. Configure GitHub Webhook

Go to the repository settings and add a webhook:

**Repository:** https://github.com/davila7/claude-code-templates/settings/hooks

**Webhook Settings:**
| Setting | Value |
|---------|-------|
| Payload URL | `https://lumen-dashboard.onrender.com/api/webhooks/github` |
| Content type | `application/json` |
| Secret | `b645e4697879dbea2a3104dcd30226e08c0de09059a98a3add42a685b015a495` |
| Which events | Just the `push` event |
| Active | ✅ Checked |

### 3. Test the Webhook

After configuring:
1. GitHub will send a `ping` event to verify the webhook
2. Check the webhook deliveries in GitHub settings
3. Check the Lumen Dashboard at `/api/webhooks/github/status`

## API Endpoints

### Webhook Endpoint
```
POST /api/webhooks/github
```
Receives GitHub webhook events. Validates signature using `X-Hub-Signature-256` header.

### Status Endpoint
```
GET /api/webhooks/github/status
```
Returns current webhook and sync status:
```json
{
  "connected": true,
  "lastWebhookAt": "2025-01-28T17:30:00.000Z",
  "lastSyncAt": "2025-01-28T17:30:05.000Z",
  "lastSyncSuccess": true,
  "templatesUpdated": 42,
  "secretConfigured": true,
  "webhookUrl": "https://lumen-dashboard.onrender.com/api/webhooks/github"
}
```

### Manual Sync
```
POST /api/webhooks/github/sync
```
Trigger a manual sync from GitHub (useful for testing).

### Event Log
```
GET /api/webhooks/github/events
```
Returns last 50 webhook events received.

## How It Works

1. **Push to main branch** → GitHub sends webhook to Lumen Dashboard
2. **Signature verification** → Webhook validates using HMAC-SHA256
3. **Clone/Pull** → Lumen clones or updates `davila7/claude-code-templates` repo
4. **Parse templates** → Reads from `cli-tool/components/{agents,commands,hooks,mcps,settings,skills}/`
5. **Update database** → Upserts parsed templates to PostgreSQL

## Sync Sources

The dashboard now has two sync sources that work together:

| Source | Frequency | What it syncs |
|--------|-----------|---------------|
| GitHub Webhook | Real-time (on push) | Template content from `davila7/claude-code-templates` |
| Hourly Scrape | Every hour | Metrics (downloads, stars) from aitmpl.com |

## Troubleshooting

### Webhook not receiving events
1. Check GitHub webhook delivery history for errors
2. Verify the Payload URL is correct
3. Check Render logs for incoming webhook requests

### Signature verification failing
1. Ensure the secret matches exactly in both GitHub and Render
2. Check `X-Hub-Signature-256` header is present
3. View webhook delivery details in GitHub

### Sync not updating templates
1. Check `/api/webhooks/github/status` for error messages
2. Verify push was to `main` or `master` branch
3. Check Render logs for git clone/pull errors

## Security

- Webhooks are verified using HMAC-SHA256 signatures
- Only `push` events to `main`/`master` branch trigger sync
- Secret should never be committed to git or exposed publicly
