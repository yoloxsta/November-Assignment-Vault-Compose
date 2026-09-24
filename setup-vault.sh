#!/bin/bash

echo "========================================"
echo "Setting up Vault Database Integration"
echo "========================================"

export VAULT_ADDR='http://localhost:8200'
export VAULT_TOKEN='dev-only-token'

echo ""
echo "1. Enabling database secrets engine..."
vault secrets enable database || echo "Already enabled"

echo ""
echo "2. Configuring PostgreSQL connection..."
vault write database/config/postgres \
    plugin_name=postgresql-database-plugin \
    allowed_roles="app-role" \
    connection_url="postgresql://{{username}}:{{password}}@postgres:5432/vault_demo?sslmode=disable" \
    username="postgres" \
    password="postgres"

echo ""
echo "3. Creating role for application..."
vault write database/roles/app-role \
    db_name=postgres \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="1h"

echo ""
echo "4. Testing dynamic credential generation..."
vault read database/creds/app-role

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
