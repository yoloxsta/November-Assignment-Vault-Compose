# AppRole Authentication Setup Guide

Complete guide to switch from Token authentication to AppRole authentication.

---

## Overview

### Current Method (Token)
```javascript
VAULT_TOKEN=dev-only-token  // Static, never expires
```

### New Method (AppRole)
```javascript
VAULT_ROLE_ID=abc-123-xyz     // Like username
VAULT_SECRET_ID=xyz-789-abc   // Like password (can rotate)
```

---

## Why AppRole?

| Feature | Token | AppRole |
|---------|-------|---------|
| Security | Low | High |
| Token Rotation | Manual | Automatic |
| Instance Tracking | No | Yes (unique per instance) |
| Compromise Impact | All services | Only one instance |
| Production Ready | No | Yes |

---

## Step-by-Step Setup

### Step 1: Enable AppRole Authentication

```powershell
# Enable AppRole auth method in Vault
docker exec vault-server vault auth enable approle

# Expected output:
# Success! Enabled approle auth method at: approle/
```

### Step 2: Create Policy for Your Application

```powershell
# Create policy file
docker exec vault-server vault policy write backend-policy - <<EOF
# Read database credentials
path "database/creds/app-role" {
  capabilities = ["read"]
}

# Read secrets from KV engine
path "secret/data/*" {
  capabilities = ["read"]
}

# List secrets (optional)
path "secret/metadata/*" {
  capabilities = ["list"]
}
EOF

# Verify policy created
docker exec vault-server vault policy read backend-policy
```

### Step 3: Create AppRole

```powershell
# Create the role with specific configuration
docker exec vault-server vault write auth/approle/role/backend-app `
  secret_id_ttl=24h `
  token_ttl=1h `
  token_max_ttl=4h `
  secret_id_limit=10 `
  policies="backend-policy"

# Expected output:
# Success! Data written to: auth/approle/role/backend-app
```

**Configuration Explained:**

| Parameter | Value | Meaning |
|-----------|-------|---------|
| secret_id_ttl | 24h | Secret ID valid for 24 hours |
| token_ttl | 1h | Generated token valid for 1 hour |
| token_max_ttl | 4h | Maximum token lifetime 4 hours |
| secret_id_limit | 10 | Max 10 active secret IDs |
| policies | backend-policy | Attach our policy |

### Step 4: Get Role ID

```powershell
# Get the Role ID (this is like a username - static)
docker exec vault-server vault read auth/approle/role/backend-app/role-id

# Expected output:
# Key        Value
# ---        -----
# role_id    abc-123-xyz-456-789

# Save this value - you'll need it later!
```

### Step 5: Generate Secret ID

```powershell
# Generate a new Secret ID (this is like a password - can be rotated)
docker exec vault-server vault write -f auth/approle/role/backend-app/secret-id

# Expected output:
# Key                   Value
# ---                   -----
# secret_id             xyz-789-abc-123-456
# secret_id_accessor    12345-abcde-67890
# secret_id_ttl         24h

# Save this value - you'll need it later!
```

### Step 6: Update docker-compose.yml

```yaml
# Open docker-compose.yml and update backend environment
backend:
  build: ./backend
  container_name: vault-backend
  environment:
    - VAULT_ADDR=http://vault:8200
    # Remove this line:
    # - VAULT_TOKEN=dev-only-token
    
    # Add these lines instead:
    - VAULT_ROLE_ID=abc-123-xyz-456-789        # From Step 4
    - VAULT_SECRET_ID=xyz-789-abc-123-456      # From Step 5
    - DB_HOST=postgres
    - DB_NAME=vault_demo
  depends_on:
    - vault
    - postgres
  networks:
    - vault-network
```

### Step 7: Update Backend Code

Create new file: `backend/src/vault-approle.js`

```javascript
/**
 * Vault Client with AppRole Authentication
 */

const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR || 'http://vault:8200'
});

let currentToken = null;
let tokenExpiry = null;

/**
 * Authenticate with Vault using AppRole
 * @returns {Promise<object>} Auth result
 */
