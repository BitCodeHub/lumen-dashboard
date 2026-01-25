const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || './data/briefings.json';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Data structure
function getDefaultData() {
  return {
    briefings: [],
    tags: [],
    shares: {},
    nextId: 1
  };
}

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // Migrate old data structure
      if (!data.tags) data.tags = [];
      if (!data.shares) data.shares = {};
      return data;
    }
  } catch (e) {
    console.error('Error reading data:', e);
  }
  return getDefaultData();
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Initialize data file with seed data if empty
function initializeData() {
  const SEED_FILE = './data/seed.json';
  let data;
  
  if (fs.existsSync(DATA_FILE)) {
    data = readData();
  } else {
    data = getDefaultData();
  }
  
  // If database is empty and seed file exists, load seed data
  if (data.briefings.length === 0 && fs.existsSync(SEED_FILE)) {
    try {
      const seedData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      console.log(`[Seed] Loading ${seedData.briefings.length} briefings from seed file...`);
      data = seedData;
      writeData(data);
      console.log('[Seed] Seed data loaded successfully');
    } catch (e) {
      console.error('[Seed] Error loading seed data:', e);
    }
  }
  
  if (!fs.existsSync(DATA_FILE)) {
    writeData(data);
  }
}

initializeData();

// ============================================
// BRIEFINGS API
// ============================================

// Get all briefings with search and filters
app.get('/api/briefings', (req, res) => {
  const { type, limit = 50, starred, archived, tag, q } = req.query;
  const data = readData();
  let results = data.briefings;

  // Filter out archived by default
  if (archived !== 'true') {
    results = results.filter(b => !b.archived);
  } else if (archived === 'only') {
    results = results.filter(b => b.archived);
  }

  if (type) {
    results = results.filter(b => b.type === type);
  }
  if (starred === 'true') {
    results = results.filter(b => b.starred);
  }
  if (tag) {
    results = results.filter(b => b.tags && b.tags.includes(tag));
  }
  
  // Full-text search
  if (q) {
    const query = q.toLowerCase();
    results = results.filter(b => 
      b.title.toLowerCase().includes(query) ||
      b.content.toLowerCase().includes(query) ||
      (b.summary && b.summary.toLowerCase().includes(query)) ||
      (b.tags && b.tags.some(t => t.toLowerCase().includes(query)))
    );
  }

  results = results
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, parseInt(limit));

  res.json(results);
});

// Get single briefing
app.get('/api/briefings/:id', (req, res) => {
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  // Mark as read
  briefing.read = true;
  briefing.read_at = new Date().toISOString();
  writeData(data);
  
  res.json(briefing);
});

// Add new briefing
app.post('/api/briefings', (req, res) => {
  const { type, title, content, summary, tags } = req.body;
  
  if (!type || !title || !content) {
    return res.status(400).json({ error: 'Missing required fields: type, title, content' });
  }

  const data = readData();
  const newBriefing = {
    id: data.nextId++,
    type,
    title,
    content,
    summary: summary || null,
    tags: tags || [],
    created_at: new Date().toISOString(),
    read: false,
    read_at: null,
    starred: false,
    archived: false
  };
  
  data.briefings.push(newBriefing);
  writeData(data);

  res.json({ id: newBriefing.id, message: 'Briefing added successfully' });
});

// Update briefing
app.patch('/api/briefings/:id', (req, res) => {
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  const { title, content, summary, tags } = req.body;
  if (title) briefing.title = title;
  if (content) briefing.content = content;
  if (summary !== undefined) briefing.summary = summary;
  if (tags) briefing.tags = tags;
  
  briefing.updated_at = new Date().toISOString();
  writeData(data);
  
  res.json(briefing);
});

// Toggle starred
app.patch('/api/briefings/:id/star', (req, res) => {
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  briefing.starred = !briefing.starred;
  writeData(data);
  
  res.json({ starred: briefing.starred });
});

// Archive briefing (soft delete)
app.patch('/api/briefings/:id/archive', (req, res) => {
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  briefing.archived = !briefing.archived;
  briefing.archived_at = briefing.archived ? new Date().toISOString() : null;
  writeData(data);
  
  res.json({ archived: briefing.archived });
});

// Delete briefing (permanent)
app.delete('/api/briefings/:id', (req, res) => {
  const data = readData();
  const index = data.briefings.findIndex(b => b.id === parseInt(req.params.id));
  
  if (index !== -1) {
    // Also remove any shares
    delete data.shares[req.params.id];
    data.briefings.splice(index, 1);
    writeData(data);
  }
  
  res.json({ message: 'Briefing deleted' });
});

// ============================================
// TAGS API
// ============================================

