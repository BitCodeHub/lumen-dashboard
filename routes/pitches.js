/**
 * Pitches Routes Module
 * 
 * Handles all /api/pitches/* endpoints for the Shark Tank conversation system.
 * Pitches are AI-assisted idea evaluations with conversation threads and verdicts.
 * Extracted from server.js as part of modularization effort.
 * 
 * @module routes/pitches
 * @author Ethan ⚙️ (Engineering Lead)
 * @date 2025-01-25
 */

const express = require('express');
const router = express.Router();

/**
 * Creates pitches router with database connection
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Router} Express router with pitches routes
 */
module.exports = (pool) => {

  // ============================================
  // GET /api/pitches - List pitches with filters
  // ============================================
  router.get('/', async (req, res) => {
    try {
      const { verdict, limit = 50, starred, archived, q } = req.query;
      let query = 'SELECT * FROM lumen_pitches WHERE 1=1';
      const params = [];
      let paramCount = 0;

      if (archived !== 'true') {
        query += ' AND (archived = FALSE OR archived IS NULL)';
      }
      if (verdict) {
        paramCount++;
        query += ` AND verdict = $${paramCount}`;
        params.push(verdict);
      }
      if (starred === 'true') {
        query += ' AND starred = TRUE';
      }
      if (q) {
        paramCount++;
        const searchParam = `%${q.toLowerCase()}%`;
        query += ` AND (LOWER(idea_name) LIKE $${paramCount} OR LOWER(pitch_content) LIKE $${paramCount} OR LOWER(trend_signal) LIKE $${paramCount})`;
        params.push(searchParam);
      }

      query += ' ORDER BY pitch_date DESC';
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error('[Pitches] Error getting pitches:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // GET /api/pitches/stats - Pitch statistics
  // Note: Must be before /:id route to avoid matching 'stats' as id
  // ============================================
  router.get('/stats', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE verdict = 'pending') as pending,
          COUNT(*) FILTER (WHERE verdict = 'approved') as approved,
          COUNT(*) FILTER (WHERE verdict = 'rejected') as rejected,
          COUNT(*) FILTER (WHERE verdict = 'maybe') as maybe,
          COUNT(*) FILTER (WHERE verdict = 'revisit') as revisit,
          COUNT(*) FILTER (WHERE starred = TRUE AND (archived = FALSE OR archived IS NULL)) as starred
        FROM lumen_pitches
        WHERE archived = FALSE OR archived IS NULL
      `);
      res.json(result.rows[0]);
    } catch (err) {
      console.error('[Pitches] Error getting pitch stats:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // GET /api/pitches/:id - Get single pitch
  // ============================================
  router.get('/:id', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM lumen_pitches WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pitch not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('[Pitches] Error getting pitch:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // POST /api/pitches - Create new pitch
  // ============================================
  router.post('/', async (req, res) => {
    try {
      const {
        idea_id, idea_name, trend_signal, research_sources,
        pitch_content, conversation, verdict, verdict_reason, tags
      } = req.body;
      
      if (!idea_name || !pitch_content) {
        return res.status(400).json({ error: 'Missing required fields: idea_name, pitch_content' });
      }
      
      const result = await pool.query(
        `INSERT INTO lumen_pitches 
         (idea_id, idea_name, trend_signal, research_sources, pitch_content, conversation, verdict, verdict_reason, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          idea_id || null,
          idea_name,
          trend_signal || null,
          JSON.stringify(research_sources || []),
          pitch_content,
          JSON.stringify(conversation || []),
          verdict || 'pending',
          verdict_reason || null,
          tags || []
        ]
      );
      
      res.json({ id: result.rows[0].id, message: 'Pitch created successfully', pitch: result.rows[0] });
    } catch (err) {
      console.error('[Pitches] Error creating pitch:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/pitches/:id - Update pitch
  // ============================================
  router.patch('/:id', async (req, res) => {
    try {
      const updates = [];
      const params = [];
      let paramCount = 0;
      
      const allowedFields = ['idea_id', 'idea_name', 'trend_signal', 'research_sources', 
                             'pitch_content', 'conversation', 'verdict', 'verdict_reason', 'tags'];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          paramCount++;
          if (field === 'research_sources' || field === 'conversation') {
            updates.push(`${field} = $${paramCount}`);
            params.push(JSON.stringify(req.body[field]));
          } else {
            updates.push(`${field} = $${paramCount}`);
            params.push(req.body[field]);
          }
        }
      }
      
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      updates.push(`updated_at = NOW()`);
      paramCount++;
      
      const result = await pool.query(
        `UPDATE lumen_pitches SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        [...params, req.params.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pitch not found' });
      }
      
      res.json({ message: 'Pitch updated', pitch: result.rows[0] });
    } catch (err) {
      console.error('[Pitches] Error updating pitch:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // POST /api/pitches/:id/message - Add message to conversation
  // ============================================
  router.post('/:id/message', async (req, res) => {
    try {
      const { role, content, timestamp } = req.body;
      
      if (!role || !content) {
        return res.status(400).json({ error: 'Missing required fields: role, content' });
      }
      
      const message = {
        role,
        content,
        timestamp: timestamp || new Date().toISOString()
      };
      
      const result = await pool.query(
        `UPDATE lumen_pitches 
         SET conversation = conversation || $1::jsonb, updated_at = NOW()
         WHERE id = $2 
         RETURNING *`,
        [JSON.stringify([message]), req.params.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pitch not found' });
      }
      
      res.json({ message: 'Message added', pitch: result.rows[0] });
    } catch (err) {
      console.error('[Pitches] Error adding message:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/pitches/:id/verdict - Set verdict
  // ============================================
  router.patch('/:id/verdict', async (req, res) => {
    try {
      const { verdict, verdict_reason } = req.body;
      const validVerdicts = ['pending', 'approved', 'rejected', 'maybe', 'revisit'];
      
      if (!validVerdicts.includes(verdict)) {
        return res.status(400).json({ error: 'Invalid verdict. Must be: pending, approved, rejected, maybe, revisit' });
      }
      
      const result = await pool.query(
        `UPDATE lumen_pitches SET verdict = $1, verdict_reason = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
        [verdict, verdict_reason || null, req.params.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pitch not found' });
      }
      
      res.json({ message: 'Verdict set', pitch: result.rows[0] });
    } catch (err) {
      console.error('[Pitches] Error setting verdict:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/pitches/:id/star - Toggle starred
  // ============================================
  router.patch('/:id/star', async (req, res) => {
    try {
      const result = await pool.query(
        'UPDATE lumen_pitches SET starred = NOT starred WHERE id = $1 RETURNING starred',
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pitch not found' });
      }
      res.json({ starred: result.rows[0].starred });
    } catch (err) {
      console.error('[Pitches] Error toggling star:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/pitches/:id/archive - Toggle archived
  // ============================================
  router.patch('/:id/archive', async (req, res) => {
    try {
      const result = await pool.query(
        'UPDATE lumen_pitches SET archived = NOT archived, updated_at = NOW() WHERE id = $1 RETURNING archived',
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pitch not found' });
      }
      res.json({ archived: result.rows[0].archived });
    } catch (err) {
      console.error('[Pitches] Error archiving pitch:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // DELETE /api/pitches/:id - Delete pitch
  // ============================================
  router.delete('/:id', async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM lumen_pitches WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pitch not found' });
      }
      
      res.json({ message: 'Pitch deleted', id: result.rows[0].id });
    } catch (err) {
      console.error('[Pitches] Error deleting pitch:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  return router;
};
