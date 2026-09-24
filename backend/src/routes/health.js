const express = require('express');
const router = express.Router();
const vault = require('../vault');

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    // Check Vault connection
    let vaultStatus = 'connected';
    let vaultHealth = null;
    
    try {
      vaultHealth = await vault.read('sys/health');
    } catch (error) {
      vaultStatus = 'disconnected';
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'running',
        vault: vaultStatus
      },
      vault: vaultHealth ? {
        initialized: vaultHealth.initialized,
        sealed: vaultHealth.sealed,
        standby: vaultHealth.standby
      } : null
    };

    const httpStatus = vaultStatus === 'connected' ? 200 : 503;
    res.status(httpStatus).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
