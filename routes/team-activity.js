/**
 * Team Activity Routes Module
 * 
 * Handles all team activity endpoints and SSE (Server-Sent Events) for real-time updates.
 * Extracted from server.js as part of modularization effort.
 * 
 * @module routes/team-activity
 * @author Ethan ⚙️ (Engineering Lead)
 * @date 2025-01-25
 */

const express = require('express');
const router = express.Router();

// In-memory activity feed (last 100 entries)
let teamActivityFeed = [];
const MAX_ACTIVITY_ENTRIES = 100;

// SSE clients for real-time activity updates
const sseClients = new Set();

// SSE clients for real-time company status updates  
const statusSseClients = new Set();

/**
 * Broadcast activity to all SSE clients
 * @param {Object} activity - Activity object to broadcast
 */
function broadcastActivity(activity) {
  const message = JSON.stringify({ type: 'activity', data: activity });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (err) {
      console.error('[SSE] Error broadcasting to client:', err.message);
      sseClients.delete(client);
    }
  });
}

/**
 * Broadcast company status to all SSE clients
 * @param {Object} status - Status object to broadcast
 */
function broadcastCompanyStatus(status) {
  const message = JSON.stringify({ type: 'status', data: status });
  statusSseClients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (err) {
      statusSseClients.delete(client);
    }
  });
}

/**
 * Creates team activity router with database connection
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Router} Express router with team activity routes
 */
