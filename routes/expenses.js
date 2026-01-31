/**
 * Expenses Routes Module
 * 
 * Handles all /api/expenses/* endpoints including smart expense parsing,
 * expense analytics, merchant profiles, and the Money Oracle.
 * Extracted from server.js as part of modularization effort.
 * 
 * @module routes/expenses
 * @author Ethan ⚙️ (Engineering Lead)
 * @date 2025-01-25
 */

const express = require('express');
const router = express.Router();

/**
 * Creates expenses router with database connection
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} options - Optional dependencies
 * @param {Object} options.smartExpenses - Smart expenses parser module
 * @param {Object} options.moneyOracle - Money oracle analytics module
 * @returns {Router} Express router with expense routes
 */
module.exports = (pool, options = {}) => {
  const { smartExpenses, moneyOracle } = options;

  // ============================================
  // GET /api/expenses - List expenses with filters
  // ============================================
  router.get('/', async (req, res) => {
    try {
      let { month, year, category, limit = 100 } = req.query;
      
      let query = 'SELECT * FROM lumen_expenses WHERE 1=1';
      const params = [];
      let paramCount = 0;

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
      const expenses = result.rows.map(e => ({
        ...e,
        amount: parseFloat(e.amount)
      }));
      res.json(expenses);
    } catch (err) {
      console.error('[Expenses] Error getting expenses:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // GET /api/expenses/summary - Monthly summary
  // ============================================
  router.get('/summary', async (req, res) => {
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
        recentExpenses: recent.rows.map(e => ({ ...e, amount: parseFloat(e.amount) }))
      });
    } catch (err) {
      console.error('[Expenses] Error getting expense summary:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // MONEY ORACLE - Predictive Financial Intelligence
  // ============================================

  /**
   * GET /api/expenses/oracle - Full financial analysis
   */
  router.get('/oracle', async (req, res) => {
    if (!moneyOracle) {
      return res.status(501).json({ error: 'Money Oracle module not configured' });
    }
    
    try {
      console.log('[Money Oracle] Running financial analysis...');
      const result = await moneyOracle.analyze(pool);
      console.log(`[Money Oracle] Analysis complete in ${result.processingTimeMs}ms - ${result.insights?.length || 0} insights generated`);
      res.json(result);
    } catch (err) {
      console.error('[Money Oracle] Error running analysis:', err);
      res.status(500).json({ 
        success: false,
        error: 'Failed to analyze expenses',
        message: err.message 
      });
    }
  });

  /**
   * GET /api/expenses/oracle/quick - Lightweight insights for dashboard widgets
   */
  router.get('/oracle/quick', async (req, res) => {
    if (!moneyOracle) {
      return res.status(501).json({ error: 'Money Oracle module not configured' });
    }
    
    try {
      const result = await moneyOracle.analyze(pool);
      
      // Return only top 3 insights and key predictions
      res.json({
        success: true,
        insights: result.insights?.slice(0, 3) || [],
        predictions: {
          nextMonth: result.predictions?.nextMonth || 0,
          confidence: result.predictions?.confidence || 'low'
        },
        patterns: result.patterns || {},
        summary: {
          totalSpent: result.summary?.totalSpent || 0,
          spendingTrend: result.patterns?.spendingTrend || 'stable'
        }
      });
    } catch (err) {
      console.error('[Money Oracle Quick] Error:', err);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get quick insights' 
      });
    }
  });

  /**
   * GET /api/expenses/oracle/savings - Savings opportunities
   */
  router.get('/oracle/savings', async (req, res) => {
    if (!moneyOracle) {
      return res.status(501).json({ error: 'Money Oracle module not configured' });
    }
    
    try {
      const result = await moneyOracle.analyze(pool);
      res.json({
        success: true,
        opportunities: result.savings || [],
        totalPotential: (result.savings || []).reduce((sum, s) => sum + (s.potential || 0), 0)
      });
    } catch (err) {
      console.error('[Money Oracle Savings] Error:', err);
      res.status(500).json({ 
        success: false,
        error: 'Failed to identify savings' 
      });
    }
  });

  // ============================================
  // POST /api/expenses - Create new expense
  // ============================================
  router.post('/', async (req, res) => {
    try {
      const { 
        amount, category, description, vendor, date,
        merchant_address, merchant_phone, items,
        subtotal, tax, tip, discount,
        payment_method, card_type, card_last_four,
        receipt_number, transaction_time,
        merchant, payment
      } = req.body;
      
      if (!amount || !category) {
        return res.status(400).json({ error: 'Missing required fields: amount, category' });
      }

      const finalMerchantAddress = merchant_address || (merchant && merchant.address) || null;
      const finalMerchantPhone = merchant_phone || (merchant && merchant.phone) || null;
      const finalVendor = vendor || (merchant && merchant.name) || null;
      const finalPaymentMethod = payment_method || (payment && payment.method) || null;
      const finalCardType = card_type || (payment && payment.cardType) || null;
      const finalCardLastFour = card_last_four || (payment && payment.lastFour) || null;

      const result = await pool.query(
        `INSERT INTO lumen_expenses (
          amount, category, description, vendor, date,
          merchant_address, merchant_phone, items,
          subtotal, tax, tip, discount,
          payment_method, card_type, card_last_four,
          receipt_number, transaction_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
        [
          parseFloat(amount), category, description || '', finalVendor,
          date || new Date(), finalMerchantAddress, finalMerchantPhone,
          items ? JSON.stringify(items) : null,
          subtotal ? parseFloat(subtotal) : null, tax ? parseFloat(tax) : null,
          tip ? parseFloat(tip) : null, discount ? parseFloat(discount) : null,
          finalPaymentMethod, finalCardType, finalCardLastFour,
          receipt_number || null, transaction_time || null
        ]
      );

      await pool.query(
        'INSERT INTO lumen_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [category]
      );

      const expense = { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
      res.json({ id: expense.id, message: 'Expense added successfully', expense });
    } catch (err) {
      console.error('[Expenses] Error adding expense:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // PATCH /api/expenses/:id - Update expense
  // ============================================
  router.patch('/:id', async (req, res) => {
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
      console.error('[Expenses] Error updating expense:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // DELETE /api/expenses/:id - Delete expense
  // ============================================
  router.delete('/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM lumen_expenses WHERE id = $1', [req.params.id]);
      res.json({ message: 'Expense deleted' });
    } catch (err) {
      console.error('[Expenses] Error deleting expense:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // GET /api/expenses/vendors - List vendors with stats
  // ============================================
  router.get('/vendors', async (req, res) => {
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
      console.error('[Expenses] Error getting vendors:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // GET /api/expenses/categories - List expense categories
  // ============================================
  router.get('/categories', async (req, res) => {
    try {
      const result = await pool.query('SELECT name FROM lumen_categories ORDER BY name');
      res.json(result.rows.map(r => r.name));
    } catch (err) {
      console.error('[Expenses] Error getting categories:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // SMART EXPENSE API - AI-Powered Parsing
  // ============================================

  /**
   * POST /api/expenses/smart - Parse and log expense from natural language or receipt
   * Body: { input, image, source }
   */
  router.post('/smart', async (req, res) => {
    if (!smartExpenses) {
      return res.status(501).json({ error: 'Smart expenses module not configured' });
    }
    
    try {
      const { input, image, source = 'api' } = req.body;
      
      if (!input && !image) {
        return res.status(400).json({ error: 'Either input text or image is required' });
      }

      let parsed;
      
      if (image) {
        // Parse receipt image
        parsed = await smartExpenses.parseReceiptImage(image);
        parsed.source = 'receipt_photo';
      } else {
        // Parse natural language input
        parsed = smartExpenses.parseExpenseText(input);
        parsed.source = source === 'voice' ? 'voice' : 'text';
      }

      // Enrich with merchant profile data
      parsed = await smartExpenses.enrichWithMerchantProfile(parsed, pool);

      // Validate we have minimum required data
      if (!parsed.amount) {
        return res.status(400).json({ 
          error: 'Could not extract amount from input',
          parsed,
          suggestion: 'Try including a dollar amount like "$12.50" or "12 dollars"'
        });
      }

      if (!parsed.category) {
        parsed.category = 'Other';
      }

      // Insert the expense with all smart fields
      const result = await pool.query(`
        INSERT INTO lumen_expenses (
          amount, category, description, vendor, date,
          meal_type, food_type, cuisine, merchant_type, who_for,
          custom_fields, source, confidence, raw_input
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        parsed.amount,
        parsed.category,
        parsed.description,
        parsed.vendor,
        parsed.meal_type,
        parsed.food_type,
        parsed.cuisine,
        parsed.merchant_type,
        parsed.who_for,
        JSON.stringify(parsed.custom_fields || {}),
        parsed.source,
        parsed.confidence,
        parsed.raw_input
      ]);

      // Learn from this expense for future parsing
      await smartExpenses.learnMerchant(parsed, pool);

      // Ensure category exists
      if (parsed.category) {
        await pool.query(
          'INSERT INTO lumen_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [parsed.category]
        );
      }

      const expense = { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
      
      res.json({
        id: expense.id,
        message: 'Expense logged successfully',
        expense,
        parsed: {
          confidence: parsed.confidence,
          detected: {
            amount: parsed.amount,
            vendor: parsed.vendor,
            category: parsed.category,
            meal_type: parsed.meal_type,
            food_type: parsed.food_type,
            who_for: parsed.who_for
          }
        }
      });

    } catch (err) {
      console.error('[Smart Expenses] Error:', err);
      res.status(500).json({ error: 'Failed to process expense', details: err.message });
    }
  });

  // ============================================
  // GET /api/expenses/merchants - List merchant profiles
  // ============================================
  router.get('/merchants', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT name, merchant_type, default_category, default_food_type, default_cuisine
        FROM lumen_merchant_profiles
        ORDER BY name
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('[Expenses] Error getting merchants:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  /**
   * POST /api/expenses/merchants - Add or update merchant profile
   */
  router.post('/merchants', async (req, res) => {
    try {
      const { name, aliases, merchant_type, default_category, default_food_type, default_cuisine, default_meal_type } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Merchant name is required' });
      }

      const result = await pool.query(`
        INSERT INTO lumen_merchant_profiles 
        (name, aliases, merchant_type, default_category, default_food_type, default_cuisine, default_meal_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (name) DO UPDATE SET
          aliases = EXCLUDED.aliases,
          merchant_type = EXCLUDED.merchant_type,
          default_category = EXCLUDED.default_category,
          default_food_type = EXCLUDED.default_food_type,
          default_cuisine = EXCLUDED.default_cuisine,
          default_meal_type = EXCLUDED.default_meal_type
        RETURNING *
      `, [name, aliases || [], merchant_type, default_category, default_food_type, default_cuisine, default_meal_type]);

      res.json({ message: 'Merchant profile saved', merchant: result.rows[0] });
    } catch (err) {
      console.error('[Expenses] Error saving merchant:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ============================================
  // GET /api/expenses/food-types - List food types
  // ============================================
  router.get('/food-types', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT name, category, cuisine
        FROM lumen_food_types
        ORDER BY name
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('[Expenses] Error getting food types:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  return router;
};
