/**
 * Voice Clone Assistant - ElevenLabs TTS Integration
 * 
 * Converts text to speech using ElevenLabs API with support for:
 * - Multiple voice selection
 * - Voice cloning
 * - Speed/stability adjustments
 * - Audio file storage and retrieval
 * 
 * @module voice-clone
 * @author Jimmy & Lumen AI Solutions
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || null;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const AUDIO_STORAGE_DIR = process.env.AUDIO_STORAGE_DIR || './data/audio-files';

// Default voice settings
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true
};

// ============================================
// MOCK DATA (Used when no API key available)
// ============================================

const MOCK_VOICES = [
  {
    voice_id: 'mock-rachel',
    name: 'Rachel',
    category: 'premade',
    description: 'Calm and professional female voice, perfect for briefings',
    labels: { accent: 'american', gender: 'female', age: 'young', use_case: 'narration' },
    preview_url: null,
    available_for_tiers: ['free', 'starter', 'creator', 'pro']
  },
  {
    voice_id: 'mock-adam',
    name: 'Adam',
    category: 'premade',
    description: 'Deep and authoritative male voice, great for announcements',
    labels: { accent: 'american', gender: 'male', age: 'middle_aged', use_case: 'news' },
    preview_url: null,
    available_for_tiers: ['free', 'starter', 'creator', 'pro']
  },
  {
    voice_id: 'mock-bella',
    name: 'Bella',
    category: 'premade',
    description: 'Warm and friendly female voice, ideal for conversational content',
    labels: { accent: 'american', gender: 'female', age: 'young', use_case: 'conversational' },
    preview_url: null,
    available_for_tiers: ['free', 'starter', 'creator', 'pro']
  },
  {
    voice_id: 'mock-josh',
    name: 'Josh',
    category: 'premade',
    description: 'Energetic young male voice, perfect for dynamic content',
    labels: { accent: 'american', gender: 'male', age: 'young', use_case: 'social_media' },
    preview_url: null,
    available_for_tiers: ['free', 'starter', 'creator', 'pro']
  },
  {
    voice_id: 'mock-elli',
    name: 'Elli',
    category: 'premade',
    description: 'Clear and articulate female voice, excellent for educational content',
    labels: { accent: 'american', gender: 'female', age: 'young', use_case: 'narration' },
    preview_url: null,
    available_for_tiers: ['free', 'starter', 'creator', 'pro']
  },
  {
    voice_id: 'mock-arnold',
    name: 'Arnold',
    category: 'premade',
    description: 'Strong and commanding male voice with slight accent',
    labels: { accent: 'british', gender: 'male', age: 'middle_aged', use_case: 'characters' },
    preview_url: null,
    available_for_tiers: ['starter', 'creator', 'pro']
  },
  {
    voice_id: 'mock-domi',
    name: 'Domi',
    category: 'premade',
    description: 'Soft and soothing female voice, great for meditation/ASMR',
    labels: { accent: 'american', gender: 'female', age: 'young', use_case: 'meditation' },
    preview_url: null,
    available_for_tiers: ['starter', 'creator', 'pro']
  },
  {
    voice_id: 'mock-lumen',
    name: 'Lumen',
    category: 'cloned',
    description: 'Custom AI assistant voice - Jimmy\'s personal Lumen voice',
    labels: { accent: 'neutral', gender: 'neutral', age: 'young', use_case: 'assistant' },
    preview_url: null,
    available_for_tiers: ['creator', 'pro'],
    is_custom: true
  }
];

// Mock audio generation stats
let mockStats = {
  totalGenerations: 0,
  totalCharacters: 0,
  lastGeneration: null
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if ElevenLabs API is configured
 */
function isApiConfigured() {
  return !!ELEVENLABS_API_KEY;
}

/**
 * Ensure audio storage directory exists
 */
function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_STORAGE_DIR)) {
    fs.mkdirSync(AUDIO_STORAGE_DIR, { recursive: true });
  }
}

/**
 * Generate a unique audio file ID
 */
function generateAudioId() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Get audio file path from ID
 */
function getAudioPath(audioId) {
  return path.join(AUDIO_STORAGE_DIR, `${audioId}.mp3`);
}

/**
 * Make authenticated request to ElevenLabs API
 */
