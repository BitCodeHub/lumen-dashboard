/**
 * Expense Analytics API Extension
 * Adds chart-ready endpoints to the Lumen Dashboard
 * 
 * Build: 2026-01-30
 * Purpose: Provide structured data for expense visualization charts
 */

/**
 * Setup expense analytics routes
 * @param {Express} app - Express application
 * @param {Pool} pool - PostgreSQL connection pool
 */
function setupExpenseAnalyticsRoutes(app, pool) {
  
  /**
   * GET /api/expenses/charts
   * Returns chart-ready data for expense visualizations
   */
  app.get('/api/expenses/charts', async (req, res) => {
    try {
      const months = parseInt(req.query.months) || 6;
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      
      // Parallel queries for chart data
      const [
        monthlyResult,
        categoryResult,
        dayOfWeekResult,
        vendorResult,
        mealTypeResult,
        recentResult
      ] = await Promise.all([
        // Monthly spending trend (last N months)
        pool.query(`
          SELECT 
            TO_CHAR(date, 'YYYY-MM') as month,
            SUM(amount) as total,
            COUNT(*) as count,
            AVG(amount) as average
          FROM lumen_expenses 
          WHERE date >= $1
          GROUP BY TO_CHAR(date, 'YYYY-MM')
          ORDER BY month ASC
        `, [startDate]),
        
        // Category breakdown
        pool.query(`
          SELECT 
            COALESCE(category, 'Other') as category,
            SUM(amount) as total,
            COUNT(*) as count,
            AVG(amount) as average
          FROM lumen_expenses 
          WHERE date >= $1
          GROUP BY category
          ORDER BY total DESC
        `, [startDate]),
        
        // Day of week spending
        pool.query(`
          SELECT 
            EXTRACT(DOW FROM date) as day_num,
            TO_CHAR(date, 'Day') as day_name,
            SUM(amount) as total,
            COUNT(*) as count,
            AVG(amount) as average
          FROM lumen_expenses 
          WHERE date >= $1
          GROUP BY EXTRACT(DOW FROM date), TO_CHAR(date, 'Day')
          ORDER BY day_num
        `, [startDate]),
        
        // Top vendors
        pool.query(`
          SELECT 
            COALESCE(vendor, 'Unknown') as vendor,
            SUM(amount) as total,
            COUNT(*) as visits,
            AVG(amount) as average
          FROM lumen_expenses 
          WHERE date >= $1
          GROUP BY vendor
          ORDER BY total DESC
          LIMIT 10
        `, [startDate]),
        
        // Meal type breakdown (for food expenses)
        pool.query(`
          SELECT 
            COALESCE(meal_type, 'other') as meal_type,
            SUM(amount) as total,
            COUNT(*) as count,
            AVG(amount) as average
          FROM lumen_expenses 
          WHERE date >= $1 AND category = 'Food'
          GROUP BY meal_type
          ORDER BY total DESC
        `, [startDate]),
        
        // Recent 30 days daily spending
        pool.query(`
          SELECT 
            date::date as day,
            SUM(amount) as total,
            COUNT(*) as count
          FROM lumen_expenses 
          WHERE date >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY date::date
          ORDER BY day ASC
        `)
      ]);
      
      // Calculate totals and trends
      const totalSpent = monthlyResult.rows.reduce((sum, m) => sum + parseFloat(m.total), 0);
      const monthlyTotals = monthlyResult.rows.map(m => parseFloat(m.total));
      
      // Simple trend calculation
      let trend = 'stable';
      if (monthlyTotals.length >= 2) {
        const recent = monthlyTotals.slice(-2).reduce((a, b) => a + b, 0) / 2;
        const earlier = monthlyTotals.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
        if (earlier > 0) {
          const change = ((recent - earlier) / earlier) * 100;
          if (change > 10) trend = 'increasing';
          else if (change < -10) trend = 'decreasing';
        }
      }
      
      // Category colors for consistent charting
      const categoryColors = {
        'Food': { bg: 'rgba(239, 68, 68, 0.7)', border: '#ef4444' },
        'Gas': { bg: 'rgba(245, 158, 11, 0.7)', border: '#f59e0b' },
        'Groceries': { bg: 'rgba(34, 197, 94, 0.7)', border: '#22c55e' },
        'Shopping': { bg: 'rgba(59, 130, 246, 0.7)', border: '#3b82f6' },
        'Entertainment': { bg: 'rgba(168, 85, 247, 0.7)', border: '#a855f7' },
        'Bills': { bg: 'rgba(236, 72, 153, 0.7)', border: '#ec4899' },
        'Transportation': { bg: 'rgba(20, 184, 166, 0.7)', border: '#14b8a6' },
        'Health': { bg: 'rgba(6, 182, 212, 0.7)', border: '#06b6d4' },
        'Other': { bg: 'rgba(107, 114, 128, 0.7)', border: '#6b7280' }
      };
      
      // Day of week labels (ordered Sun-Sat)
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayData = new Array(7).fill(0);
      const dayCounts = new Array(7).fill(0);
      
      dayOfWeekResult.rows.forEach(row => {
        const dayIdx = parseInt(row.day_num);
        dayData[dayIdx] = parseFloat(row.total);
        dayCounts[dayIdx] = parseInt(row.count);
      });
      
      // Build response
      res.json({
        success: true,
        period: {
          start: startDate.toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0],
          months
        },
        summary: {
          totalSpent: Math.round(totalSpent * 100) / 100,
          transactionCount: categoryResult.rows.reduce((sum, c) => sum + parseInt(c.count), 0),
          averageTransaction: totalSpent / Math.max(1, categoryResult.rows.reduce((sum, c) => sum + parseInt(c.count), 0)),
          trend
        },
        charts: {
          // Monthly trend line chart
          monthly: {
            labels: monthlyResult.rows.map(m => {
              const [year, month] = m.month.split('-');
              return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }),
            datasets: [{
              label: 'Monthly Spending',
              data: monthlyResult.rows.map(m => Math.round(parseFloat(m.total) * 100) / 100),
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.3
            }],
            raw: monthlyResult.rows.map(m => ({
              month: m.month,
              total: Math.round(parseFloat(m.total) * 100) / 100,
              count: parseInt(m.count),
              average: Math.round(parseFloat(m.average) * 100) / 100
            }))
          },
          
          // Category donut chart
          categories: {
            labels: categoryResult.rows.map(c => c.category),
            datasets: [{
              data: categoryResult.rows.map(c => Math.round(parseFloat(c.total) * 100) / 100),
              backgroundColor: categoryResult.rows.map(c => 
                categoryColors[c.category]?.bg || 'rgba(107, 114, 128, 0.7)'
              ),
              borderColor: categoryResult.rows.map(c => 
                categoryColors[c.category]?.border || '#6b7280'
              ),
              borderWidth: 2
            }],
            raw: categoryResult.rows.map(c => ({
              category: c.category,
              total: Math.round(parseFloat(c.total) * 100) / 100,
              count: parseInt(c.count),
              average: Math.round(parseFloat(c.average) * 100) / 100,
              percentage: Math.round((parseFloat(c.total) / totalSpent) * 1000) / 10
            }))
          },
          
          // Day of week bar chart
          dayOfWeek: {
            labels: dayLabels,
            datasets: [{
              label: 'Total by Day',
              data: dayData.map(d => Math.round(d * 100) / 100),
              backgroundColor: dayData.map((_, i) => 
                i === 0 || i === 6 
                  ? 'rgba(239, 68, 68, 0.7)' // Weekend - red
                  : 'rgba(99, 102, 241, 0.7)' // Weekday - indigo
              ),
              borderColor: dayData.map((_, i) => 
                i === 0 || i === 6 ? '#ef4444' : '#6366f1'
              ),
              borderWidth: 2
            }],
            counts: dayCounts
          },
          
          // Top vendors horizontal bar
          topVendors: {
            labels: vendorResult.rows.map(v => v.vendor),
            datasets: [{
              label: 'Total Spent',
              data: vendorResult.rows.map(v => Math.round(parseFloat(v.total) * 100) / 100),
              backgroundColor: 'rgba(34, 197, 94, 0.7)',
              borderColor: '#22c55e',
              borderWidth: 2
            }],
            raw: vendorResult.rows.map(v => ({
              vendor: v.vendor,
              total: Math.round(parseFloat(v.total) * 100) / 100,
              visits: parseInt(v.visits),
              average: Math.round(parseFloat(v.average) * 100) / 100
            }))
          },
          
          // Meal type breakdown (for food category)
          mealTypes: {
            labels: mealTypeResult.rows.map(m => m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1)),
            datasets: [{
              data: mealTypeResult.rows.map(m => Math.round(parseFloat(m.total) * 100) / 100),
              backgroundColor: [
                'rgba(251, 191, 36, 0.7)',  // breakfast - amber
                'rgba(34, 197, 94, 0.7)',   // lunch - green
                'rgba(99, 102, 241, 0.7)',  // dinner - indigo
                'rgba(236, 72, 153, 0.7)',  // snack - pink
                'rgba(107, 114, 128, 0.7)'  // other - gray
              ],
              borderWidth: 2
            }],
            raw: mealTypeResult.rows.map(m => ({
              mealType: m.meal_type,
              total: Math.round(parseFloat(m.total) * 100) / 100,
              count: parseInt(m.count),
              average: Math.round(parseFloat(m.average) * 100) / 100
            }))
          },
          
          // Daily spending (last 30 days)
          daily: {
            labels: recentResult.rows.map(d => 
              new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            ),
            datasets: [{
              label: 'Daily Spending',
              data: recentResult.rows.map(d => Math.round(parseFloat(d.total) * 100) / 100),
              backgroundColor: 'rgba(99, 102, 241, 0.5)',
              borderColor: '#6366f1',
              borderWidth: 1
            }]
          }
        },
        generatedAt: new Date().toISOString()
      });
      
    } catch (err) {
      console.error('[Expense Charts API] Error:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate chart data',
        message: err.message 
      });
    }
  });
  
  /**
   * GET /api/expenses/charts/comparison
   * Compare two time periods
   */
  app.get('/api/expenses/charts/comparison', async (req, res) => {
    try {
      const period = req.query.period || 'month'; // month, quarter, year
      
      let currentStart, previousStart, previousEnd;
      const now = new Date();
      
      if (period === 'month') {
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        previousStart = new Date(previousEnd.getFullYear(), previousEnd.getMonth(), 1);
      } else if (period === 'quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        currentStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
        previousEnd = new Date(currentStart - 1);
        previousStart = new Date(previousEnd.getFullYear(), Math.floor(previousEnd.getMonth() / 3) * 3, 1);
      } else {
        currentStart = new Date(now.getFullYear(), 0, 1);
        previousEnd = new Date(now.getFullYear() - 1, 11, 31);
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
      }
      
      const [currentResult, previousResult] = await Promise.all([
        pool.query(`
          SELECT 
            COALESCE(category, 'Other') as category,
            SUM(amount) as total,
            COUNT(*) as count
          FROM lumen_expenses 
          WHERE date >= $1 AND date <= $2
          GROUP BY category
        `, [currentStart, now]),
        
        pool.query(`
          SELECT 
            COALESCE(category, 'Other') as category,
            SUM(amount) as total,
            COUNT(*) as count
          FROM lumen_expenses 
          WHERE date >= $1 AND date <= $2
          GROUP BY category
        `, [previousStart, previousEnd])
      ]);
      
      // Build comparison data
      const currentByCategory = {};
      const previousByCategory = {};
      
      currentResult.rows.forEach(r => {
        currentByCategory[r.category] = parseFloat(r.total);
      });
      
      previousResult.rows.forEach(r => {
        previousByCategory[r.category] = parseFloat(r.total);
      });
      
      // Get all categories
      const allCategories = [...new Set([
        ...Object.keys(currentByCategory),
        ...Object.keys(previousByCategory)
      ])];
      
      const comparison = allCategories.map(cat => {
        const current = currentByCategory[cat] || 0;
        const previous = previousByCategory[cat] || 0;
        const change = previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
        
        return {
          category: cat,
          current: Math.round(current * 100) / 100,
          previous: Math.round(previous * 100) / 100,
          change: Math.round(change * 10) / 10,
          trend: change > 5 ? 'up' : change < -5 ? 'down' : 'stable'
        };
      }).sort((a, b) => b.current - a.current);
      
      const currentTotal = Object.values(currentByCategory).reduce((a, b) => a + b, 0);
      const previousTotal = Object.values(previousByCategory).reduce((a, b) => a + b, 0);
      
      res.json({
        success: true,
        period,
        current: {
          start: currentStart.toISOString().split('T')[0],
          end: now.toISOString().split('T')[0],
          total: Math.round(currentTotal * 100) / 100
        },
        previous: {
          start: previousStart.toISOString().split('T')[0],
          end: previousEnd.toISOString().split('T')[0],
          total: Math.round(previousTotal * 100) / 100
        },
        overallChange: previousTotal > 0 
          ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10 
          : 0,
        comparison,
        chart: {
          labels: comparison.map(c => c.category),
          datasets: [
            {
              label: 'Current Period',
              data: comparison.map(c => c.current),
              backgroundColor: 'rgba(99, 102, 241, 0.7)',
              borderColor: '#6366f1',
              borderWidth: 2
            },
            {
              label: 'Previous Period',
              data: comparison.map(c => c.previous),
              backgroundColor: 'rgba(156, 163, 175, 0.5)',
              borderColor: '#9ca3af',
              borderWidth: 2
            }
          ]
        }
      });
      
    } catch (err) {
      console.error('[Expense Charts Comparison] Error:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate comparison data' 
      });
    }
  });
  
  console.log('[Expense Analytics] Chart API routes registered');
}

module.exports = { setupExpenseAnalyticsRoutes };
