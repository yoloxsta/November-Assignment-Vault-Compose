#!/bin/sh
# Vault Setup Script
# This script initializes Vault with policies, auth methods, and sample secrets
# Run this after Vault starts

set -e

echo "🔐 Setting up Vault..."

# Wait for Vault to be ready
echo "Waiting for Vault to start..."
until vault status > /dev/null 2>&1; do
  sleep 1
done

echo "✅ Vault is ready!"

# Enable KV v2 secrets engine (already enabled in dev mode, but let's be explicit)
echo "Enabling KV v2 secrets engine..."
vault secrets enable -path=secret kv-v2 || echo "KV v2 already enabled"

# Enable Transit secrets engine for encryption-as-a-service
echo "Enabling Transit secrets engine..."
vault secrets enable transit || echo "Transit already enabled"

# Create encryption key for transit
echo "Creating transit encryption key..."
vault write -f transit/keys/myapp-key || echo "Key already exists"

# Enable AppRole auth method
echo "Enabling AppRole auth method..."
vault auth enable approle || echo "AppRole already enabled"

# Create policies
echo "Creating policies..."
vault policy write app-policy /vault/policies/app-policy.hcl
vault policy write admin-policy /vault/policies/admin-policy.hcl

# Create AppRole for backend application
echo "Creating AppRole..."
vault write auth/approle/role/my-app \
  token_policies="app-policy" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=0

# Create sample secrets
echo "Creating sample secrets..."
vault kv put secret/myapp/database \
  username="db_user" \
  password="SuperSecretDbPassword123!" \
  host="postgres" \
  port="5432" \
  database="myapp_db"

vault kv put secret/myapp/api-keys \
  stripe_key="sk_test_1234567890" \
  sendgrid_key="SG.abcdef123456" \
  jwt_secret="my-jwt-secret-key"

vault kv put secret/shared/config \
  environment="development" \
  log_level="debug" \
  feature_flags="enabled"

# Create a token for the backend service
echo "Creating backend service token..."
BACKEND_TOKEN=$(vault token create -policy=app-policy -format=json | jq -r '.auth.client_token')
echo "Backend token: $BACKEND_TOKEN"

# Print summary
echo ""
echo "======================================"
echo "✅ Vault Setup Complete!"
echo "======================================"
echo ""
echo "📋 Summary:"
echo "  - KV v2 secrets engine: enabled at secret/"
echo "  - Transit engine: enabled for encryption"
echo "  - AppRole auth: enabled for machine auth"
echo "  - Policies: app-policy, admin-policy"
echo "  - Sample secrets: created"
echo ""
echo "🔑 Access:"
echo "  - Vault UI: http://localhost:8200"
echo "  - Root Token: dev-only-token"
echo "  - Backend Token: $BACKEND_TOKEN"
echo ""
echo "📚 Test commands:"
echo "  vault kv get secret/myapp/database"
echo "  vault kv get secret/myapp/api-keys"
echo ""
