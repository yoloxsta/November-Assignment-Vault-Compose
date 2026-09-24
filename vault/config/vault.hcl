# Vault Server Configuration
# This is a development configuration - DO NOT USE IN PRODUCTION

storage "raft" {
  path    = "/vault/data"
  node_id = "vault-node-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true  # DEV ONLY - Enable TLS in production
}

api_addr = "http://vault:8200"
cluster_addr = "https://vault:8201"

# Disable mlock in containers
disable_mlock = true

# UI enabled
ui = true

# Development mode - AUTO UNSEAL
# In production, use auto-unseal with cloud KMS