async function loginWithAppRole() {
  try {
    console.log('🔐 Authenticating with Vault using AppRole...');
    
    // Validate environment variables
    if (!process.env.VAULT_ROLE_ID || !process.env.VAULT_SECRET_ID) {
      throw new Error('VAULT_ROLE_ID and VAULT_SECRET_ID are required');
    }
    
    // Authenticate with AppRole
    const result = await vault.write('auth/approle/login', {
      role_id: process.env.VAULT_ROLE_ID,
      secret_id: process.env.VAULT_SECRET_ID
    });
    
    // Extract token and metadata
    currentToken = result.auth.client_token;
    tokenExpiry = Date.now() + (result.auth.lease_duration * 1000);
    
    // Set token for future requests
    vault.token = currentToken;
    
    console.log('✅ Successfully authenticated with AppRole');
    console.log(`   Token TTL: ${result.auth.lease_duration} seconds`);
    console.log(`   Policies: ${result.auth.policies.join(', ')}`);
    console.log(`   Expires: ${new Date(tokenExpiry).toISOString()}`);
    
    return {
      token: currentToken,
      expiresAt: new Date(tokenExpiry),
      policies: result.auth.policies,
      ttl: result.auth.lease_duration
    };
    
  } catch (error) {
    console.error('❌ AppRole login failed:', error.message);
    throw error;
  }
}

/**
 * Check if token needs renewal
 * @returns {boolean} True if token needs renewal
 */
function needsRenewal() {
  if (!currentToken || !tokenExpiry) {
    return true;
  }
  
  // Renew at 80% of TTL
  const renewalThreshold = tokenExpiry - (tokenExpiry * 0.2);
  return Date.now() >= renewalThreshold;
}

/**
 * Ensure valid token (renew if needed)
 * @returns {Promise<void>}
 */
async function ensureValidToken() {
  if (needsRenewal()) {
    console.log('🔄 Token needs renewal, re-authenticating...');
    await loginWithAppRole();
  }
}

/**
 * Read a secret from Vault
 * @param {string} path - Secret path
 * @returns {Promise<object>} Secret data
 */
async function readSecret(path) {
  await ensureValidToken();
  
  try {
    const result = await vault.read(path);
    return result.data;
  } catch (error) {
    console.error(`❌ Failed to read secret at ${path}:`, error.message);
    throw error;
  }
}

/**
 * Get database credentials
 * @returns {Promise<object>} Database credentials
 */
async function getDatabaseCredentials() {
  await ensureValidToken();
  
  try {
    console.log('🔑 Getting dynamic database credentials...');
    
    const result = await vault.read('database/creds/app-role');
    
    return {
      username: result.data.username,
      password: result.data.password,
      leaseId: result.lease_id,
      leaseDuration: result.lease_duration,
      expiresAt: new Date(Date.now() + (result.lease_duration * 1000))
    };
    
  } catch (error) {
    console.error('❌ Failed to get database credentials:', error.message);
    throw error;
  }
}

/**
 * Initialize Vault connection
 * @returns {Promise<void>}
 */
async function initializeVault() {
  try {
    // Step 1: Authenticate with AppRole
    await loginWithAppRole();
    
    // Step 2: Schedule periodic token renewal
    const renewalInterval = 30 * 60 * 1000; // Check every 30 minutes
    setInterval(async () => {
      try {
        await ensureValidToken();
      } catch (error) {
        console.error('❌ Token renewal failed:', error.message);
      }
    }, renewalInterval);
    
    console.log('✅ Vault initialized with AppRole authentication');
    
  } catch (error) {
    console.error('❌ Vault initialization failed:', error.message);
    throw error;
  }
}

module.exports = {
  vault,
  loginWithAppRole,
  ensureValidToken,
  readSecret,
  getDatabaseCredentials,
  initializeVault
};
```

### Step 8: Update Backend Entry Point

Update `backend/src/index.js`:

```javascript
const express = require('express');
const { initializeVault, getDatabaseCredentials } = require('./vault-approle');
const { Pool } = require('pg');

