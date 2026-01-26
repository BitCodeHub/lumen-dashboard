const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Excel file storage (still uses filesystem for actual files)
const EXCEL_UPLOAD_DIR = process.env.EXCEL_UPLOAD_DIR || './data/excel-files';

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));
app.use('/excel-files', express.static(EXCEL_UPLOAD_DIR));

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create briefings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_briefings (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP,
        read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        starred BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE,
        archived_at TIMESTAMP
      )
    `);

    // Create shares table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_shares (
        id SERIAL PRIMARY KEY,
        briefing_id INTEGER REFERENCES lumen_briefings(id) ON DELETE CASCADE,
        token VARCHAR(64) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        views INTEGER DEFAULT 0
      )
    `);

    // Create expenses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_expenses (
        id SERIAL PRIMARY KEY,
        amount DECIMAL(10,2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        vendor VARCHAR(255),
        date TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Create categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    // Insert default categories
    const defaultCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Gas', 'Groceries', 'Other'];
    for (const cat of defaultCategories) {
      await client.query(
        'INSERT INTO lumen_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [cat]
      );
    }

    // Create excel files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_excel_files (
        id SERIAL PRIMARY KEY,
        original_filename VARCHAR(255) NOT NULL,
        stored_filename VARCHAR(255) NOT NULL,
        processed_filename VARCHAR(255),
        size INTEGER,
        instructions TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        status_message TEXT DEFAULT 'Awaiting processing',
        preview_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP,
        updated_at TIMESTAMP,
        error TEXT
      )
    `);

    console.log('[DB] PostgreSQL tables initialized');
  } finally {
    client.release();
  }
}

// Initialize database and excel directory
if (!fs.existsSync(EXCEL_UPLOAD_DIR)) {
  fs.mkdirSync(EXCEL_UPLOAD_DIR, { recursive: true });
}

initDatabase().catch(err => {
  console.error('[DB] Failed to initialize database:', err);
});

// ============================================
// BRIEFINGS API
// ============================================

// Get all briefings with search and filters
app.get('/api/briefings', async (req, res) => {
  try {
    const { type, limit = 50, starred, archived, tag, q } = req.query;
    
    let query = 'SELECT * FROM lumen_briefings WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Filter out archived by default
    if (archived !== 'true' && archived !== 'only') {
      query += ' AND (archived = FALSE OR archived IS NULL)';
    } else if (archived === 'only') {
      query += ' AND archived = TRUE';
    }

    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    if (starred === 'true') {
      query += ' AND starred = TRUE';
    }

    if (tag) {
      paramCount++;
      query += ` AND $${paramCount} = ANY(tags)`;
      params.push(tag);
    }

    if (q) {
      paramCount++;
      const searchParam = `%${q.toLowerCase()}%`;
      query += ` AND (LOWER(title) LIKE $${paramCount} OR LOWER(content) LIKE $${paramCount} OR LOWER(summary) LIKE $${paramCount})`;
      params.push(searchParam);
    }

    query += ' ORDER BY created_at DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting briefings:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single briefing
app.get('/api/briefings/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_briefings SET read = TRUE, read_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error getting briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add new briefing
app.post('/api/briefings', async (req, res) => {
  try {
    const { type, title, content, summary, tags } = req.body;
    
    if (!type || !title || !content) {
      return res.status(400).json({ error: 'Missing required fields: type, title, content' });
    }

    const result = await pool.query(
      `INSERT INTO lumen_briefings (type, title, content, summary, tags) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [type, title, content, summary || null, tags || []]
    );

    res.json({ id: result.rows[0].id, message: 'Briefing added successfully' });
  } catch (err) {
    console.error('Error adding briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update briefing
app.patch('/api/briefings/:id', async (req, res) => {
  try {
    const { title, content, summary, tags } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (title) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      params.push(title);
    }
    if (content) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      params.push(content);
    }
    if (summary !== undefined) {
      paramCount++;
      updates.push(`summary = $${paramCount}`);
      params.push(summary);
    }
    if (tags) {
      paramCount++;
      updates.push(`tags = $${paramCount}`);
      params.push(tags);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    paramCount++;
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE lumen_briefings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Toggle starred
app.patch('/api/briefings/:id/star', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_briefings SET starred = NOT starred WHERE id = $1 RETURNING starred',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json({ starred: result.rows[0].starred });
  } catch (err) {
    console.error('Error toggling star:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Archive briefing
app.patch('/api/briefings/:id/archive', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE lumen_briefings 
       SET archived = NOT archived, 
           archived_at = CASE WHEN archived THEN NULL ELSE NOW() END 
       WHERE id = $1 RETURNING archived`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json({ archived: result.rows[0].archived });
  } catch (err) {
    console.error('Error archiving briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete briefing
app.delete('/api/briefings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_briefings WHERE id = $1', [req.params.id]);
    res.json({ message: 'Briefing deleted' });
  } catch (err) {
    console.error('Error deleting briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// TAGS API
// ============================================

app.get('/api/tags', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT unnest(tags) as name, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY name 
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting tags:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add tag to briefing
app.post('/api/briefings/:id/tags', async (req, res) => {
  try {
    const { tag } = req.body;
    if (!tag) {
      return res.status(400).json({ error: 'Tag is required' });
    }

    const result = await pool.query(
      'UPDATE lumen_briefings SET tags = array_append(tags, $1) WHERE id = $2 AND NOT ($1 = ANY(tags)) RETURNING tags',
      [tag, req.params.id]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query('SELECT tags FROM lumen_briefings WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Briefing not found' });
      }
      return res.json({ tags: existing.rows[0].tags });
    }

    res.json({ tags: result.rows[0].tags });
  } catch (err) {
    console.error('Error adding tag:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Remove tag from briefing
app.delete('/api/briefings/:id/tags/:tag', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_briefings SET tags = array_remove(tags, $1) WHERE id = $2 RETURNING tags',
      [req.params.tag, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json({ tags: result.rows[0].tags });
  } catch (err) {
    console.error('Error removing tag:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// SHARE API
// ============================================

app.post('/api/briefings/:id/share', async (req, res) => {
  try {
    const token = crypto.randomBytes(16).toString('hex');
    
    await pool.query(
      'INSERT INTO lumen_shares (briefing_id, token) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, token]
    );

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${token}`;
    res.json({ shareUrl, token });
  } catch (err) {
    console.error('Error creating share:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/briefings/:id/share', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_shares WHERE briefing_id = $1', [req.params.id]);
    res.json({ message: 'Share link revoked' });
  } catch (err) {
    console.error('Error revoking share:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/share/:token', async (req, res) => {
  try {
    const shareResult = await pool.query(
      'UPDATE lumen_shares SET views = views + 1 WHERE token = $1 RETURNING briefing_id',
      [req.params.token]
    );

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    const briefingResult = await pool.query(
      'SELECT title, type, content, summary, created_at FROM lumen_briefings WHERE id = $1',
      [shareResult.rows[0].briefing_id]
    );

    if (briefingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json(briefingResult.rows[0]);
  } catch (err) {
    console.error('Error getting shared briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// EXPORT API
// ============================================

app.get('/api/briefings/:id/export', async (req, res) => {
  try {
    const { format = 'markdown' } = req.query;
    const result = await pool.query('SELECT * FROM lumen_briefings WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    const briefing = result.rows[0];

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
  } catch (err) {
    console.error('Error exporting briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/export', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_briefings ORDER BY created_at DESC');
    res.setHeader('Content-Disposition', `attachment; filename="lumen-briefings-${Date.now()}.json"`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error exporting all:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// ANALYTICS API
// ============================================

app.get('/api/analytics', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE archived = FALSE OR archived IS NULL) as total,
        COUNT(*) FILTER (WHERE read = FALSE AND (archived = FALSE OR archived IS NULL)) as unread,
        COUNT(*) FILTER (WHERE starred = TRUE AND (archived = FALSE OR archived IS NULL)) as starred,
        COUNT(*) FILTER (WHERE archived = TRUE) as archived
      FROM lumen_briefings
    `);

    const byType = await pool.query(`
      SELECT type, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY type
    `);

    const byDay = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM lumen_briefings
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    const topTags = await pool.query(`
      SELECT unnest(tags) as name, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY name 
      ORDER BY count DESC
      LIMIT 10
    `);

    const s = stats.rows[0];
    const readRate = s.total > 0 ? ((s.total - s.unread) / s.total * 100).toFixed(1) : 0;

    res.json({
      total: parseInt(s.total),
      unread: parseInt(s.unread),
      starred: parseInt(s.starred),
      archived: parseInt(s.archived),
      readRate: parseFloat(readRate),
      byType: byType.rows.reduce((acc, r) => { acc[r.type] = parseInt(r.count); return acc; }, {}),
      byDay: byDay.rows.reduce((acc, r) => { acc[r.date.toISOString().split('T')[0]] = parseInt(r.count); return acc; }, {}),
      topTags: topTags.rows.map(r => ({ name: r.name, count: parseInt(r.count) }))
    });
  } catch (err) {
    console.error('Error getting analytics:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE archived = FALSE OR archived IS NULL) as total,
        COUNT(*) FILTER (WHERE read = FALSE AND (archived = FALSE OR archived IS NULL)) as unread,
        COUNT(*) FILTER (WHERE starred = TRUE AND (archived = FALSE OR archived IS NULL)) as starred
      FROM lumen_briefings
    `);

    const byType = await pool.query(`
      SELECT type, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY type
    `);

    const s = stats.rows[0];
    res.json({
      total: parseInt(s.total),
      unread: parseInt(s.unread),
      starred: parseInt(s.starred),
      byType: byType.rows.reduce((acc, r) => { acc[r.type] = parseInt(r.count); return acc; }, {})
    });
  } catch (err) {
    console.error('Error getting stats:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// EXPENSES API
// ============================================

app.get('/api/expenses', async (req, res) => {
  try {
    let { month, year, category, limit = 100 } = req.query;
    
    let query = 'SELECT * FROM lumen_expenses WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Support YYYY-MM format
    if (month && month.includes('-')) {
      const [y, m] = month.split('-').map(Number);
      year = y;
      month = m;
    }

    if (month && year) {
      paramCount++;
      query += ` AND EXTRACT(MONTH FROM date) = $${paramCount}`;
      params.push(parseInt(month));
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM date) = $${paramCount}`;
      params.push(parseInt(year));
    } else if (year) {
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM date) = $${paramCount}`;
      params.push(parseInt(year));
    }

    if (category) {
      paramCount++;
      query += ` AND LOWER(category) = LOWER($${paramCount})`;
      params.push(category);
    }

    query += ' ORDER BY date DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting expenses:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/expenses/summary', async (req, res) => {
  try {
    const now = new Date();
    let month, year;
    
    if (req.query.month && req.query.month.includes('-')) {
      const [y, m] = req.query.month.split('-').map(Number);
      year = y;
      month = m;
    } else {
      month = parseInt(req.query.month) || now.getMonth() + 1;
      year = parseInt(req.query.year) || now.getFullYear();
    }

    const summary = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as count
      FROM lumen_expenses 
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
    `, [month, year]);

    const byCategory = await pool.query(`
      SELECT category, SUM(amount) as total
      FROM lumen_expenses 
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
      GROUP BY category
    `, [month, year]);

    const recent = await pool.query(`
      SELECT * FROM lumen_expenses 
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
      ORDER BY date DESC LIMIT 10
    `, [month, year]);

    const s = summary.rows[0];
    res.json({
      month,
      year,
      total: Math.round(parseFloat(s.total) * 100) / 100,
      count: parseInt(s.count),
      byCategory: byCategory.rows.reduce((acc, r) => { 
        acc[r.category] = Math.round(parseFloat(r.total) * 100) / 100; 
        return acc; 
      }, {}),
      recentExpenses: recent.rows
    });
  } catch (err) {
    console.error('Error getting expense summary:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { amount, category, description, vendor, date } = req.body;
    
    if (!amount || !category) {
      return res.status(400).json({ error: 'Missing required fields: amount, category' });
    }

    const result = await pool.query(
      `INSERT INTO lumen_expenses (amount, category, description, vendor, date) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [parseFloat(amount), category, description || '', vendor || null, date || new Date()]
    );

    // Add category if new
    await pool.query(
      'INSERT INTO lumen_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [category]
    );

    res.json({ id: result.rows[0].id, message: 'Expense added successfully', expense: result.rows[0] });
  } catch (err) {
    console.error('Error adding expense:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/expenses/:id', async (req, res) => {
  try {
    const { amount, category, description, vendor, date } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (amount !== undefined) {
      paramCount++;
      updates.push(`amount = $${paramCount}`);
      params.push(parseFloat(amount));
    }
    if (category) {
      paramCount++;
      updates.push(`category = $${paramCount}`);
      params.push(category);
    }
    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }
    if (vendor !== undefined) {
      paramCount++;
      updates.push(`vendor = $${paramCount}`);
      params.push(vendor);
    }
    if (date) {
      paramCount++;
      updates.push(`date = $${paramCount}`);
      params.push(date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    paramCount++;
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE lumen_expenses SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_expenses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/expenses/vendors', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vendor as name, COUNT(*) as count, SUM(amount) as total
      FROM lumen_expenses 
      WHERE vendor IS NOT NULL AND vendor != ''
      GROUP BY vendor
      ORDER BY total DESC
    `);

    res.json(result.rows.map(v => ({
      name: v.name,
      count: parseInt(v.count),
      total: Math.round(parseFloat(v.total) * 100) / 100,
      avg: Math.round((parseFloat(v.total) / parseInt(v.count)) * 100) / 100
    })));
  } catch (err) {
    console.error('Error getting vendors:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/expenses/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM lumen_categories ORDER BY name');
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    console.error('Error getting categories:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// EXCEL API
// ============================================

app.get('/api/excel', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM lumen_excel_files WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting excel files:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/excel/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'error') as error
      FROM lumen_excel_files
    `);

    const s = result.rows[0];
    res.json({
      total: parseInt(s.total),
      pending: parseInt(s.pending),
      processing: parseInt(s.processing),
      completed: parseInt(s.completed),
      error: parseInt(s.error)
    });
  } catch (err) {
    console.error('Error getting excel stats:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/excel/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_excel_files WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error getting excel file:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/excel/upload', async (req, res) => {
  try {
    const { filename, content, instructions } = req.body;
    
    if (!filename || !content) {
      return res.status(400).json({ error: 'Missing required fields: filename, content (base64)' });
    }

    const timestamp = Date.now();
    const ext = path.extname(filename) || '.xlsx';
    
    // First insert to get ID
    const insertResult = await pool.query(
      `INSERT INTO lumen_excel_files (original_filename, stored_filename, size, instructions) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [filename, 'temp', 0, instructions || null]
    );
    
    const fileId = insertResult.rows[0].id;
    const safeFilename = `${fileId}_${timestamp}_original${ext}`;
    const filePath = path.join(EXCEL_UPLOAD_DIR, safeFilename);
    
    // Decode base64 and save file
    const buffer = Buffer.from(content, 'base64');
    fs.writeFileSync(filePath, buffer);
    
    // Update with actual filename and size
    const result = await pool.query(
      `UPDATE lumen_excel_files SET stored_filename = $1, size = $2 WHERE id = $3 RETURNING *`,
      [safeFilename, buffer.length, fileId]
    );

    res.json({ 
      id: fileId, 
      message: 'File uploaded successfully',
      file: result.rows[0]
    });
  } catch (err) {
    console.error('Error uploading excel file:', err);
    res.status(500).json({ error: 'Failed to upload file: ' + err.message });
  }
});

app.patch('/api/excel/:id', async (req, res) => {
  try {
    const { status, status_message, processed_filename, preview_data, error, instructions } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
    }
    if (status_message) {
      paramCount++;
      updates.push(`status_message = $${paramCount}`);
      params.push(status_message);
    }
    if (processed_filename !== undefined) {
      paramCount++;
      updates.push(`processed_filename = $${paramCount}`);
      params.push(processed_filename);
    }
    if (preview_data !== undefined) {
      paramCount++;
      updates.push(`preview_data = $${paramCount}`);
      params.push(JSON.stringify(preview_data));
    }
    if (error !== undefined) {
      paramCount++;
      updates.push(`error = $${paramCount}`);
      params.push(error);
    }
    if (instructions !== undefined) {
      paramCount++;
      updates.push(`instructions = $${paramCount}`);
      params.push(instructions);
    }

    if (status === 'completed') {
      updates.push('processed_at = NOW()');
    }

    updates.push('updated_at = NOW()');
    paramCount++;
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE lumen_excel_files SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating excel file:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/excel/:id/processed', async (req, res) => {
  try {
    const fileResult = await pool.query('SELECT * FROM lumen_excel_files WHERE id = $1', [req.params.id]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = fileResult.rows[0];
    const { content, preview_data } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Missing required field: content (base64)' });
    }

    const timestamp = Date.now();
    const ext = path.extname(file.original_filename) || '.xlsx';
    const processedFilename = `${file.id}_${timestamp}_processed${ext}`;
    const filePath = path.join(EXCEL_UPLOAD_DIR, processedFilename);
    
    // Decode base64 and save processed file
    const buffer = Buffer.from(content, 'base64');
    fs.writeFileSync(filePath, buffer);

    const result = await pool.query(
      `UPDATE lumen_excel_files 
       SET processed_filename = $1, status = 'completed', status_message = 'Processing complete', 
           processed_at = NOW(), preview_data = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [processedFilename, preview_data ? JSON.stringify(preview_data) : null, req.params.id]
    );

    res.json({ 
      message: 'Processed file uploaded successfully',
      file: result.rows[0]
    });
  } catch (err) {
    console.error('Error uploading processed file:', err);
    res.status(500).json({ error: 'Failed to upload processed file: ' + err.message });
  }
});

app.get('/api/excel/:id/download/original', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_excel_files WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    const filePath = path.join(EXCEL_UPLOAD_DIR, file.stored_filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Original file not found on disk' });
    }
    
    res.download(filePath, file.original_filename);
  } catch (err) {
    console.error('Error downloading original:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/excel/:id/download/processed', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_excel_files WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    
    if (!file.processed_filename) {
      return res.status(404).json({ error: 'Processed file not available yet' });
    }

    const filePath = path.join(EXCEL_UPLOAD_DIR, file.processed_filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Processed file not found on disk' });
    }
    
    const downloadName = file.original_filename.replace(/(\.[^.]+)$/, '_processed$1');
    res.download(filePath, downloadName);
  } catch (err) {
    console.error('Error downloading processed:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/excel/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_excel_files WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // Delete files from disk
    try {
      const originalPath = path.join(EXCEL_UPLOAD_DIR, file.stored_filename);
      if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      
      if (file.processed_filename) {
        const processedPath = path.join(EXCEL_UPLOAD_DIR, file.processed_filename);
        if (fs.existsSync(processedPath)) fs.unlinkSync(processedPath);
      }
    } catch (e) {
      console.error('Error deleting files:', e);
    }

    await pool.query('DELETE FROM lumen_excel_files WHERE id = $1', [req.params.id]);
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Error deleting excel file:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// HEALTH & MISC
// ============================================

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString(), version: '3.0.0' });
  } catch (err) {
    res.json({ status: 'degraded', database: 'disconnected', timestamp: new Date().toISOString(), version: '3.0.0' });
  }
});

app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🔆 Lumen Dashboard v3.0 (PostgreSQL) running on port ${PORT}`);
});
