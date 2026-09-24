path "secret/data/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/*" {
  capabilities = ["list"]
}

path "database/creds/*" {
  capabilities = ["read"]
}

path "database/roles/*" {
  capabilities = ["read", "list"]
}
