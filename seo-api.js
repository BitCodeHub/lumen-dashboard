const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'data', 'seo-reports');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
    cb(null, `${timestamp}-${sanitized}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.html', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, HTML, and Markdown files allowed'));
    }
  }
});

// Get all SEO reports
router.get('/seo-reports', async (req, res) => {
  try {
    const { website, status, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM seo_reports WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (website) {
      query += ` AND website_url ILIKE $${paramCount}`;
      params.push(`%${website}%`);
      paramCount++;
    }
    
    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    query += ` ORDER BY audit_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM seo_reports WHERE 1=1' + 
      (website ? ' AND website_url ILIKE $1' : '') +
      (status ? ` AND status = $${website ? 2 : 1}` : '');
    const countParams = [];
    if (website) countParams.push(`%${website}%`);
    if (status) countParams.push(status);
    
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      reports: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching SEO reports:', error);
    res.status(500).json({ error: 'Failed to fetch SEO reports' });
  }
});

// Get single SEO report
router.get('/seo-reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM seo_reports WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching SEO report:', error);
    res.status(500).json({ error: 'Failed to fetch SEO report' });
  }
});

// Create SEO report
router.post('/seo-reports', upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'html', maxCount: 1 },
  { name: 'markdown', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      website_url,
      website_name,
      overall_score,
      technical_score,
      onpage_score,
      content_score,
      ux_score,
      mobile_score,
      critical_issues,
      warnings,
      recommendations,
      audit_date,
      next_audit_date,
      status,
      notes
    } = req.body;
    
    if (!website_url || !website_name || !overall_score) {
      return res.status(400).json({ error: 'website_url, website_name, and overall_score are required' });
    }
    
    const pdf_path = req.files?.pdf ? req.files.pdf[0].path : null;
    const html_path = req.files?.html ? req.files.html[0].path : null;
    const markdown_path = req.files?.markdown ? req.files.markdown[0].path : null;
    
    const result = await pool.query(
      `INSERT INTO seo_reports (
        website_url, website_name, overall_score, technical_score, onpage_score,
        content_score, ux_score, mobile_score, pdf_path, html_path, markdown_path,
        critical_issues, warnings, recommendations, audit_date, next_audit_date,
        status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        website_url,
        website_name,
        parseInt(overall_score),
        technical_score ? parseInt(technical_score) : null,
        onpage_score ? parseInt(onpage_score) : null,
        content_score ? parseInt(content_score) : null,
        ux_score ? parseInt(ux_score) : null,
        mobile_score ? parseInt(mobile_score) : null,
        pdf_path,
        html_path,
        markdown_path,
        critical_issues ? parseInt(critical_issues) : 0,
        warnings ? parseInt(warnings) : 0,
        recommendations ? parseInt(recommendations) : 0,
        audit_date || new Date(),
        next_audit_date || null,
        status || 'completed',
        notes || null
      ]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating SEO report:', error);
    res.status(500).json({ error: 'Failed to create SEO report', details: error.message });
  }
});

// Update SEO report
router.patch('/seo-reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowed = [
      'website_name', 'overall_score', 'technical_score', 'onpage_score',
      'content_score', 'ux_score', 'mobile_score', 'critical_issues',
      'warnings', 'recommendations', 'next_audit_date', 'status', 'notes'
    ];
    
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowed.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    values.push(id);
    const query = `UPDATE seo_reports SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating SEO report:', error);
    res.status(500).json({ error: 'Failed to update SEO report' });
  }
});

// Delete SEO report
router.delete('/seo-reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get file paths before deleting
    const report = await pool.query('SELECT pdf_path, html_path, markdown_path FROM seo_reports WHERE id = $1', [id]);
    
    if (report.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Delete files
    const paths = [report.rows[0].pdf_path, report.rows[0].html_path, report.rows[0].markdown_path];
    paths.forEach(p => {
      if (p && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });
    
    // Delete from database
    await pool.query('DELETE FROM seo_reports WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Report deleted' });
  } catch (error) {
    console.error('Error deleting SEO report:', error);
    res.status(500).json({ error: 'Failed to delete SEO report' });
  }
});

// Download report file
router.get('/seo-reports/:id/download/:type', async (req, res) => {
  try {
    const { id, type } = req.params;
    
    if (!['pdf', 'html', 'markdown'].includes(type)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    const column = `${type}_path`;
    const result = await pool.query(`SELECT ${column}, website_name FROM seo_reports WHERE id = $1`, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const filePath = result.rows[0][column];
    
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const ext = path.extname(filePath);
    const filename = `${result.rows[0].website_name.replace(/[^a-z0-9]/gi, '-')}-seo-report${ext}`;
    
    res.download(filePath, filename);
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

// Get website history (all reports for a website)
router.get('/seo-reports/history/:website', async (req, res) => {
  try {
    const { website } = req.params;
    const decodedWebsite = decodeURIComponent(website);
    
    const result = await pool.query(
      'SELECT * FROM seo_reports WHERE website_url = $1 ORDER BY audit_date DESC',
      [decodedWebsite]
    );
    
    res.json({
      website: decodedWebsite,
      reports: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching website history:', error);
    res.status(500).json({ error: 'Failed to fetch website history' });
  }
});

// Get score trends (for charting)
router.get('/seo-reports/trends/:website', async (req, res) => {
  try {
    const { website } = req.params;
    const decodedWebsite = decodeURIComponent(website);
    
    const result = await pool.query(
      `SELECT 
        audit_date,
        overall_score,
        technical_score,
        onpage_score,
        content_score,
        ux_score,
        mobile_score
      FROM seo_reports 
      WHERE website_url = $1 
      ORDER BY audit_date ASC`,
      [decodedWebsite]
    );
    
    res.json({
      website: decodedWebsite,
      trends: result.rows
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Schedule next audit
router.post('/seo-reports/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { next_audit_date } = req.body;
    
    if (!next_audit_date) {
      return res.status(400).json({ error: 'next_audit_date is required' });
    }
    
    const result = await pool.query(
      'UPDATE seo_reports SET next_audit_date = $1, status = $2 WHERE id = $3 RETURNING *',
      [next_audit_date, 'scheduled', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error scheduling audit:', error);
    res.status(500).json({ error: 'Failed to schedule audit' });
  }
});

module.exports = router;
