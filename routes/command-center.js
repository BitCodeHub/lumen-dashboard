const express = require('express');
const router = express.Router();

// Get company stats
router.get('/stats', async (req, res) => {
  try {
    const tasksWeek = await req.db.query(
      `SELECT COUNT(*) FROM tasks WHERE created_at >= NOW() - INTERVAL '7 days'`
    );
    const inProgress = await req.db.query(
      `SELECT COUNT(*) FROM tasks WHERE status = 'progress'`
    );
    const total = await req.db.query(
      `SELECT COUNT(*) FROM tasks WHERE status != 'done'`
    );
    const completed = await req.db.query(
      `SELECT COUNT(*) FROM tasks WHERE status = 'done' AND completed_at >= NOW() - INTERVAL '7 days'`
    );
    const totalWeek = await req.db.query(
      `SELECT COUNT(*) FROM tasks WHERE created_at >= NOW() - INTERVAL '7 days'`
    );

    const completionRate = totalWeek.rows[0].count > 0 
      ? Math.round((completed.rows[0].count / totalWeek.rows[0].count) * 100)
      : 0;

    const activeAgents = await req.db.query(
      `SELECT COUNT(*) FROM agent_status WHERE status = 'active' OR status = 'busy'`
    );

    res.json({
      tasksThisWeek: parseInt(tasksWeek.rows[0].count),
      inProgress: parseInt(inProgress.rows[0].count),
      total: parseInt(total.rows[0].count),
      completion: completionRate,
      activeAgents: parseInt(activeAgents.rows[0].count)
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all tasks
router.get('/tasks', async (req, res) => {
  try {
    const { status, agent, project } = req.query;
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (agent) {
      params.push(agent);
      query += ` AND assigned_to = $${params.length}`;
    }
    if (project) {
      params.push(project);
      query += ` AND project_id = $${params.length}`;
    }
    
    query += ' ORDER BY updated_at DESC';
    
    const result = await req.db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Tasks fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create task
router.post('/tasks', async (req, res) => {
  try {
    const {
      title,
      description,
      status = 'backlog',
      priority = 'medium',
      assigned_to,
      project_id,
      created_by,
      tags,
      metadata
    } = req.body;

    const result = await req.db.query(
      `INSERT INTO tasks (title, description, status, priority, assigned_to, project_id, created_by, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [title, description, status, priority, assigned_to, project_id, created_by, tags, JSON.stringify(metadata)]
    );

    // Log activity
    await req.db.query(
      `INSERT INTO activity_log (type, agent_id, task_id, title, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      ['task', created_by, result.rows[0].id, `Created task: ${title}`, JSON.stringify({action: 'create'})]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Task create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update task
router.patch('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    values.push(id);
    const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await req.db.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Log activity
    const action = updates.status ? `moved to ${updates.status}` : 'updated';
    await req.db.query(
      `INSERT INTO activity_log (type, task_id, title, metadata)
       VALUES ($1, $2, $3, $4)`,
      ['task', id, `Task ${action}: ${result.rows[0].title}`, JSON.stringify({action, updates})]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Task update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete task
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await req.db.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Log activity
    await req.db.query(
      `INSERT INTO activity_log (type, task_id, title, metadata)
       VALUES ($1, $2, $3, $4)`,
      ['task', id, `Deleted task: ${result.rows[0].title}`, JSON.stringify({action: 'delete'})]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Task delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get activity feed
router.get('/activity', async (req, res) => {
  try {
    const { limit = 50, since, type, agent } = req.query;
    
    let query = 'SELECT * FROM activity_log WHERE 1=1';
    const params = [];
    
    if (since) {
      params.push(since);
      query += ` AND created_at > $${params.length}`;
    }
    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    if (agent) {
      params.push(agent);
      query += ` AND agent_id = $${params.length}`;
    }
    
    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    
    const result = await req.db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Activity fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all agents
router.get('/agents', async (req, res) => {
  try {
    const { status, location } = req.query;
    
    let query = 'SELECT * FROM agent_status WHERE 1=1';
    const params = [];
    
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (location) {
      params.push(location);
      query += ` AND location = $${params.length}`;
    }
    
    query += ' ORDER BY name';
    
    const result = await req.db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Agents fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get projects
router.get('/projects', async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = 'SELECT * FROM projects WHERE 1=1';
    const params = [];
    
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    
    query += ' ORDER BY updated_at DESC';
    
    const result = await req.db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Projects fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Assign task to agent
router.post('/tasks/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { agent_id } = req.body;
    
    const result = await req.db.query(
      `UPDATE tasks SET assigned_to = $1, status = 'progress', updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [agent_id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Log activity
    await req.db.query(
      `INSERT INTO activity_log (type, agent_id, task_id, title, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      ['task', agent_id, id, `Assigned task to ${agent_id}: ${result.rows[0].title}`, 
       JSON.stringify({action: 'assign', agent_id})]
    );

    // Update agent status
    await req.db.query(
      `UPDATE agent_status SET current_task_id = $1, status = 'busy', updated_at = NOW()
       WHERE agent_id = $2`,
      [id, agent_id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Task assign error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