async function elevenLabsRequest(endpoint, options = {}) {
  const url = `${ELEVENLABS_BASE_URL}${endpoint}`;
  const headers = {
    'xi-api-key': ELEVENLABS_API_KEY,
    'Content-Type': 'application/json',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  return response;
}

// ============================================
// VOICE MANAGEMENT
// ============================================

/**
 * Get list of available voices
 * Returns real voices from ElevenLabs or mock voices if no API key
 */
async function getVoices() {
  if (!isApiConfigured()) {
    console.log('[Voice Clone] No API key - returning mock voices');
    return {
      voices: MOCK_VOICES,
      is_mock: true,
      message: 'Using mock voices. Set ELEVENLABS_API_KEY for real voices.'
    };
  }

  try {
    const response = await elevenLabsRequest('/voices');
    const data = await response.json();
    
    return {
      voices: data.voices.map(voice => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category,
        description: voice.description || voice.labels?.description,
        labels: voice.labels,
        preview_url: voice.preview_url,
        available_for_tiers: voice.available_for_tiers || ['all'],
        is_custom: voice.category === 'cloned'
      })),
      is_mock: false
    };
  } catch (error) {
    console.error('[Voice Clone] Error fetching voices:', error.message);
    throw error;
  }
}

/**
 * Get a specific voice by ID
 */
async function getVoice(voiceId) {
  if (!isApiConfigured()) {
    const voice = MOCK_VOICES.find(v => v.voice_id === voiceId);
    if (!voice) {
      throw new Error(`Voice not found: ${voiceId}`);
    }
    return { voice, is_mock: true };
  }

  try {
    const response = await elevenLabsRequest(`/voices/${voiceId}`);
    const voice = await response.json();
    return { voice, is_mock: false };
  } catch (error) {
    console.error('[Voice Clone] Error fetching voice:', error.message);
    throw error;
  }
}

// ============================================
// TEXT-TO-SPEECH GENERATION
// ============================================

/**
 * Generate speech from text
 * 
 * @param {Object} options - Generation options
 * @param {string} options.text - Text to convert to speech
 * @param {string} [options.voice_id] - Voice ID to use (default: Rachel)
 * @param {number} [options.speed] - Speech speed multiplier (0.5-2.0)
 * @param {number} [options.stability] - Voice stability (0-1)
 * @param {number} [options.similarity_boost] - Similarity to original voice (0-1)
 * @param {string} [options.model_id] - TTS model to use
 * @param {number} [options.briefing_id] - Associated briefing ID
 * @returns {Object} Generation result with audio URL
 */
