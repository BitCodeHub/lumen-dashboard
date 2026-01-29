# 🎙️ Voice Clone Assistant API

> ElevenLabs TTS Integration for Lumen Dashboard
> **Version:** 1.0.0

Convert any text content to natural-sounding speech using ElevenLabs' AI voices. Perfect for making briefings, notifications, and content audible.

---

## Quick Start

```bash
# Generate speech from text
curl -X POST http://localhost:3000/api/voice/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello! This is your daily briefing from Lumen."}'

# List available voices
curl http://localhost:3000/api/voice/voices

# Make a briefing audible
curl -X POST http://localhost:3000/api/voice/briefing/123/speak
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ELEVENLABS_API_KEY` | Your ElevenLabs API key | `null` (mock mode) |
| `AUDIO_STORAGE_DIR` | Where to store audio files | `./data/audio-files` |

### Mock Mode

If `ELEVENLABS_API_KEY` is not set, the API runs in **mock mode**:
- Returns simulated responses
- No actual audio is generated
- Useful for development and testing
- All endpoints work the same way

---

## API Reference

### Check Service Status

```http
GET /api/voice/status
```

**Response:**
```json
{
  "service": "Voice Clone Assistant",
  "version": "1.0.0",
  "status": "operational",
  "api_configured": false,
  "mode": "mock",
  "audio_files_count": 0,
  "endpoints": {
    "speak": "POST /api/voice/speak",
    "voices": "GET /api/voice/voices",
    "audio": "GET /api/voice/audio/:audioId",
    "usage": "GET /api/voice/usage",
    "briefing": "POST /api/voice/briefing/:briefingId/speak"
  }
}
```

---

### List Available Voices

```http
GET /api/voice/voices
```

**Response:**
```json
{
  "voices": [
    {
      "voice_id": "mock-rachel",
      "name": "Rachel",
      "category": "premade",
      "description": "Calm and professional female voice, perfect for briefings",
      "labels": {
        "accent": "american",
        "gender": "female",
        "age": "young",
        "use_case": "narration"
      }
    }
  ],
  "is_mock": true,
  "message": "Using mock voices. Set ELEVENLABS_API_KEY for real voices."
}
```

---

### Get Specific Voice

```http
GET /api/voice/voices/:voiceId
```

**Example:**
```bash
curl http://localhost:3000/api/voice/voices/mock-rachel
```

---

### Generate Speech 🔊

```http
POST /api/voice/speak
```

**Request Body:**
```json
{
  "text": "Your text to convert to speech",
  "voice_id": "mock-rachel",
  "speed": 1.0,
  "stability": 0.5,
  "similarity_boost": 0.75,
  "briefing_id": null
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | ✅ Yes | - | Text to convert (max 5000 chars) |
| `voice_id` | string | No | `mock-rachel` | Voice to use |
| `speed` | number | No | `1.0` | Speed multiplier (0.5-2.0) |
| `stability` | number | No | `0.5` | Voice stability (0-1) |
| `similarity_boost` | number | No | `0.75` | Voice similarity (0-1) |
| `briefing_id` | number | No | `null` | Link to briefing |

**Response:**
```json
{
  "success": true,
  "is_mock": true,
  "audio_id": "a1b2c3d4e5f6",
  "audio_url": "/api/voice/audio/a1b2c3d4e5f6",
  "voice": {
    "voice_id": "mock-rachel",
    "name": "Rachel"
  },
  "text_length": 37,
  "estimated_duration_seconds": 3,
  "speed": 1.0,
  "generated_at": "2025-01-28T10:30:00.000Z",
  "message": "Mock audio generated. Set ELEVENLABS_API_KEY for real audio."
}
```

---

### Speak a Briefing 📋

Convert an existing briefing to audio.

```http
POST /api/voice/briefing/:briefingId/speak
```

**Request Body:**
```json
{
  "voice_id": "mock-adam",
  "speed": 1.2
}
```

**Response:**
```json
{
  "success": true,
  "audio_id": "x1y2z3a4b5c6",
  "audio_url": "/api/voice/audio/x1y2z3a4b5c6",
  "voice": {
    "voice_id": "mock-adam",
    "name": "Adam"
  },
  "briefing": {
    "id": 123,
    "title": "Morning Intelligence Briefing",
    "text_used": "Morning Intelligence Briefing. Today's key updates include..."
  }
}
```

---

### Retrieve Audio File

```http
GET /api/voice/audio/:audioId
```

Returns the MP3 audio file directly. Use in `<audio>` tags:

```html
<audio controls>
  <source src="/api/voice/audio/a1b2c3d4e5f6" type="audio/mpeg">