const app = express();
let pool = null;

async function startServer() {
  try {
    // Step 1: Initialize Vault with AppRole
    await initializeVault();
    
    // Step 2: Get database credentials from Vault
    const dbCreds = await getDatabaseCredentials();
    console.log('✅ Got database credentials:');
    console.log(`   Username: ${dbCreds.username}`);
    console.log(`   Expires: ${dbCreds.expiresAt.toISOString()}`);
    
    // Step 3: Create database connection pool
    pool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: 5432,
      database: process.env.DB_NAME || 'vault_demo',
      user: dbCreds.username,
      password: dbCreds.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
    
    // Step 4: Test database connection
    const client = await pool.connect();
    console.log('✅ Database connection established');
    client.release();
    
    // Step 5: Schedule credential renewal
    const renewalTime = dbCreds.leaseDuration * 0.8 * 1000;
    setTimeout(async () => {
      await renewDatabaseCredentials();
    }, renewalTime);
    
    // Step 6: Start Express server
    app.listen(3000, () => {
      console.log('🚀 Backend server running on http://localhost:3000');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

async function renewDatabaseCredentials() {
  try {
    console.log('🔄 Renewing database credentials...');
    
    // Get new credentials
    const newCreds = await getDatabaseCredentials();
    
    // Create new pool
    const newPool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: 5432,
      database: process.env.DB_NAME || 'vault_demo',
      user: newCreds.username,
      password: newCreds.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
    
    // Test new connection
    const client = await newPool.connect();
    client.release();
    
    // Replace old pool
    const oldPool = pool;
    pool = newPool;
    
    // Close old pool
    if (oldPool) {
      await oldPool.end();
    }
    
    console.log('✅ Database credentials renewed');
    
    // Schedule next renewal
    const renewalTime = newCreds.leaseDuration * 0.8 * 1000;
    setTimeout(async () => {
      await renewDatabaseCredentials();
    }, renewalTime);
    
  } catch (error) {
    console.error('❌ Failed to renew credentials:', error.message);
    // Retry in 1 minute
    setTimeout(async () => {
      await renewDatabaseCredentials();
    }, 60000);
  }
}

startServer();
```

### Step 9: Restart Services

```powershell
# Rebuild and restart backend
docker-compose up -d --build backend

# Wait for startup
Start-Sleep -Seconds 10

# Check logs
docker logs vault-backend --tail 50
```

### Step 10: Verify AppRole Authentication

```powershell
# Check backend logs
docker logs vault-backend --tail 30

# Expected output:
# 🔐 Authenticating with Vault using AppRole...
# ✅ Successfully authenticated with AppRole
#    Token TTL: 3600 seconds
#    Policies: backend-policy
# ✅ Got database credentials:
#    Username: v-token-abc-xyz
# ✅ Database connection established
# 🚀 Backend server running on http://localhost:3000
```

---

## Testing AppRole Setup

### Test 1: Verify AppRole Configuration

```powershell
# Check AppRole is enabled
docker exec vault-server vault auth list

# Should show:
# Path         Type        Description
# ----         ----        -----------
# approle/     approle     n/a
# token/       token       token based credentials
```

### Test 2: Manual AppRole Login

```powershell
# Login manually using AppRole
docker exec vault-server vault write auth/approle/login `
  role_id="YOUR_ROLE_ID" `
  secret_id="YOUR_SECRET_ID"

# Expected output:
# Key                     Value
# ---                     -----
# token                   s.abc123xyz
# token_duration          1h
# token_policies          ["backend-policy"]
```

### Test 3: Generate New Secret ID

```powershell
# If you need to rotate secret_id
docker exec vault-server vault write -f auth/approle/role/backend-app/secret-id

# This gives you a new secret_id
# Old one will still work until it expires (24h)
```

### Test 4: Revoke Old Secret IDs

```powershell
# List all secret IDs
docker exec vault-server vault list auth/approle/role/backend-app/secret-id

# Destroy a specific secret ID (if compromised)
docker exec vault-server vault write auth/approle/role/backend-app/secret-id-accessor/destroy `
  secret_id_accessor="ACCESSOR_ID"
```

---

## AppRole vs Token: Side-by-Side

### Token Authentication (Old)

```javascript
// Simple but not secure
const vault = require('node-vault')({
  token: 'dev-only-token'  // Never changes
});
```

### AppRole Authentication (New)

```javascript
// More complex but secure
const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: 'http://vault:8200'
});

// Login to get temporary token
const result = await vault.write('auth/approle/login', {
  role_id: 'abc-123',
  secret_id: 'xyz-789'  // Can rotate
});

// Token expires in 1 hour
vault.token = result.auth.client_token;
```

---

## Security Comparison

### If Token is Leaked

```
Token Leaked: "dev-only-token"
├── Attacker has permanent access
├── Token never expires
├── Must manually revoke
├── Update all services
└── HIGH security risk
```

### If Secret ID is Leaked

```
Secret ID Leaked: "xyz-789"
├── Attacker can only get 1-hour tokens
├── Generate NEW secret_id
├── Old secret_id expires in 24h
├── Tokens from old secret_id expire in 1h
└── LIMITED security risk
```

---

## Production Checklist

- [ ] AppRole enabled in Vault
- [ ] Policy created with least privilege
- [ ] Role configured with appropriate TTLs
- [ ] Role ID stored securely
- [ ] Secret ID generated and stored in secrets manager
- [ ] Backend code updated to use AppRole
- [ ] Environment variables configured
- [ ] Token renewal implemented
- [ ] Database credential renewal implemented
- [ ] Audit logs enabled
- [ ] Monitoring configured

---

## Common Issues and Solutions

### Issue 1: "permission denied"

```
Error: permission denied

Solution:
1. Check policy exists: vault policy read backend-policy
2. Check role has policy: vault read auth/approle/role/backend-app
3. Verify role_id and secret_id are correct
```

### Issue 2: "invalid role ID"

```
Error: invalid role ID

Solution:
1. Verify role_id is correct
2. Check role exists: vault read auth/approle/role/backend-app/role-id
```

### Issue 3: "secret ID does not exist"

```
Error: secret ID does not exist

Solution:
1. Secret ID may have expired (24h TTL)
2. Generate new secret ID
3. Update environment variable
4. Restart service
```

### Issue 4: Token Expired

```
Error: token is expired

Solution:
Your code should auto-renew. If not:
1. Check renewal logic in vault-approle.js
2. Verify ensureValidToken() is called before each operation
```

---

## Quick Reference Commands

```powershell
# Enable AppRole
vault auth enable approle

# Create policy
vault policy write backend-policy - <<EOF
path "database/creds/app-role" { capabilities = ["read"] }
EOF

# Create role
vault write auth/approle/role/backend-app \
  token_ttl=1h \
  policies="backend-policy"

# Get role_id
vault read auth/approle/role/backend-app/role-id

# Generate secret_id
vault write -f auth/approle/role/backend-app/secret-id

# Login with AppRole
vault write auth/approle/login \
  role_id="ROLE_ID" \
  secret_id="SECRET_ID"

# List roles
vault list auth/approle/role

# Read role configuration
vault read auth/approle/role/backend-app
```

---

## Summary

**What Changed:**

| Before (Token) | After (AppRole) |
|----------------|-----------------|
| Static token | Dynamic tokens |
| Never expires | 1-hour token TTL |
| No rotation | Auto-rotation |
| Shared by all | Unique per instance |
| Low security | High security |

**Steps to Implement:**

1. Enable AppRole auth method
2. Create policy for your app
3. Create AppRole with TTLs
4. Get role_id and secret_id
5. Update docker-compose.yml
6. Update backend code
7. Restart services
8. Verify in logs

**Result:**

Your application now uses industry-standard AppRole authentication with automatic token rotation and better security!

---

**Next Step: Follow the commands above to switch from Token to AppRole!**