async function generateSpeech(options) {
  const {
    text,
    voice_id = 'mock-rachel',
    speed = 1.0,
    stability = DEFAULT_VOICE_SETTINGS.stability,
    similarity_boost = DEFAULT_VOICE_SETTINGS.similarity_boost,
    model_id = 'eleven_multilingual_v2',
    briefing_id = null
  } = options;

  if (!text || text.trim().length === 0) {
    throw new Error('Text is required for speech generation');
  }

  // Validate text length (ElevenLabs has limits)
  if (text.length > 5000) {
    throw new Error('Text too long. Maximum 5000 characters per request.');
  }

  // Validate speed
  const normalizedSpeed = Math.max(0.5, Math.min(2.0, speed));

  ensureAudioDir();
  const audioId = generateAudioId();
  const audioPath = getAudioPath(audioId);

  // If no API key, generate mock response
  if (!isApiConfigured()) {
    console.log('[Voice Clone] Mock generation for:', text.substring(0, 50) + '...');
    
    // Update mock stats
    mockStats.totalGenerations++;
    mockStats.totalCharacters += text.length;
    mockStats.lastGeneration = new Date().toISOString();

    // Find voice name
    const voice = MOCK_VOICES.find(v => v.voice_id === voice_id) || MOCK_VOICES[0];

    return {
      success: true,
      is_mock: true,
      audio_id: audioId,
      audio_url: `/api/voice/audio/${audioId}`,
      audio_path: audioPath,
      voice: {
        voice_id: voice.voice_id,
        name: voice.name
      },
      text_length: text.length,
      estimated_duration_seconds: Math.ceil(text.length / 15), // ~15 chars per second
      speed: normalizedSpeed,
      briefing_id,
      generated_at: new Date().toISOString(),
      message: 'Mock audio generated. Set ELEVENLABS_API_KEY for real audio.',
      mock_stats: { ...mockStats }
    };
  }

  // Real ElevenLabs generation
  try {
    console.log(`[Voice Clone] Generating speech with voice ${voice_id}...`);
    
    const response = await elevenLabsRequest(`/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id,
        voice_settings: {
          stability,
          similarity_boost,
          style: DEFAULT_VOICE_SETTINGS.style,
          use_speaker_boost: DEFAULT_VOICE_SETTINGS.use_speaker_boost
        }
      })
    });

    // Get the audio buffer
    const audioBuffer = await response.arrayBuffer();
    
    // Save to file
    fs.writeFileSync(audioPath, Buffer.from(audioBuffer));
    console.log(`[Voice Clone] Audio saved to ${audioPath}`);

    // Get voice details
    const voiceData = await getVoice(voice_id);

    return {
      success: true,
      is_mock: false,
      audio_id: audioId,
      audio_url: `/api/voice/audio/${audioId}`,
      audio_path: audioPath,
      voice: {
        voice_id: voice_id,
        name: voiceData.voice.name
      },
      text_length: text.length,
      file_size_bytes: audioBuffer.byteLength,
      speed: normalizedSpeed,
      briefing_id,
      generated_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Voice Clone] Generation error:', error.message);
    throw error;
  }
}

/**
 * Get stored audio file
 */
function getAudioFile(audioId) {
  const audioPath = getAudioPath(audioId);
  
  if (!fs.existsSync(audioPath)) {
    return null;
  }

  return {
    path: audioPath,
    buffer: fs.readFileSync(audioPath),
    contentType: 'audio/mpeg'
  };
}

/**
 * Delete stored audio file
 */
function deleteAudioFile(audioId) {
  const audioPath = getAudioPath(audioId);
  
  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
    return true;
  }
  
  return false;
}

/**
 * List all stored audio files
 */
function listAudioFiles() {
  ensureAudioDir();
  
  const files = fs.readdirSync(AUDIO_STORAGE_DIR)
    .filter(f => f.endsWith('.mp3'))
    .map(f => {
      const audioId = f.replace('.mp3', '');
      const audioPath = path.join(AUDIO_STORAGE_DIR, f);
      const stats = fs.statSync(audioPath);
      
      return {
        audio_id: audioId,
        audio_url: `/api/voice/audio/${audioId}`,
        file_size_bytes: stats.size,
        created_at: stats.birthtime.toISOString()
      };
    });

  return files;
}

// ============================================
// USAGE & QUOTA (for ElevenLabs accounts)
// ============================================

/**
 * Get account usage statistics
 */
async function getUsage() {
  if (!isApiConfigured()) {
    return {
      is_mock: true,
      mock_stats: mockStats,
      message: 'Using mock mode. Set ELEVENLABS_API_KEY for real usage data.'
    };
  }

  try {
    const response = await elevenLabsRequest('/user/subscription');
    const data = await response.json();
    
    return {
      is_mock: false,
      character_count: data.character_count,
      character_limit: data.character_limit,
      characters_remaining: data.character_limit - data.character_count,
      usage_percentage: ((data.character_count / data.character_limit) * 100).toFixed(1),
      tier: data.tier,
      next_character_count_reset_unix: data.next_character_count_reset_unix
    };
  } catch (error) {
    console.error('[Voice Clone] Error fetching usage:', error.message);
    throw error;
  }
}

// ============================================
// BRIEFING INTEGRATION
// ============================================

/**
 * Generate audio for a briefing
 * Fetches briefing content from database and converts to speech
 */
async function speakBriefing(pool, briefingId, voiceId = 'mock-rachel', speed = 1.0) {
  // Fetch briefing from database
  const result = await pool.query(
    'SELECT id, title, content, summary FROM lumen_briefings WHERE id = $1',
    [briefingId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Briefing not found: ${briefingId}`);
  }

  const briefing = result.rows[0];
  
  // Use summary if available, otherwise use full content (truncated)
  let textToSpeak = briefing.summary || briefing.content;
  
  // Add title as intro
  textToSpeak = `${briefing.title}. ${textToSpeak}`;
  
  // Truncate if too long
  if (textToSpeak.length > 5000) {
    textToSpeak = textToSpeak.substring(0, 4990) + '...';
  }

  // Generate speech
  const audioResult = await generateSpeech({
    text: textToSpeak,
    voice_id: voiceId,
    speed,
    briefing_id: briefingId
  });

  return {
    ...audioResult,
    briefing: {
      id: briefing.id,
      title: briefing.title,
      text_used: textToSpeak.substring(0, 100) + '...'
    }
  };
}

// ============================================
// MODULE EXPORTS
// ============================================

module.exports = {
  // Configuration
  isApiConfigured,
  
  // Voice management
  getVoices,
  getVoice,
  
  // Speech generation
  generateSpeech,
  speakBriefing,
  
  // Audio file management
  getAudioFile,
  deleteAudioFile,
  listAudioFiles,
  
  // Usage
  getUsage,
  
  // Constants
  DEFAULT_VOICE_SETTINGS,
  MOCK_VOICES
};
