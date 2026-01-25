const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || './data/briefings.json';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Simple JSON database
function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading data:', e);
  }
  return { briefings: [], nextId: 1 };
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Initialize data file
if (!fs.existsSync(DATA_FILE)) {
  writeData({ briefings: [], nextId: 1 });
}

// API Routes

// Get all briefings
app.get('/api/briefings', (req, res) => {
  const { type, limit = 50, starred } = req.query;
  const data = readData();
  let results = data.briefings;

  if (type) {
    results = results.filter(b => b.type === type);
  }
  if (starred === 'true') {
    results = results.filter(b => b.starred);
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
  writeData(data);
  
  res.json(briefing);
});

// Add new briefing
app.post('/api/briefings', (req, res) => {
  const { type, title, content, summary } = req.body;
  
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
    created_at: new Date().toISOString(),
    read: false,
    starred: false
  };
  
  data.briefings.push(newBriefing);
  writeData(data);

  res.json({ id: newBriefing.id, message: 'Briefing added successfully' });
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

// Delete briefing
app.delete('/api/briefings/:id', (req, res) => {
  const data = readData();
  const index = data.briefings.findIndex(b => b.id === parseInt(req.params.id));
  
  if (index !== -1) {
    data.briefings.splice(index, 1);
    writeData(data);
  }
  
  res.json({ message: 'Briefing deleted' });
});

// Get stats
app.get('/api/stats', (req, res) => {
  const data = readData();
  const total = data.briefings.length;
  const unread = data.briefings.filter(b => !b.read).length;
  const starred = data.briefings.filter(b => b.starred).length;
  
  const byType = {};
  data.briefings.forEach(b => {
    byType[b.type] = (byType[b.type] || 0) + 1;
  });
  
  res.json({ total, unread, starred, byType });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend - explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🔆 Briefing Dashboard running on port ${PORT}`);
});