// Get all tags
app.get('/api/tags', (req, res) => {
  const data = readData();
  
  // Collect all unique tags from briefings
  const tagCounts = {};
  data.briefings.forEach(b => {
    if (b.tags) {
      b.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  
  const tags = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  
  res.json(tags);
});

// Add tag to briefing
app.post('/api/briefings/:id/tags', (req, res) => {
  const { tag } = req.body;
  if (!tag) {
    return res.status(400).json({ error: 'Tag is required' });
  }
  
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  if (!briefing.tags) briefing.tags = [];
  if (!briefing.tags.includes(tag)) {
    briefing.tags.push(tag);
    writeData(data);
  }
  
  res.json({ tags: briefing.tags });
});

// Remove tag from briefing
app.delete('/api/briefings/:id/tags/:tag', (req, res) => {
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  if (briefing.tags) {
    briefing.tags = briefing.tags.filter(t => t !== req.params.tag);
    writeData(data);
  }
  
  res.json({ tags: briefing.tags || [] });
});

// ============================================
// SHARE API
// ============================================

// Create share link
app.post('/api/briefings/:id/share', (req, res) => {
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  // Generate unique share token
  const token = crypto.randomBytes(16).toString('hex');
  data.shares[req.params.id] = {
    token,
    created_at: new Date().toISOString(),
    views: 0
  };
  writeData(data);
  
  const shareUrl = `${req.protocol}://${req.get('host')}/share/${token}`;
  res.json({ shareUrl, token });
});

// Revoke share link
app.delete('/api/briefings/:id/share', (req, res) => {
  const data = readData();
  delete data.shares[req.params.id];
  writeData(data);
  res.json({ message: 'Share link revoked' });
});

// View shared briefing
app.get('/api/share/:token', (req, res) => {
  const data = readData();
  
  // Find briefing by share token
  let briefingId = null;
  for (const [id, share] of Object.entries(data.shares)) {
    if (share.token === req.params.token) {
      briefingId = parseInt(id);
      share.views++;
      break;
    }
  }
  
  if (!briefingId) {
    return res.status(404).json({ error: 'Share link not found or expired' });
  }
  
  const briefing = data.briefings.find(b => b.id === briefingId);
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  writeData(data);
  
  // Return limited briefing data for share
  res.json({
    title: briefing.title,
    type: briefing.type,
    content: briefing.content,
    summary: briefing.summary,
    created_at: briefing.created_at
  });
});

// ============================================
// EXPORT API
// ============================================

// Export briefing as markdown
app.get('/api/briefings/:id/export', (req, res) => {
  const { format = 'markdown' } = req.query;
  const data = readData();
  const briefing = data.briefings.find(b => b.id === parseInt(req.params.id));
  
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing not found' });
  }
  
  if (format === 'markdown') {
    const md = `# ${briefing.title}

**Type:** ${briefing.type}  
**Date:** ${new Date(briefing.created_at).toLocaleString()}  
${briefing.tags && briefing.tags.length ? `**Tags:** ${briefing.tags.join(', ')}` : ''}

---

${briefing.summary ? `## Summary\n\n${briefing.summary}\n\n---\n\n` : ''}
${briefing.content}
`;
    
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="briefing-${briefing.id}.md"`);
    res.send(md);
  } else if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="briefing-${briefing.id}.json"`);
    res.json(briefing);
  } else {
    res.status(400).json({ error: 'Unsupported format. Use markdown or json.' });
  }
});

// Export all briefings
app.get('/api/export', (req, res) => {
  const { format = 'json' } = req.query;
  const data = readData();
  
  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="lumen-briefings-${Date.now()}.json"`);
    res.json(data.briefings);
  } else {
    res.status(400).json({ error: 'Unsupported format for bulk export. Use json.' });
  }
});

// ============================================
// ANALYTICS API
// ============================================

app.get('/api/analytics', (req, res) => {
  const data = readData();
  const briefings = data.briefings.filter(b => !b.archived);
  
  // Basic stats
  const total = briefings.length;
  const unread = briefings.filter(b => !b.read).length;
  const starred = briefings.filter(b => b.starred).length;
  const archived = data.briefings.filter(b => b.archived).length;
  
  // By type
  const byType = {};
  briefings.forEach(b => {
    byType[b.type] = (byType[b.type] || 0) + 1;
  });
  
  // By day (last 30 days)
  const byDay = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    byDay[key] = 0;
  }
  briefings.forEach(b => {
    const key = b.created_at.split('T')[0];
    if (byDay.hasOwnProperty(key)) {
      byDay[key]++;
    }
  });
  
  // By hour
  const byHour = Array(24).fill(0);
  briefings.forEach(b => {
    const hour = new Date(b.created_at).getHours();
    byHour[hour]++;
  });
  
  // Read rate
  const readRate = total > 0 ? ((total - unread) / total * 100).toFixed(1) : 0;
  
  // Top tags
  const tagCounts = {};
  briefings.forEach(b => {
    if (b.tags) {
      b.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  
  // Recent activity
  const recentlyRead = briefings
    .filter(b => b.read_at)
    .sort((a, b) => new Date(b.read_at) - new Date(a.read_at))
    .slice(0, 5)
    .map(b => ({ id: b.id, title: b.title, read_at: b.read_at }));
  
  res.json({
    total,
    unread,
    starred,
    archived,
    readRate: parseFloat(readRate),
    byType,
    byDay,
    byHour,
    topTags,
    recentlyRead
  });
});

// ============================================
// STATS API (simple)
// ============================================

app.get('/api/stats', (req, res) => {
  const data = readData();
  const briefings = data.briefings.filter(b => !b.archived);
  const total = briefings.length;
  const unread = briefings.filter(b => !b.read).length;
  const starred = briefings.filter(b => b.starred).length;
  
  const byType = {};
  briefings.forEach(b => {
    byType[b.type] = (byType[b.type] || 0) + 1;
  });
  
  res.json({ total, unread, starred, byType });
});

// ============================================
// HEALTH & MISC
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// Serve shared briefing page
app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// PWA manifest
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Lumen Dashboard',
    short_name: 'Lumen',
    description: 'Intelligence briefings and research dashboard',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0c0e',
    theme_color: '#6366f1',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🔆 Lumen Dashboard v2.0 running on port ${PORT}`);
});
