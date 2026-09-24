# Application Policy
# Grants read/write access to application secrets

# KV v2 secrets engine paths
path "secret/data/myapp/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/myapp/*" {
  capabilities = ["list", "read", "delete"]
}

# Read-only access to shared config
path "secret/data/shared/config" {
  capabilities = ["read"]
}

# Transit engine for encryption
path "transit/encrypt/*" {
  capabilities = ["update"]
}

path "transit/decrypt/*" {
  capabilities = ["update"]
}
