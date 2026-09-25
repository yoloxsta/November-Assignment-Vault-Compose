#!/bin/sh
# Vault Setup Commands

export VAULT_ADDR='http://localhost:8200'
export VAULT_TOKEN='dev-only-token'

# Create database role
vault write database/roles/app-role \
  db_name=postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl=1h \
  max_ttl=24h

# Test credential generation
vault read database/creds/app-role

# Enable userpass auth
vault auth enable userpass

# Create user
vault write auth/userpass/users/soetintaung \
  password='yngWIE500!@#' \
  policies='view-all-credentials'

echo "Vault setup complete!"