module.exports = (pool) => {
  
  // ============================================
  // SSE ENDPOINTS - Real-time Streams
  // ============================================

  /**
   * GET /stream - SSE endpoint for real-time team activity
   */
  router.get('/stream', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Real-time activity stream connected' })}\n\n`);

    // Add client to set
    sseClients.add(res);
    console.log(`[SSE] Client connected. Total clients: ${sseClients.size}`);

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000);

    // Clean up on close
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
      console.log(`[SSE] Client disconnected. Total clients: ${sseClients.size}`);
    });
  });

  /**
   * GET /status/stream - SSE endpoint for real-time company status
   */
  router.get('/status/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();
    
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Company status stream connected' })}\n\n`);
    statusSseClients.add(res);
    console.log(`[SSE Status] Client connected. Total: ${statusSseClients.size}`);
    
    const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 30000);
    
    req.on('close', () => {
      clearInterval(heartbeat);
      statusSseClients.delete(res);
      console.log(`[SSE Status] Client disconnected. Total: ${statusSseClients.size}`);
    });
  });

  // ============================================
  // PROTECTED API ROUTES (Require Auth)
  // ============================================

  /**
   * POST / - Log agent activity
   * Body: { agent, emoji, action, status, details, department }
   */
  router.post('/', async (req, res) => {
    try {
      const { agent, emoji, action, status, details, department } = req.body;
      if (!agent || !action) {
        return res.status(400).json({ error: 'Agent and action are required' });
      }
      
      const activity = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        agent: agent,
        emoji: emoji || '🤖',
        department: department || 'Unknown',
        action: action,
        status: status || 'working', // working, completed, blocked
        details: details || null
      };
      
      // Add to beginning of feed
      teamActivityFeed.unshift(activity);
      
      // Trim to max entries
      if (teamActivityFeed.length > MAX_ACTIVITY_ENTRIES) {
        teamActivityFeed = teamActivityFeed.slice(0, MAX_ACTIVITY_ENTRIES);
      }
      
      console.log(`[Team Activity] ${activity.emoji} ${activity.agent}: ${activity.action} (${activity.status})`);
      res.status(201).json(activity);
    } catch (err) {
      console.error('[Team Activity] Error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  /**
   * GET / - Get activity feed
   * Query: { limit, agent, status }
   */
  router.get('/', (req, res) => {
    const { limit = 50, agent, status } = req.query;
    let feed = [...teamActivityFeed];
    
    if (agent) {
      feed = feed.filter(a => a.agent.toLowerCase().includes(agent.toLowerCase()));
    }
    if (status) {
      feed = feed.filter(a => a.status === status);
    }
    
    res.json({
      count: feed.length,
      activities: feed.slice(0, parseInt(limit))
    });
  });

  /**
   * GET /live - Get who's working right now (last 5 minutes)
   */
  router.get('/live', (req, res) => {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentActivity = teamActivityFeed.filter(a => new Date(a.timestamp).getTime() > fiveMinutesAgo);
    
    // Group by agent, show most recent status
    const agentStatus = {};
    for (const activity of recentActivity) {
      if (!agentStatus[activity.agent]) {
        agentStatus[activity.agent] = activity;
      }
    }
    
    res.json({
      activeAgents: Object.keys(agentStatus).length,
      agents: Object.values(agentStatus)
    });
  });

  // ============================================
  // PUBLIC API ROUTES (No Auth Required)
  // ============================================

  /**
   * GET /public - Public access to activity feed (no auth)
   * Query: { limit }
   */
  router.get('/public', async (req, res) => {
    const { limit = 30 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 30, 100);
    
    try {
      // Try database first
      const result = await pool.query(
        'SELECT id, agent, emoji, department, action, status, details, created_at as timestamp FROM team_activity ORDER BY created_at DESC LIMIT $1',
        [limitNum]
      );
      
      res.json({
        success: true,
        source: 'database',
        count: result.rows.length,
        activities: result.rows,
        refreshedAt: new Date().toISOString()
      });
    } catch (dbErr) {
      console.warn('[Team Activity] DB read failed, using cache:', dbErr.message);
      // Fallback to in-memory cache
      res.json({
        success: true,
        source: 'cache',
        count: teamActivityFeed.length,
        activities: teamActivityFeed.slice(0, limitNum),
        refreshedAt: new Date().toISOString()
      });
    }
  });

  /**
   * POST /public - Push activity with API key (for external systems)
   * Headers: { x-api-key }
   * Body: { agent, emoji, action, status, details, department }
   */
  router.post('/public', async (req, res) => {
    // Verify API key
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || apiKey !== process.env.DASHBOARD_API_KEY) {
      return res.status(401).json({ error: 'API key required' });
    }
    
    const { agent, emoji, action, status, details, department } = req.body;
    if (!agent || !action) {
      return res.status(400).json({ error: 'Agent and action are required' });
    }
    
    const activity = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      agent: agent,
      emoji: emoji || '🤖',
      department: department || 'Unknown',
      action: action,
      status: status || 'working',
      details: details || null
    };
    
    // Save to in-memory cache
    teamActivityFeed.unshift(activity);
    if (teamActivityFeed.length > MAX_ACTIVITY_ENTRIES) {
      teamActivityFeed = teamActivityFeed.slice(0, MAX_ACTIVITY_ENTRIES);
    }
    
    // Persist to database
    try {
      const result = await pool.query(
        'INSERT INTO team_activity (agent, emoji, department, action, status, details) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at',
        [agent, emoji || '🤖', department || 'Unknown', action, status || 'working', details || null]
      );
      activity.id = result.rows[0].id;
      activity.timestamp = result.rows[0].created_at;
    } catch (dbErr) {
      console.warn('[Team Activity] DB write failed:', dbErr.message);
    }
    
    // Broadcast to all SSE clients for real-time updates
    broadcastActivity(activity);
    
    console.log(`[Public Activity] ${activity.emoji} ${activity.agent}: ${activity.action}`);
    res.status(201).json(activity);
  });

  return router;
};

// Export helper functions for use by other modules
module.exports.broadcastActivity = broadcastActivity;
module.exports.broadcastCompanyStatus = broadcastCompanyStatus;
module.exports.getActivityFeed = () => teamActivityFeed;
module.exports.getSseClientCount = () => sseClients.size;
module.exports.getStatusSseClientCount = () => statusSseClients.size;
