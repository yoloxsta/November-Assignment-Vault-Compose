/**
 * Database Connection Module
 * Uses Vault dynamic credentials to connect to PostgreSQL
 */

const { Pool } = require('pg');
const vault = require('./vault');

let pool = null;
let currentCredentials = null;
let credentialRefreshTimer = null;

/**
 * Get dynamic database credentials from Vault
 * @returns {Promise<object>} Database credentials
 */
async function getDynamicCredentials() {
  try {
    // Request dynamic credentials from Vault
    const result = await vault.read('database/creds/app-role');
    
    return {
      username: result.data.username,
      password: result.data.password,
      leaseId: result.lease_id,
      leaseDuration: result.lease_duration,
      expiresAt: new Date(Date.now() + (result.lease_duration * 1000))
    };
  } catch (error) {
    throw new Error(`Failed to get database credentials: ${error.message}`);
  }
}

/**
 * Initialize database connection with dynamic credentials
 * @returns {Promise<Pool>} PostgreSQL connection pool
 */
async function initializeDatabase() {
  console.log('🔌 Getting dynamic database credentials from Vault...');
  
  // Get dynamic credentials
  currentCredentials = await getDynamicCredentials();
  
  console.log(`✅ Got credentials:`);
  console.log(`   Username: ${currentCredentials.username}`);
  console.log(`   Expires: ${currentCredentials.expiresAt.toISOString()}`);
  
  // Create connection pool
  pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'vault_demo',
    user: currentCredentials.username,
    password: currentCredentials.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    console.log('✅ Database connection established');
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }

  // Schedule credential renewal (refresh at 80% of lease duration)
  const refreshTime = (currentCredentials.leaseDuration * 0.8) * 1000;
  console.log(`🔄 Will refresh credentials in ${Math.round(refreshTime / 1000)} seconds`);
  
  credentialRefreshTimer = setTimeout(async () => {
    await renewCredentials();
  }, refreshTime);

  return pool;
}

/**
 * Renew database credentials
 */
async function renewCredentials() {
  try {
    console.log('🔄 Renewing database credentials...');
    
    // Get new credentials
    const newCredentials = await getDynamicCredentials();
    
    // Create new pool with new credentials
    const newPool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'vault_demo',
      user: newCredentials.username,
      password: newCredentials.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test new connection
    const client = await newPool.connect();
    client.release();
    
    // Replace old pool
    const oldPool = pool;
    pool = newPool;
    currentCredentials = newCredentials;
    
    // Close old pool gracefully
    if (oldPool) {
      await oldPool.end();
    }
    
    console.log(`✅ Credentials renewed:`);
    console.log(`   New username: ${currentCredentials.username}`);
    console.log(`   Expires: ${currentCredentials.expiresAt.toISOString()}`);
    
    // Schedule next renewal
    const refreshTime = (currentCredentials.leaseDuration * 0.8) * 1000;
    credentialRefreshTimer = setTimeout(async () => {
      await renewCredentials();
    }, refreshTime);
    
  } catch (error) {
    console.error('❌ Failed to renew credentials:', error.message);
    // Retry in 1 minute
    setTimeout(async () => {
      await renewCredentials();
    }, 60000);
  }
}

/**
 * Get current database pool
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

/**
 * Get current credentials info
 * @returns {object} Current credentials metadata
 */
function getCredentialsInfo() {
  if (!currentCredentials) {
    return null;
  }
  
  return {
    username: currentCredentials.username,
    leaseId: currentCredentials.leaseId,
    leaseDuration: currentCredentials.leaseDuration,
    expiresAt: currentCredentials.expiresAt,
    timeUntilExpiry: Math.max(0, currentCredentials.expiresAt - new Date())
  };
}

/**
 * Close database connection
 */
async function closeDatabase() {
  if (credentialRefreshTimer) {
    clearTimeout(credentialRefreshTimer);
  }
  
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔌 Database connection closed');
  }
}

module.exports = {
  initializeDatabase,
  getPool,
  getCredentialsInfo,
  closeDatabase
};
