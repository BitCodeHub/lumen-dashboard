/**
 * Routes Index - Aggregates all route modules
 * 
 * Usage in server.js:
 *   const routes = require('./routes');
 *   routes.register(app, pool);
 * 
 * @module routes
 * @author Ethan ⚙️ (Engineering Lead)
 * @date 2025-01-25
 */

const briefingsRoutes = require('./briefings');

/**
 * Register all modular routes with the Express app
 * @param {Express} app - Express application instance
 * @param {Pool} pool - PostgreSQL connection pool
 */
function register(app, pool) {
  console.log('[Routes] Registering modular routes...');
  
  // Briefings routes - EXTRACTED ✅
  app.use('/api/briefings', briefingsRoutes(pool));
  console.log('[Routes] ✓ /api/briefings');
  
  // TODO: Add more routes as they are extracted
  // app.use('/api/expenses', expensesRoutes(pool));
  // app.use('/api/team-activity', teamActivityRoutes(pool));
  // app.use('/api/analytics', analyticsRoutes(pool));
  // app.use('/api/notifications', notificationsRoutes(pool));
  // app.use('/api/automations', automationsRoutes(pool));
  // app.use('/api/ideas', ideasRoutes(pool));
  // app.use('/api/pitches', pitchesRoutes(pool));
  // app.use('/api/resources', resourcesRoutes(pool));
  // app.use('/api/jobs', jobsRoutes(pool));
  // app.use('/api/voice', voiceRoutes(pool));
  // app.use('/api/context', contextRoutes(pool));
  // app.use('/api/lumen-tools', templatesRoutes(pool));
  // app.use('/api/serendipity', serendipityRoutes(pool));
  // app.use('/api/meetings', meetingsRoutes(pool));
  
  console.log('[Routes] All modular routes registered');
}

module.exports = {
  register,
  // Export individual route factories for flexible usage
  briefings: briefingsRoutes
};
