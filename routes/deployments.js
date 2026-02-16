const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'deployments.json');

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
      id: req.params.id, // Preserve ID
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

// POST deploy agent (trigger deployment)
router.post('/:id/deploy', async (req, res) => {
  try {
    const data = await loadDeployments();
    const deployment = data.deployments.find(d => d.id === req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    
    // Mark as deploying
    deployment.status = 'active';
    deployment.deployedAt = new Date().toISOString();
    deployment.updatedAt = new Date().toISOString();
    
    await saveDeployments(data);
    
    res.json({
      success: true,
      message: `Deployment triggered for ${deployment.companyName}`,
      deployment
    });
  } catch (error) {
    console.error('Error deploying agent:', error);
    res.status(500).json({ error: 'Failed to deploy agent' });
  }
});

module.exports = router;
