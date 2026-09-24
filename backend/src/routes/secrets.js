const express = require('express');
const router = express.Router();
const vault = require('../vault');

/**
 * GET /api/secrets/:path(*)
 * Read a secret from Vault
 */
router.get('/:path(*)', async (req, res) => {
  try {
    const path = req.params.path;
    const data = await vault.readSecret(path);
    
    res.json({
      success: true,
      path: path,
      data: data
    });
  } catch (error) {
    console.error('Read secret error:', error.message);
    res.status(404).json({ 
      error: 'Secret not found', 
      details: error.message 
    });
  }
});

/**
 * POST /api/secrets
 * Write a secret to Vault
 * Body: { path: string, data: object }
 */
router.post('/', async (req, res) => {
  try {
    const { path, data } = req.body;
    
    if (!path || !data) {
      return res.status(400).json({ 
        error: 'path and data are required' 
      });
    }

    await vault.writeSecret(path, data);
    
    res.status(201).json({
      success: true,
      message: 'Secret stored successfully',
      path: path
    });
  } catch (error) {
    console.error('Write secret error:', error.message);
    res.status(500).json({ 
      error: 'Failed to store secret', 
      details: error.message 
    });
  }
});

/**
 * PUT /api/secrets/:path(*)
 * Update a secret in Vault
 */
router.put('/:path(*)', async (req, res) => {
  try {
    const path = req.params.path;
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ 
        error: 'data is required' 
      });
    }

    await vault.writeSecret(path, data);
    
    res.json({
      success: true,
      message: 'Secret updated successfully',
      path: path
    });
  } catch (error) {
    console.error('Update secret error:', error.message);
    res.status(500).json({ 
      error: 'Failed to update secret', 
      details: error.message 
    });
  }
});

/**
 * DELETE /api/secrets/:path(*)
 * Delete a secret from Vault
 */
router.delete('/:path(*)', async (req, res) => {
  try {
    const path = req.params.path;
    await vault.deleteSecret(path);
    
    res.json({
      success: true,
      message: 'Secret deleted successfully',
      path: path
    });
  } catch (error) {
    console.error('Delete secret error:', error.message);
    res.status(500).json({ 
      error: 'Failed to delete secret', 
      details: error.message 
    });
  }
});

module.exports = router;