</audio>
```

---

### List All Audio Files

```http
GET /api/voice/audio
```

**Response:**
```json
{
  "count": 5,
  "files": [
    {
      "audio_id": "a1b2c3d4e5f6",
      "audio_url": "/api/voice/audio/a1b2c3d4e5f6",
      "file_size_bytes": 45678,
      "created_at": "2025-01-28T10:30:00.000Z"
    }
  ]
}
```

---

### Delete Audio File

```http
DELETE /api/voice/audio/:audioId
```

**Response:**
```json
{
  "success": true,
  "message": "Audio file deleted"
}
```

---

### Get Usage Statistics

```http
GET /api/voice/usage
```

**Response (Mock Mode):**
```json
{
  "is_mock": true,
  "mock_stats": {
    "totalGenerations": 15,
    "totalCharacters": 3500,
    "lastGeneration": "2025-01-28T10:30:00.000Z"
  },
  "message": "Using mock mode. Set ELEVENLABS_API_KEY for real usage data."
}
```

**Response (Live Mode):**
```json
{
  "is_mock": false,
  "character_count": 45000,
  "character_limit": 100000,
  "characters_remaining": 55000,
  "usage_percentage": "45.0",
  "tier": "starter",
  "next_character_count_reset_unix": 1706486400
}
```

---

## Available Voices (Mock Mode)

| Voice ID | Name | Style | Best For |
|----------|------|-------|----------|
| `mock-rachel` | Rachel | Professional | Briefings, Narration |
| `mock-adam` | Adam | Authoritative | Announcements, News |
| `mock-bella` | Bella | Friendly | Conversational |
| `mock-josh` | Josh | Energetic | Social Media, Dynamic |
| `mock-elli` | Elli | Clear | Educational |
| `mock-arnold` | Arnold | Commanding | Characters |
| `mock-domi` | Domi | Soothing | Meditation |
| `mock-lumen` | Lumen | AI Assistant | Custom Lumen voice |

---

## Integration Examples

### JavaScript/Frontend

```javascript
// Generate speech and play it
async function speakText(text) {
  const response = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_id: 'mock-rachel',
      speed: 1.0
    })
  });
  
  const result = await response.json();
  
  if (result.success && !result.is_mock) {
    const audio = new Audio(result.audio_url);
    audio.play();
  }
  
  return result;
}

// Speak a briefing
async function speakBriefing(briefingId) {
  const response = await fetch(`/api/voice/briefing/${briefingId}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_id: 'mock-adam' })
  });
  
  return response.json();
}
```

### cURL Examples

```bash
# Quick speak
curl -X POST http://localhost:3000/api/voice/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "The markets are up today."}'

# Speak with custom voice and speed
curl -X POST http://localhost:3000/api/voice/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Breaking news from your AI assistant.",
    "voice_id": "mock-adam",
    "speed": 1.2
  }'

# Download audio file
curl http://localhost:3000/api/voice/audio/a1b2c3d4e5f6 -o briefing.mp3
```

---

## Error Handling

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Text is required` | Missing text in request body |
| 400 | `Text too long` | Text exceeds 5000 characters |
| 404 | `Voice not found` | Invalid voice_id |
| 404 | `Briefing not found` | Invalid briefing_id |
| 404 | `Audio file not found` | Invalid audio_id |
| 500 | `ElevenLabs API error` | External API failure |

---

## Going Live

To switch from mock mode to real ElevenLabs audio:

1. **Get an API Key:** Sign up at [elevenlabs.io](https://elevenlabs.io)
2. **Set Environment Variable:**
   ```bash
   export ELEVENLABS_API_KEY="your-api-key-here"
   ```
3. **Restart the server**
4. **Verify:** `GET /api/voice/status` should show `"mode": "live"`

### ElevenLabs Tiers

| Tier | Characters/Month | Cost |
|------|-----------------|------|
| Free | 10,000 | $0 |
| Starter | 30,000 | $5/mo |
| Creator | 100,000 | $22/mo |
| Pro | 500,000 | $99/mo |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Voice Clone API                       │
├─────────────────────────────────────────────────────────┤
│  POST /api/voice/speak                                  │
│       ↓                                                 │
│  ┌─────────────────┐    ┌─────────────────────────┐    │
│  │  voice-clone.js │───▶│  ElevenLabs API         │    │
│  │  (module)       │    │  (or Mock Generator)    │    │
│  └─────────────────┘    └─────────────────────────┘    │
│       ↓                                                 │
│  ┌─────────────────┐                                   │
│  │  ./data/audio   │ ← Audio files stored here         │
│  │  -files/*.mp3   │                                   │
│  └─────────────────┘                                   │
├─────────────────────────────────────────────────────────┤
│  GET /api/voice/audio/:id → Returns MP3 file           │
└─────────────────────────────────────────────────────────┘
```

---

## Changelog

### v1.0.0 (2025-01-28)
- ✅ Initial release
- ✅ ElevenLabs API integration
- ✅ Mock mode for development
- ✅ 8 premade voices + custom Lumen voice
- ✅ Briefing integration
- ✅ Audio file storage and retrieval
- ✅ Usage tracking

---

**Built by Jimmy & Lumen AI Solutions** 🎙️✨
