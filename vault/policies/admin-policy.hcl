# Admin Policy
# Full access to all secrets and configuration

# Full access to all KV secrets
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Manage auth methods
path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Manage policies
path "sys/policies/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Manage secret engines
path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Transit engine
path "transit/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Database secrets engine
path "database/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# System capabilities
path "sys/health" {
  capabilities = ["read", "sudo"]
}

path "sys/leader" {
  capabilities = ["read"]
}

path "sys/audit" {
  capabilities = ["read", "list"]
}
