/**
 * Documents API - File uploads and document management
 * Supports PDFs, images, and other document types
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// File upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp_random_originalname
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${uniqueSuffix}_${basename}${ext}`);
  }
});

// File filter - accept common document types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

// Multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  }
});

/**
 * Register all document API routes
 */
function registerDocumentRoutes(app, pool) {
  
  /**
   * POST /api/documents - Upload a new document
   */
  app.post('/api/documents', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const {
        title,
        section = 'General',
        category,
        tags,
        description,
        metadata
      } = req.body;
      
      // Parse tags if it's a string
      let tagsArray = [];
      if (tags) {
        if (typeof tags === 'string') {
          tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
        } else if (Array.isArray(tags)) {
          tagsArray = tags;
        }
      }
      
      // Parse metadata if it's a string
      let metadataObj = null;
      if (metadata) {
        if (typeof metadata === 'string') {
          try {
            metadataObj = JSON.parse(metadata);
          } catch (e) {
            metadataObj = { raw: metadata };
          }
        } else if (typeof metadata === 'object') {
          metadataObj = metadata;
        }
      }
      
      // Insert into database
      const result = await pool.query(`
        INSERT INTO documents (
          filename,
          original_filename,
          title,
          section,
          category,
          file_path,
          file_size,
          mime_type,
          tags,
          description,
          metadata,
          uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        req.file.filename,
        req.file.originalname,
        title || req.file.originalname,
        section,
        category,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        tagsArray,
        description,
        metadataObj,
        req.user?.username || 'api'
      ]);
      
      res.json({
        success: true,
        document: result.rows[0],
        message: 'Document uploaded successfully'
      });
      
    } catch (err) {
      console.error('[Documents API] Upload error:', err);
      
      // Clean up file if database insert failed
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });
  
  /**
   * GET /api/documents - List documents
   */
  app.get('/api/documents', async (req, res) => {
    try {
      const {
        section,
        category,
        tag,
        starred,
        archived = 'false',
        limit = 50,
        offset = 0
      } = req.query;
      
      let query = 'SELECT * FROM documents WHERE 1=1';
      const params = [];
      let paramIndex = 1;
      
      if (section) {
        query += ` AND section = $${paramIndex}`;
        params.push(section);
        paramIndex++;
      }
      
      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }
      
      if (tag) {
        query += ` AND $${paramIndex} = ANY(tags)`;
        params.push(tag);
        paramIndex++;
      }
      
      if (starred === 'true') {
        query += ' AND starred = TRUE';
      }
      
      if (archived === 'false') {
        query += ' AND (archived = FALSE OR archived IS NULL)';
      } else if (archived === 'true') {
        query += ' AND archived = TRUE';
      }
      
      query += ` ORDER BY uploaded_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM documents WHERE 1=1';
      const countParams = [];
      let countIndex = 1;
      
      if (section) {
        countQuery += ` AND section = $${countIndex}`;
        countParams.push(section);
        countIndex++;
      }
      
      if (category) {
        countQuery += ` AND category = $${countIndex}`;
        countParams.push(category);
        countIndex++;
      }
      
      if (tag) {
        countQuery += ` AND $${countIndex} = ANY(tags)`;
        countParams.push(tag);
        countIndex++;
      }
      
      if (starred === 'true') {
        countQuery += ' AND starred = TRUE';
      }
      
      if (archived === 'false') {
        countQuery += ' AND (archived = FALSE OR archived IS NULL)';
      } else if (archived === 'true') {
        countQuery += ' AND archived = TRUE';
      }
      
      const countResult = await pool.query(countQuery, countParams);
      
      res.json({
        documents: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } catch (err) {
      console.error('[Documents API] List error:', err);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });
  
  /**
   * GET /api/documents/:id - Get a specific document
   */
  app.get('/api/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json(result.rows[0]);
      
    } catch (err) {
      console.error('[Documents API] Get error:', err);
      res.status(500).json({ error: 'Failed to get document' });
    }
  });
  
  /**
   * GET /api/documents/:id/download - Download a document file
   */
  app.get('/api/documents/:id/download', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query(
        'SELECT filename, original_filename, file_path, mime_type FROM documents WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      const doc = result.rows[0];
      
      if (!fs.existsSync(doc.file_path)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }
      
      res.download(doc.file_path, doc.original_filename);
      
    } catch (err) {
      console.error('[Documents API] Download error:', err);
      res.status(500).json({ error: 'Failed to download document' });
    }
  });
  
  /**
   * PATCH /api/documents/:id - Update document metadata
   */
  app.patch('/api/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        section,
        category,
        tags,
        description,
        metadata,
        starred,
        archived
      } = req.body;
      
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (title !== undefined) {
        updates.push(`title = $${paramIndex}`);
        params.push(title);
        paramIndex++;
      }
      
      if (section !== undefined) {
        updates.push(`section = $${paramIndex}`);
        params.push(section);
        paramIndex++;
      }
      
      if (category !== undefined) {
        updates.push(`category = $${paramIndex}`);
        params.push(category);
        paramIndex++;
      }
      
      if (tags !== undefined) {
        updates.push(`tags = $${paramIndex}`);
        params.push(Array.isArray(tags) ? tags : [tags]);
        paramIndex++;
      }
      
      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }
      
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramIndex}`);
        params.push(metadata);
        paramIndex++;
      }
      
      if (starred !== undefined) {
        updates.push(`starred = $${paramIndex}`);
        params.push(starred);
        paramIndex++;
      }
      
      if (archived !== undefined) {
        updates.push(`archived = $${paramIndex}`);
        params.push(archived);
        paramIndex++;
      }
      
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      params.push(id);
      const query = `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json({
        success: true,
        document: result.rows[0]
      });
      
    } catch (err) {
      console.error('[Documents API] Update error:', err);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });
  
  /**
   * PATCH /api/documents/:id/star - Toggle star status
   */
  app.patch('/api/documents/:id/star', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query(
        'UPDATE documents SET starred = NOT starred WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json({
        success: true,
        document: result.rows[0]
      });
      
    } catch (err) {
      console.error('[Documents API] Star toggle error:', err);
      res.status(500).json({ error: 'Failed to toggle star' });
    }
  });
  
  /**
   * PATCH /api/documents/:id/archive - Toggle archive status
   */
  app.patch('/api/documents/:id/archive', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query(
        'UPDATE documents SET archived = NOT archived WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json({
        success: true,
        document: result.rows[0]
      });
      
    } catch (err) {
      console.error('[Documents API] Archive toggle error:', err);
      res.status(500).json({ error: 'Failed to toggle archive' });
    }
  });
  
  /**
   * DELETE /api/documents/:id - Delete a document
   */
  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get file path before deleting from database
      const fileResult = await pool.query(
        'SELECT file_path FROM documents WHERE id = $1',
        [id]
      );
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      const filePath = fileResult.rows[0].file_path;
      
      // Delete from database
      await pool.query('DELETE FROM documents WHERE id = $1', [id]);
      
      // Delete file from disk
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
      
    } catch (err) {
      console.error('[Documents API] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });
  
  /**
   * GET /api/documents/sections/list - Get list of all sections
   */
  app.get('/api/documents/sections/list', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT DISTINCT section, COUNT(*) as count
        FROM documents
        WHERE (archived = FALSE OR archived IS NULL)
        GROUP BY section
        ORDER BY count DESC, section
      `);
      
      res.json({
        sections: result.rows
      });
      
    } catch (err) {
      console.error('[Documents API] Sections list error:', err);
      res.status(500).json({ error: 'Failed to get sections' });
    }
  });
  
  console.log('[Documents API] Routes registered');
}

module.exports = { registerDocumentRoutes };
