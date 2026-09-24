/**
 * Vault Client Module
 * Provides connection to HashiCorp Vault using node-vault
 */

// Validate required environment variables
if (!process.env.VAULT_ADDR) {
  throw new Error('VAULT_ADDR environment variable is required');
}

if (!process.env.VAULT_TOKEN && !process.env.VAULT_ROLE_ID) {
  throw new Error('VAULT_TOKEN or VAULT_ROLE_ID environment variable is required');
}

// Initialize Vault client
let vaultClient;

if (process.env.VAULT_TOKEN) {
  // Token-based authentication (development)
  vaultClient = require('node-vault')({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN
  });
} else {
  // AppRole authentication (production)
  // Will authenticate using role_id and secret_id
  vaultClient = require('node-vault')({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR
  });
}

const vault = vaultClient;

/**
 * Read a secret from Vault KV v2 engine
 * @param {string} path - Secret path (without 'secret/data/' prefix)
 * @returns {Promise<object>} Secret data
 */
async function readSecret(path) {
  try {
    const result = await vault.read(`secret/data/${path}`);
    return result.data.data;
  } catch (error) {
    throw new Error(`Failed to read secret at ${path}: ${error.message}`);
  }
}

/**
 * Write a secret to Vault KV v2 engine
 * @param {string} path - Secret path (without 'secret/data/' prefix)
 * @param {object} data - Secret data to store
 * @returns {Promise<object>} Write result
 */
async function writeSecret(path, data) {
  try {
    const result = await vault.write(`secret/data/${path}`, { data });
    return result;
  } catch (error) {
    throw new Error(`Failed to write secret at ${path}: ${error.message}`);
  }
}

/**
 * Delete a secret from Vault KV v2 engine
 * @param {string} path - Secret path (without 'secret/data/' prefix)
 * @returns {Promise<void>}
 */
async function deleteSecret(path) {
  try {
    await vault.delete(`secret/data/${path}`);
  } catch (error) {
    throw new Error(`Failed to delete secret at ${path}: ${error.message}`);
  }
}

/**
 * List secrets at a path
 * @param {string} path - Path to list
 * @returns {Promise<string[]>} List of secret keys
 */
async function listSecrets(path) {
  try {
    const result = await vault.list(`secret/metadata/${path}`);
    return result.data.keys;
  } catch (error) {
    throw new Error(`Failed to list secrets at ${path}: ${error.message}`);
  }
}

/**
 * Encrypt data using Transit engine
 * @param {string} keyName - Transit key name
 * @param {string} plaintext - Data to encrypt (will be base64 encoded)
 * @returns {Promise<string>} Ciphertext
 */
async function encryptData(keyName, plaintext) {
  try {
    const encoded = Buffer.from(plaintext).toString('base64');
    const result = await vault.write(`transit/encrypt/${keyName}`, {
      plaintext: encoded
    });
    return result.data.ciphertext;
  } catch (error) {
    throw new Error(`Failed to encrypt with key ${keyName}: ${error.message}`);
  }
}

/**
 * Decrypt data using Transit engine
 * @param {string} keyName - Transit key name
 * @param {string} ciphertext - Ciphertext to decrypt
 * @returns {Promise<string>} Decrypted plaintext
 */
async function decryptData(keyName, ciphertext) {
  try {
    const result = await vault.write(`transit/decrypt/${keyName}`, {
      ciphertext
    });
    return Buffer.from(result.data.plaintext, 'base64').toString('utf-8');
  } catch (error) {
    throw new Error(`Failed to decrypt with key ${keyName}: ${error.message}`);
  }
}

/**
 * AppRole Login
 * @param {string} roleId - AppRole Role ID
 * @param {string} secretId - AppRole Secret ID
 * @returns {Promise<object>} Auth result with token
 */
async function appRoleLogin(roleId, secretId) {
  try {
    const result = await vault.write('auth/approle/login', {
      role_id: roleId,
      secret_id: secretId
    });
    return {
      token: result.auth.client_token,
      policies: result.auth.policies,
      ttl: result.auth.lease_duration
    };
  } catch (error) {
    throw new Error(`AppRole login failed: ${error.message}`);
  }
}

module.exports = vault;
module.exports.readSecret = readSecret;
module.exports.writeSecret = writeSecret;
module.exports.deleteSecret = deleteSecret;
module.exports.listSecrets = listSecrets;
module.exports.encryptData = encryptData;
module.exports.decryptData = decryptData;
module.exports.appRoleLogin = appRoleLogin;
