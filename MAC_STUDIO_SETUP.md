# Mac Studio File Server Setup

## Overview

The Mac Studio serves files directly to the Lumen Dashboard, avoiding Render's ephemeral storage.

## Architecture

```
User → Dashboard (Render) → Mac Studio File Server (Tailscale) → Files
```

## File Server

**Location:** `/Users/jimmysmacstudio/clawd/services/file-server/`

**Running:** Port 18801 on Mac Studio

**Start server:**
```bash
cd /Users/jimmysmacstudio/clawd/services/file-server
npm start
```

**Endpoints:**
- `GET /health` - Health check
- `GET /download?path=<file>` - Download file (requires API key)
- `GET /files?dir=<path>` - List files (requires API key)
- `GET /info?path=<file>` - Get file info (requires API key)

**Authentication:** X-API-Key header

## Dashboard Configuration

**Environment Variable (Render):**
```
MAC_STUDIO_FILE_SERVER=http://100.102.204.66:18801
```

Replace `100.102.204.66` with your Mac Studio's Tailscale IP.

**Get Tailscale IP:**
```bash
tailscale ip -4
```

## Tailscale Setup

1. Install Tailscale on Mac Studio (already done)
2. Install Tailscale on Render (add to build):
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up --authkey=<key>
   ```

3. Get Tailscale auth key from: https://login.tailscale.com/admin/settings/keys

4. Add to Render environment:
   ```
   TAILSCALE_AUTHKEY=tskey-auth-...
   ```

## Testing Locally

**Test file server:**
```bash
curl -H "X-API-Key: 5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69" \
  "http://localhost:18801/health"
```

**Test download:**
```bash
curl -H "X-API-Key: 5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69" \
  "http://localhost:18801/download?path=/Users/jimmysmacstudio/Downloads/hyundai-ev-videos/pdfs/P01.pdf" \
  -o test.pdf
```

## File Paths

Documents in database store **full Mac Studio paths**:
```
/Users/jimmysmacstudio/Downloads/hyundai-ev-videos/pdfs/P01.pdf
```

Dashboard proxies downloads through Mac Studio file server.

## Benefits

✅ Files never deleted (permanent storage)
✅ No re-uploads after deployments
✅ No storage costs (S3, Render Disk)
✅ Private/secure via Tailscale
✅ Can serve any files from Mac Studio

## Monitoring

**Check file server status:**
```bash
curl http://localhost:18801/health
```

**Check if running:**
```bash
ps aux | grep "node server.js" | grep 18801
```

**Restart if needed:**
```bash
cd /Users/jimmysmacstudio/clawd/services/file-server
npm start
```

## Troubleshooting

**Port already in use:**
- Check if Chrome debugging is using port 18800
- File server uses 18801 instead

**Tailscale not connecting:**
- Check `tailscale status`
- Verify auth key is valid
- Check Render logs for Tailscale errors

**Files not downloading:**
- Check file paths in database match Mac Studio paths
- Verify API key matches between dashboard and file server
- Check Mac Studio file server logs
