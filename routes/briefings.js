/**
 * Briefings Routes Module
 * 
 * Handles all /api/briefings/* endpoints for the Lumen Dashboard.
 * Extracted from server.js as part of modularization effort.
 * 
 * @module routes/briefings
 * @author Ethan ⚙️ (Engineering Lead)
 * @date 2025-01-25
 */

const express = require('express');
const router = express.Router();

/**
 * Creates briefings router with database connection
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Router} Express router with briefings routes
 */
module.exports = (pool) => {
  
  // ============================================
  // GET /api/briefings - List briefings with filters
  // ============================================
  router.get('/', async (req, res) => {
    try {
      const { type, limit = 50, starred, archived, tag, q } = req.query;
      
      let query = 'SELECT * FROM lumen_briefings WHERE 1=1';
      const params = [];
      let paramCount = 0;

      // Archived filter
      if (archived !== 'true' && archived !== 'only') {
        query += ' AND (archived = FALSE OR archived IS NULL)';
      } else if (archived === 'only') {
        query += ' AND archived = TRUE';
      }

      // Type filter
      if (type) {
        paramCount++;
        query += ` AND type = $${paramCount}`;
        params.push(type);
      }

      // Starred filter
      if (starred === 'true') {
        query += ' AND starred = TRUE';
      }

      // Tag filter
      if (tag) {
        paramCount++;
        query += ` AND $${paramCount} = ANY(tags)`;
        params.push(tag);
      }

      // Search filter
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
      console.error('[Briefings] Error getting briefings:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // GET /api/briefings/:id - Get single briefing (marks as read)
  // ============================================
  router.get('/:id', async (req, res) => {
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
      console.error('[Briefings] Error getting briefing:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // POST /api/briefings - Create new briefing
  // ============================================
  router.post('/', async (req, res) => {
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
      console.error('[Briefings] Error adding briefing:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/briefings/:id - Update briefing
  // ============================================
  router.patch('/:id', async (req, res) => {
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
      console.error('[Briefings] Error updating briefing:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/briefings/:id/star - Toggle star
  // ============================================
  router.patch('/:id/star', async (req, res) => {
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
      console.error('[Briefings] Error toggling star:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/briefings/:id/archive - Toggle archive
  // ============================================
  router.patch('/:id/archive', async (req, res) => {
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
      console.error('[Briefings] Error archiving briefing:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // DELETE /api/briefings/:id - Delete briefing
  // ============================================
  router.delete('/:id', async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM lumen_briefings WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Briefing not found' });
      }
      
      res.json({ message: 'Briefing deleted', id: result.rows[0].id });
    } catch (err) {
      console.error('[Briefings] Error deleting briefing:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  return router;
};
