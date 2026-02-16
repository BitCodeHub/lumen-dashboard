const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const DATA_FILE = path.join(__dirname, '..', 'data', 'deployments.json');

// VPS configurations for syncing workspace files
const VPS_CONFIGS = {
  'luna-labs-maven': {
    host: 'root@srv1352214.hstgr.cloud',
    container: 'openclaw-6zsj-openclaw-1',
    workspacePath: '/data/.openclaw/workspace'
  }
};

// Ensure data file exists
async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ deployments: [] }, null, 2));
  }
}

// Load deployments
async function loadDeployments() {
  await ensureDataFile();
  const data = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(data);
}

// Save deployments
async function saveDeployments(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET all deployments
router.get('/', async (req, res) => {
  try {
    const data = await loadDeployments();
    res.json(data);
  } catch (error) {
    console.error('Error loading deployments:', error);
    res.status(500).json({ error: 'Failed to load deployments' });
  }
});

// GET single deployment
router.get('/:id', async (req, res) => {
  try {
    const data = await loadDeployments();
    const deployment = data.deployments.find(d => d.id === req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json(deployment);
  } catch (error) {
    console.error('Error loading deployment:', error);
    res.status(500).json({ error: 'Failed to load deployment' });
  }
});

// POST new deployment
router.post('/', async (req, res) => {
  try {
    const data = await loadDeployments();
    const newDeployment = {
      id: 'dep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      ...req.body,
      workspace: req.body.workspace || {
        identity: '',
        soul: '',
        tools: '',
        agents: '',
        user: '',
        memory: ''
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.deployments.push(newDeployment);
    await saveDeployments(data);
    res.status(201).json(newDeployment);
  } catch (error) {
    console.error('Error creating deployment:', error);
    res.status(500).json({ error: 'Failed to create deployment' });
  }
});

// PUT update deployment
router.put('/:id', async (req, res) => {
  try {
    const data = await loadDeployments();
    const index = data.deployments.findIndex(d => d.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    data.deployments[index] = {
      ...data.deployments[index],
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    };
    await saveDeployments(data);
    res.json(data.deployments[index]);
  } catch (error) {
    console.error('Error updating deployment:', error);
    res.status(500).json({ error: 'Failed to update deployment' });
  }
});

// DELETE deployment
router.delete('/:id', async (req, res) => {
  try {
    const data = await loadDeployments();
    const index = data.deployments.findIndex(d => d.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    data.deployments.splice(index, 1);
    await saveDeployments(data);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting deployment:', error);
    res.status(500).json({ error: 'Failed to delete deployment' });
  }
});

// POST sync workspace to VPS
router.post('/:id/sync', async (req, res) => {
  try {
    const vpsConfig = VPS_CONFIGS[req.params.id];
    if (!vpsConfig) {
      return res.status(400).json({ error: 'No VPS configuration for this deployment' });
    }

    // Accept workspace from request body (generated MD content)
    const workspace = req.body.workspace || {};
    const results = [];

    // Sync each workspace file
    const files = [
      { name: 'IDENTITY.md', content: workspace.identity },
      { name: 'SOUL.md', content: workspace.soul },
      { name: 'TOOLS.md', content: workspace.tools },
      { name: 'AGENTS.md', content: workspace.agents },
      { name: 'USER.md', content: workspace.user },
      { name: 'MEMORY.md', content: workspace.memory }
    ];

    for (const file of files) {
      if (file.content) {
        try {
          // Escape content for shell
          const escapedContent = file.content.replace(/'/g, "'\\''");
          const cmd = `ssh ${vpsConfig.host} 'docker exec ${vpsConfig.container} bash -c "cat > ${vpsConfig.workspacePath}/${file.name}" << '\\'\\''EOFCONTENT'\\''
${escapedContent}
EOFCONTENT'`;
          
          await execPromise(cmd, { timeout: 30000 });
          results.push({ file: file.name, status: 'synced' });
        } catch (err) {
          results.push({ file: file.name, status: 'error', error: err.message });
        }
      }
    }

    // Update sync timestamp
    const index = data.deployments.findIndex(d => d.id === req.params.id);
    data.deployments[index].lastSyncedAt = new Date().toISOString();
    await saveDeployments(data);

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error syncing workspace:', error);
    res.status(500).json({ error: 'Failed to sync workspace', details: error.message });
  }
});

// GET workspace files from VPS
router.get('/:id/workspace-remote', async (req, res) => {
  try {
    const data = await loadDeployments();
    const deployment = data.deployments.find(d => d.id === req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const vpsConfig = VPS_CONFIGS[deployment.id];
    if (!vpsConfig) {
      return res.status(400).json({ error: 'No VPS configuration for this deployment' });
    }

    const workspace = {};
    const files = ['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'AGENTS.md', 'USER.md', 'MEMORY.md'];

    for (const file of files) {
      try {
        const cmd = `ssh ${vpsConfig.host} 'docker exec ${vpsConfig.container} cat ${vpsConfig.workspacePath}/${file} 2>/dev/null || echo ""'`;
        const { stdout } = await execPromise(cmd, { timeout: 30000 });
        const key = file.replace('.md', '').toLowerCase();
        workspace[key] = stdout.trim();
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }

    res.json(workspace);
  } catch (error) {
    console.error('Error fetching remote workspace:', error);
    res.status(500).json({ error: 'Failed to fetch remote workspace', details: error.message });
  }
});

module.exports = router;
