#!/bin/bash
# Setup Vault Database Secrets Engine for PostgreSQL
# This configures Vault to generate dynamic PostgreSQL credentials

set -e

echo "========================================"
echo "🔧 Setting up Vault Database Integration"
echo "========================================"
echo ""

export VAULT_TOKEN="dev-only-token"
export VAULT_ADDR="http://localhost:8200"

# Enable database secrets engine
echo "1️⃣ Enabling database secrets engine..."
docker exec vault-server sh -c "VAULT_TOKEN=$VAULT_TOKEN vault secrets enable -path=database database" || echo "Already enabled"

echo ""
echo "2️⃣ Configuring PostgreSQL connection..."
# Configure PostgreSQL connection
docker exec vault-server sh -c "VAULT_TOKEN=$VAULT_TOKEN vault write database/config/postgres \
    plugin_name=postgresql-database-plugin \
    allowed_roles='app-role' \
    connection_url='postgresql://{{username}}:{{password}}@postgres:5432/vault_demo?sslmode=disable' \
    username='postgres' \
    password='postgres'"

echo ""
echo "3️⃣ Creating role for application..."
# Create role that generates credentials (using $$ for password quoting in PostgreSQL)
docker exec vault-server sh -c 'VAULT_TOKEN=dev-only-token vault write database/roles/app-role \
    db_name=postgres \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD \$\${{password}}\$\$ VALID UNTIL '\''{{expiration}}'\''; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{name}}\"; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl=1h \
    max_ttl=24h'

echo ""
echo "4️⃣ Testing dynamic credential generation..."
# Test generating credentials
docker exec vault-server sh -c "VAULT_TOKEN=$VAULT_TOKEN vault read database/creds/app-role"

echo ""
echo "========================================"
echo "✅ Vault Database Setup Complete!"
echo "========================================"
echo ""
echo "📋 Summary:"
echo "  - Database engine: enabled at database/"
echo "  - PostgreSQL connection: configured"
echo "  - Role 'app-role': created with 1h TTL"
echo ""
echo "🔑 Dynamic credentials:"
echo "  vault read database/creds/app-role"
echo ""
echo "📚 Test command:"
echo "  curl http://localhost:3000/api/db/test"
echo ""
