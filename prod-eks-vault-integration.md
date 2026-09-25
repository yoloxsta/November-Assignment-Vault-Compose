# Production EKS + Vault Integration Guide

Complete step-by-step guide for integrating a Node.js application running on Amazon EKS with HashiCorp Vault for dynamic database credentials.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Method 1: Kubernetes Authentication (Recommended)](#method-1-kubernetes-authentication-recommended)
4. [Method 2: Vault Agent Sidecar](#method-2-vault-agent-sidecar)
5. [Method 3: AppRole Authentication](#method-3-approle-authentication)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────┐    ┌───────────────────────────┐ │
│  │         EKS Cluster                   │    │    Vault Infrastructure   │ │
│  │                                       │    │                           │ │
│  │  ┌─────────────────────────────────┐ │    │  ┌─────────────────────┐  │ │
│  │  │  Namespace: production          │ │    │  │ Vault Server (HA)  │  │ │
│  │  │                                 │ │    │  │                     │  │ │
│  │  │  ┌───────────────────────────┐  │ │    │  │  - 3 replicas      │  │ │
│  │  │  │  Backend Deployment       │  │ │    │  │  - Raft storage    │  │ │
│  │  │  │                           │  │ │    │  │  - Auto-unseal     │  │ │
│  │  │  │  ┌─────────┐ ┌─────────┐  │  │ │    │  │    (AWS KMS)       │  │ │
│  │  │  │  │ Pod 1   │ │ Pod 2   │  │  │ │    │  │                     │  │ │
│  │  │  │  │         │ │         │  │  │ │    │  └──────────┬──────────┘  │ │
│  │  │  │  │ Service │ │ Service │  │  │ │    │             │             │ │
│  │  │  │  │ Account │ │ Account │  │  │ │    │             │             │ │
│  │  │  │  │ JWT     │ │ JWT     │  │  │ │    │             │             │ │
│  │  │  │  └────┬────┘ └────┬────┘  │  │ │    │             │             │ │
│  │  │  │       │           │       │  │ │    │             │             │ │
│  │  │  └───────┼───────────┼───────┘  │ │    │             │             │ │
│  │  │          │           │          │ │    │             │             │ │
│  │  └──────────┼───────────┼──────────┘ │    │             │             │ │
│  │             │           │            │    │             │             │ │
│  │             └─────┬─────┘            │    │             │             │ │
│  │                   │                  │    │             │             │ │
│  │                   │ Kubernetes Auth  │    │             │             │ │
│  │                   │                  │    │             │             │ │
│  │                   ▼                  │    │             ▼             │ │
│  │  ┌─────────────────────────────────┐ │    │  ┌─────────────────────┐  │ │
│  │  │  Network Policy / Security Group│ │    │  │  PostgreSQL (RDS)   │  │ │
│  │  │  Allow: EKS → Vault :8200       │ │    │  │                     │  │ │
│  │  │  Allow: EKS → RDS :5432         │ │    │  │  Primary + Replica  │  │ │
│  │  └─────────────────────────────────┘ │    │  │  Multi-AZ           │  │ │
│  │                                       │    │  └─────────────────────┘  │ │
│  └──────────────────────────────────────┘    └───────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Supporting Services                            │  │
│  │                                                                        │  │
│  │  - AWS KMS (Auto-unseal)                                              │  │
│  │  - AWS Secrets Manager (Vault unseal keys backup)                     │  │
│  │  - AWS S3 (Vault Raft storage snapshots)                              │  │
│  │  - AWS IAM (Service accounts via IRSA)                                │  │
│  │                                                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Kubernetes Authentication Flow                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Pod Starts                                                           │
│     └─► Kubernetes mounts Service Account JWT                            │
│         /var/run/secrets/kubernetes.io/serviceaccount/token              │
│                                                                          │
│  2. Application Initializes                                              │
│     └─► Reads JWT from file                                              │
│     └─► Sends to Vault: POST /v1/auth/kubernetes/login                   │
│         {                                                                │
│           "role": "backend-role",                                        │
│           "jwt": "eyJhbGciOiJSUzI1NiIsImtpZCI6IiJ9..."                   │
│         }                                                                │
│                                                                          │
│  3. Vault Validates                                                      │
│     └─► Calls Kubernetes TokenReview API                                 │
│     └─► Verifies:                                                        │
│         - Service Account name matches role                              │
│         - Namespace matches bound_service_account_namespaces             │
│         - JWT is valid and not expired                                   │
│                                                                          │
│  4. Vault Returns Token                                                  │
│     {                                                                    │
│       "auth": {                                                          │
│         "client_token": "s.abcdef123456",                                │
│         "lease_duration": 3600,                                          │
│         "policies": ["backend-policy"]                                   │
│       }                                                                  │
│     }                                                                    │
│                                                                          │
│  5. Application Uses Token                                               │
│     └─► GET /v1/database/creds/app-role                                  │
│     └─► Header: X-Vault-Token: s.abcdef123456                            │
│     └─► Returns: { "username": "v-token-xxx", "password": "..." }        │
│                                                                          │
│  6. Database Connection                                                  │
│     └─► App connects to RDS with dynamic credentials                     │
│     └─► Vault created user in PostgreSQL                                 │
│     └─► Credentials auto-expire after lease_duration                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Required Tools

```bash
# Install required CLI tools
brew install kubectl helm vault awscli

# Verify installations
kubectl version --client
helm version
vault version
aws --version
```

### AWS Resources Required

1. **EKS Cluster** (1.24+)
2. **RDS PostgreSQL** instance
3. **AWS KMS** key for Vault auto-unseal
4. **IAM OIDC Provider** for IRSA (IAM Roles for Service Accounts)

### Verify EKS Cluster

```bash
# Configure kubectl for your EKS cluster
aws eks update-kubeconfig --region us-east-1 --name my-eks-cluster

# Verify connection
kubectl get nodes

# Expected output:
# NAME                                       STATUS   ROLES    AGE   VERSION
# ip-10-0-1-100.us-east-1.compute.internal   Ready    <none>   30d   v1.28.0
# ip-10-0-2-100.us-east-1.compute.internal   Ready    <none>   30d   v1.28.0
```

### Verify IAM OIDC Provider

```bash
# Get OIDC provider URL
aws eks describe-cluster \
  --name my-eks-cluster \
  --query "cluster.identity.oidc.issuer" \
  --output text

# Expected output:
# https://oidc.eks.us-east-1.amazonaws.com/id/EXAMPLED539D18xxx

# Verify OIDC provider exists in IAM
aws iam list-open-id-connect-providers \
  --query "OpenIDConnectProviderList[?contains(Arn, 'EXAMPLED539D18xxx')].Arn" \
  --output text
```

---

## Method 1: Kubernetes Authentication (Recommended)

### Step 1: Deploy Vault on EKS

#### 1.1 Add HashiCorp Helm Repository

```bash
# Add Helm repo
helm repo add hashicorp https://helm.releases.hashicorp.com

# Update repo
helm repo update

# Search for Vault chart
helm search repo hashicorp/vault
```

#### 1.2 Create Vault Namespace

```bash
kubectl create namespace vault
```

#### 1.3 Create Custom Values File

Create `vault-values.yaml`:

```yaml
# vault-values.yaml

global:
  enabled: true
  namespace: vault

server:
  # High availability mode
  ha:
    enabled: true
    replicas: 3
    
    # Raft storage
    raft:
      enabled: true
      setNodeId: true
      
      # Persistence for Raft
      config: |
        ui = true
        listener "tcp" {
          tls_disable = 1
          address = "[::]:8200"
          cluster_address = "[::]:8201"
        }
        storage "raft" {
          path = "/vault/data"
        }
        disable_mlock = true
        
        # Auto-unseal using AWS KMS
        seal "awskms" {
          region = "us-east-1"
          kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
        }

  # Resource limits
  resources:
    requests:
      memory: "256Mi"
      cpu: "250m"
    limits:
      memory: "512Mi"
      cpu: "500m"

  # Persistence
  dataStorage:
    enabled: true
    size: 10Gi
    storageClass: "gp2"

  # Service configuration
  service:
    type: LoadBalancer
    annotations: |
      service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
      service.beta.kubernetes.io/aws-load-balancer-internal: "true"

# UI
ui:
  enabled: true
  serviceType: LoadBalancer
  serviceNodePort: null
  externalPort: 8200
```

#### 1.4 Install Vault

```bash
# Install Vault using Helm
helm install vault hashicorp/vault \
  --namespace vault \
  --values vault-values.yaml

# Check status
kubectl get pods -n vault

# Expected output:
# NAME                                    READY   STATUS    RESTARTS   AGE
# vault-0                                 0/1     Running   0          30s
# vault-1                                 0/1     Running   0          30s
# vault-2                                 0/1     Running   0          30s
# vault-agent-injector-5c7b8f9d4c-x9y2z   1/1     Running   0          30s
```

#### 1.5 Initialize Vault (First Time Only)

```bash
# Initialize Vault (only on first install)
kubectl exec -n vault vault-0 -- vault operator init -format=json > vault-init.json

# Save the unseal keys and root token securely!
# Example output:
# {
#   "keys": ["key1", "key2", "key3", "key4", "key5"],
#   "root_token": "s.xxxxxxxx"
# }

# If using AWS KMS auto-unseal, Vault auto-unseals automatically
# Verify Vault is unsealed
kubectl exec -n vault vault-0 -- vault status

# Expected output:
# Key                      Value
# ---                      -----
# Seal Type                awskms
# Initialized              true
# Sealed                   false
# Total Shares             5
# ...
```

#### 1.6 Get Vault Service Address

```bash
# Get Vault service address
kubectl get svc -n vault

# For internal access from EKS pods:
VAULT_ADDR="http://vault.vault.svc.cluster.local:8200"

# For external access (if LoadBalancer):
VAULT_ADDR="http://$(kubectl get svc vault -n vault -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'):8200"

echo "Vault Address: $VAULT_ADDR"
```

---

### Step 2: Configure Database Secrets Engine

#### 2.1 Login to Vault

```bash
# Port-forward to Vault (for local access)
kubectl port-forward -n vault svc/vault 8200:8200 &

# Set Vault address
export VAULT_ADDR="http://127.0.0.1:8200"

# Login with root token
export VAULT_TOKEN="s.xxxxxxxx"  # From vault-init.json

# Verify login
vault status
```

#### 2.2 Enable Database Secrets Engine

```bash
# Enable database secrets engine
vault secrets enable database

# Expected output:
# Success! Enabled the database secrets engine at: database/
```

#### 2.3 Configure PostgreSQL Connection

```bash
# Configure PostgreSQL connection
vault write database/config/postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="app-role" \
  connection_url="postgresql://{{username}}:{{password}}@mydb.xxxx.us-east-1.rds.amazonaws.com:5432/vault_demo?sslmode=require" \
  username="vault_admin" \
  password="your-admin-password"

# Note: vault_admin is a static admin user that Vault uses to create dynamic users
# This user should have CREATEROLE privilege in PostgreSQL
```

#### 2.4 Create Database Role

```bash
# Create role for application
vault write database/roles/app-role \
  db_name=postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Verify role
vault read database/roles/app-role

# Test credential generation
vault read database/creds/app-role

# Expected output:
# Key                Value
# ---                -----
# lease_id           database/creds/app-role/xxxxx
# lease_duration     1h
# lease_renewable    true
# password           xxxx-xxxx-xxxx-xxxx
# username           v-token-xxxx
```

---

### Step 3: Enable Kubernetes Authentication

#### 3.1 Enable Kubernetes Auth Method

```bash
# Enable Kubernetes auth
vault auth enable kubernetes

# Expected output:
# Success! Enabled kubernetes auth method at: kubernetes/
```

#### 3.2 Configure Kubernetes Auth

```bash
# Get Kubernetes API server URL
K8S_API_SERVER="https://kubernetes.default.svc:443"

# Get Kubernetes CA certificate (from inside cluster)
kubectl exec -n vault vault-0 -- sh -c '
  kubectl config view --raw --minify --flatten -o jsonpath="{.clusters[].cluster.certificate-authority-data}" | base64 -d > /tmp/k8s-ca.crt
  cat /tmp/k8s-ca.crt
'

# Option A: Let Vault auto-discover Kubernetes configuration (easiest)
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc:443"

# Option B: Manual configuration (more control)
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc:443" \
  kubernetes_ca_cert=@/tmp/k8s-ca.crt \
  token_reviewer_jwt=@/var/run/secrets/kubernetes.io/serviceaccount/token

# Expected output:
# Success! Data written to: auth/kubernetes/config
```

#### 3.3 Verify Configuration

```bash
# Read current config
vault read auth/kubernetes/config

# Expected output:
# Key                       Value
# ---                       -----
# kubernetes_host           https://kubernetes.default.svc:443
# kubernetes_ca_cert        -----BEGIN CERTIFICATE-----...
```

---

### Step 4: Create Policy and Role

#### 4.1 Create Policy for Application

Create `backend-policy.hcl`:

```hcl
# backend-policy.hcl
# Policy for backend application

# Read database credentials
path "database/creds/app-role" {
  capabilities = ["read"]
}

# Renew own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Lookup own token
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
```

Apply the policy:

```bash
# Create policy
vault policy write backend-policy backend-policy.hcl

# Verify policy
vault policy read backend-policy

# Expected output:
# path "database/creds/app-role" {
#   capabilities = ["read"]
# }
# ...
```

#### 4.2 Create Kubernetes Auth Role

```bash
# Create role that maps Kubernetes Service Account to Vault policy
vault write auth/kubernetes/role/backend-role \
  bound_service_account_names=backend-sa \
  bound_service_account_namespaces=production \
  policies=backend-policy \
  ttl=1h

# Verify role
vault read auth/kubernetes/role/backend-role

# Expected output:
# Key                                 Value
# ---                                 -----
# bound_service_account_names         [backend-sa]
# bound_service_account_namespaces    [production]
# policies                            [backend-policy]
# token_policies                      [backend-policy]
# ttl                                 1h
```

---

### Step 5: Deploy Application to EKS

#### 5.1 Create Namespace

```bash
kubectl create namespace production
```

#### 5.2 Create Service Account

Create `backend-service-account.yaml`:

```yaml
# backend-service-account.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: backend-sa
  namespace: production
```

Apply:

```bash
kubectl apply -f backend-service-account.yaml

# Verify
kubectl get serviceaccounts -n production backend-sa
```

#### 5.3 Create ConfigMap for Vault Configuration

Create `backend-config.yaml`:

```yaml
# backend-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
  namespace: production
data:
  VAULT_ADDR: "http://vault.vault.svc.cluster.local:8200"
  VAULT_ROLE: "backend-role"
  VAULT_AUTH_METHOD: "kubernetes"
  DB_HOST: "mydb.xxxx.us-east-1.rds.amazonaws.com"
  DB_PORT: "5432"
  DB_NAME: "vault_demo"
```

Apply:

```bash
kubectl apply -f backend-config.yaml
```

#### 5.4 Create Secret for Initial Configuration (Optional)

If you need any static secrets:

```yaml
# backend-secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: backend-secrets
  namespace: production
type: Opaque
stringData:
  # Any static secrets (not database credentials - those come from Vault)
  API_KEY: "your-api-key"
```

#### 5.5 Update Application Code

Update `backend/src/vault.js`:

```javascript
/**
 * Vault Client Module - Kubernetes Authentication
 * For EKS Production Deployment
 */

const axios = require('axios');
const fs = require('fs');

// Configuration from environment
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault.vault.svc.cluster.local:8200';
const VAULT_ROLE = process.env.VAULT_ROLE || 'backend-role';
const VAULT_AUTH_METHOD = process.env.VAULT_AUTH_METHOD || 'kubernetes';

// Kubernetes Service Account JWT path
const K8S_JWT_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';

// Token cache
let token = null;
let tokenExpiry = null;

/**
 * Login to Vault using Kubernetes authentication
 * @returns {Promise<string>} Vault token
 */
async function loginWithKubernetes() {
  try {
    // Read Kubernetes Service Account JWT
    if (!fs.existsSync(K8S_JWT_PATH)) {
      throw new Error(
        'Kubernetes Service Account JWT not found. ' +
        'Make sure the pod has a service account configured.'
      );
    }
    
    const jwt = fs.readFileSync(K8S_JWT_PATH, 'utf8').trim();
    
    console.log('🔐 Logging in to Vault with Kubernetes auth...');
    console.log(`   Vault Address: ${VAULT_ADDR}`);
    console.log(`   Role: ${VAULT_ROLE}`);
    
    // Login to Vault
    const response = await axios.post(
      `${VAULT_ADDR}/v1/auth/kubernetes/login`,
      {
        role: VAULT_ROLE,
        jwt: jwt,
      },
      {
        timeout: 10000, // 10 second timeout
      }
    );
    
    // Extract token and expiry
    token = response.data.auth.client_token;
    const leaseDuration = response.data.auth.lease_duration;
    tokenExpiry = Date.now() + (leaseDuration * 1000);
    
    console.log('✅ Successfully authenticated with Vault');
    console.log(`   Token lease duration: ${leaseDuration}s`);
    console.log(`   Policies: ${response.data.auth.policies.join(', ')}`);
    
    return token;
    
  } catch (error) {
    const message = error.response?.data?.errors?.join(', ') || error.message;
    throw new Error(`Vault Kubernetes auth failed: ${message}`);
  }
}

/**
 * Get a valid Vault token (login if necessary)
 * @returns {Promise<string>} Vault token
 */
async function getToken() {
  // Check if we need to login
  if (!token || !tokenExpiry || Date.now() >= tokenExpiry - 60000) {
    // Refresh token 1 minute before expiry
    await loginWithKubernetes();
  }
  return token;
}

/**
 * Read a secret from Vault
 * @param {string} path - Secret path (e.g., 'database/creds/app-role')
 * @returns {Promise<object>} Secret data
 */
async function read(path) {
  try {
    const vaultToken = await getToken();
    
    const response = await axios.get(
      `${VAULT_ADDR}/v1/${path}`,
      {
        headers: {
          'X-Vault-Token': vaultToken,
        },
        timeout: 10000,
      }
    );
    
    return response.data;
    
  } catch (error) {
    // If unauthorized, try to re-authenticate
    if (error.response?.status === 403 || error.response?.status === 401) {
      console.log('⚠️ Token invalid, re-authenticating...');
      token = null;
      tokenExpiry = null;
      
      const vaultToken = await getToken();
      
      const response = await axios.get(
        `${VAULT_ADDR}/v1/${path}`,
        {
          headers: {
            'X-Vault-Token': vaultToken,
          },
          timeout: 10000,
        }
      );
      
      return response.data;
    }
    
    const message = error.response?.data?.errors?.join(', ') || error.message;
    throw new Error(`Failed to read from Vault (${path}): ${message}`);
  }
}

/**
 * Renew Vault token
 * @returns {Promise<void>}
 */
async function renewToken() {
  try {
    const vaultToken = await getToken();
    
    const response = await axios.post(
      `${VAULT_ADDR}/v1/auth/token/renew-self`,
      {},
      {
        headers: {
          'X-Vault-Token': vaultToken,
        },
        timeout: 10000,
      }
    );
    
    const leaseDuration = response.data.auth.lease_duration;
    tokenExpiry = Date.now() + (leaseDuration * 1000);
    
    console.log(`✅ Token renewed, new expiry in ${leaseDuration}s`);
    
  } catch (error) {
    console.error('❌ Failed to renew token:', error.message);
    // Force re-login on next request
    token = null;
    tokenExpiry = null;
  }
}

/**
 * Health check for Vault connection
 * @returns {Promise<{healthy: boolean, message: string}>}
 */
async function healthCheck() {
  try {
    const vaultToken = await getToken();
    
    // Test read
    await read('database/creds/app-role');
    
    return {
      healthy: true,
      message: 'Vault connection healthy',
      tokenExpiresIn: tokenExpiry ? Math.round((tokenExpiry - Date.now()) / 1000) : null,
    };
    
  } catch (error) {
    return {
      healthy: false,
      message: error.message,
    };
  }
}

module.exports = {
  read,
  getToken,
  renewToken,
  healthCheck,
  loginWithKubernetes,
};
```

#### 5.6 Create Deployment

Create `backend-deployment.yaml`:

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: production
  labels:
    app: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      # Use the service account we created
      serviceAccountName: backend-sa
      
      containers:
      - name: backend
        image: your-ecr-repo.amazonaws.com/backend:latest
        imagePullPolicy: Always
        
        # Load environment from ConfigMap
        envFrom:
        - configMapRef:
            name: backend-config
        
        # Additional environment variables
        env:
        - name: NODE_ENV
          value: "production"
        
        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        
        # Health checks
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        
        # Resource limits
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        
        # Security context
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
        
        # Volume mounts (for logs, temp files)
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: logs
          mountPath: /app/logs
      
      # Volumes
      volumes:
      - name: tmp
        emptyDir: {}
      - name: logs
        emptyDir: {}
      
      # Pod security context
      securityContext:
        fsGroup: 1000
```

Apply:

```bash
kubectl apply -f backend-deployment.yaml

# Check deployment
kubectl get deployments -n production

# Expected output:
# NAME      READY   UP-TO-DATE   AVAILABLE   AGE
# backend   2/2     2            2           30s

# Check pods
kubectl get pods -n production

# Expected output:
# NAME                      READY   STATUS    RESTARTS   AGE
# backend-6b8c9d5f4-abc12   1/1     Running   0          30s
# backend-6b8c9d5f4-xyz34   1/1     Running   0          30s
```

#### 5.7 Create Service

Create `backend-service.yaml`:

```yaml
# backend-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: production
spec:
  type: ClusterIP
  selector:
    app: backend
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
```

Apply:

```bash
kubectl apply -f backend-service.yaml
```

---

### Step 6: Verify Everything Works

#### 6.1 Check Application Logs

```bash
# Get pod names
kubectl get pods -n production

# Check logs
kubectl logs -n production -l app=backend --tail=50

# Expected output:
# 🔌 Getting dynamic database credentials from Vault...
# 🔐 Logging in to Vault with Kubernetes auth...
#    Vault Address: http://vault.vault.svc.cluster.local:8200
#    Role: backend-role
# ✅ Successfully authenticated with Vault
# ✅ Got credentials from Vault:
#    Username: v-token-abc123
#    Lease ID: database/creds/app-role/xxxxx
#    Lease Duration: 3600s
#    Expires: 2024-09-23T15:30:00.000Z
# ✅ Database connection established
# 🔄 Will refresh credentials in 2520s (at 70% of lease)
```

#### 6.2 Test API Endpoint

```bash
# Port-forward to backend
kubectl port-forward -n production svc/backend 3000:80 &

# Test health endpoint
curl http://localhost:3000/health

# Expected output:
# {
#   "status": "healthy",
#   "database": {
#     "healthy": true,
#     "message": "Database connection healthy",
#     "credentials": {
#       "username": "v-token-abc123",
#       "secondsUntilExpiry": 3400
#     }
#   }
# }
```

#### 6.3 Test Database Connection

```bash
# Create a test task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Test task from EKS", "description": "Testing Vault integration"}'

# Get all tasks
curl http://localhost:3000/api/tasks
```

---

## Method 2: Vault Agent Sidecar

Vault Agent runs as a sidecar container and automatically:
- Authenticates with Kubernetes auth
- Retrieves secrets
- Writes secrets to a shared volume
- Renews tokens and leases

### Step 1: Install Vault Agent Injector

The Vault Helm chart includes the injector by default. If you installed Vault following Method 1, the injector is already running.

```bash
# Verify injector is running
kubectl get pods -n vault -l app.kubernetes.io/name=vault-agent-injector

# Expected output:
# NAME                                    READY   STATUS    RESTARTS   AGE
# vault-agent-injector-5c7b8f9d4c-x9y2z   1/1     Running   0          10m
```

### Step 2: Create Application Deployment with Annotations

Create `backend-deployment-sidecar.yaml`:

```yaml
# backend-deployment-sidecar.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: production
  labels:
    app: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
      annotations:
        # Enable Vault Agent injection
        vault.hashicorp.com/agent-inject: "true"
        
        # Vault role
        vault.hashicorp.com/role: "backend-role"
        
        # Inject database credentials
        vault.hashicorp.com/agent-inject-secret-db-creds: "database/creds/app-role"
        vault.hashicorp.com/agent-inject-template-db-creds: |
          {{- with secret "database/creds/app-role" -}}
          {
            "username": "{{ .Data.username }}",
            "password": "{{ .Data.password }}",
            "lease_id": "{{ .LeaseID }}",
            "lease_duration": {{ .LeaseDuration }}
          }
          {{- end }}
        
        # Vault address
        vault.hashicorp.com/secret-volume-path: "/vault/secrets"
        
        # Renew credentials before they expire
        vault.hashicorp.com/agent-revoke-on-shutdown: "true"
        
    spec:
      serviceAccountName: backend-sa
      
      containers:
      - name: backend
        image: your-ecr-repo.amazonaws.com/backend:latest
        imagePullPolicy: Always
        
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          value: "mydb.xxxx.us-east-1.rds.amazonaws.com"
        - name: DB_PORT
          value: "5432"
        - name: DB_NAME
          value: "vault_demo"
        - name: DB_CREDS_PATH
          value: "/vault/secrets/db-creds"
        
        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        
        # Mount the shared volume where Vault Agent writes secrets
        volumeMounts:
        - name: vault-secrets
          mountPath: /vault/secrets
          readOnly: true
        
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
        
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
        
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      
      volumes:
      - name: vault-secrets
        emptyDir:
          medium: Memory
```

Apply:

```bash
kubectl apply -f backend-deployment-sidecar.yaml
```

### Step 3: Update Application Code for Sidecar

When using Vault Agent sidecar, your code doesn't need to communicate with Vault at all. The sidecar writes credentials to a file.

Update `backend/src/vault.js`:

```javascript
/**
 * Vault Client Module - Vault Agent Sidecar Mode
 * Reads credentials from file written by Vault Agent
 */

const fs = require('fs');
const path = require('path');

// Path to credentials file (set by Vault Agent sidecar)
const CREDS_PATH = process.env.DB_CREDS_PATH || '/vault/secrets/db-creds';

// Cache for credentials
let cachedCredentials = null;
let lastReadTime = 0;
const CACHE_TTL = 5000; // 5 seconds cache

/**
 * Read credentials from file written by Vault Agent
 * @returns {object} Credentials object
 */
function readCredentialsFromFile() {
  try {
    // Check if file exists
    if (!fs.existsSync(CREDS_PATH)) {
      throw new Error(
        `Credentials file not found at ${CREDS_PATH}. ` +
        'Ensure Vault Agent sidecar is configured.'
      );
    }
    
    // Read file
    const data = fs.readFileSync(CREDS_PATH, 'utf8');
    const creds = JSON.parse(data);
    
    // Update cache
    cachedCredentials = creds;
    lastReadTime = Date.now();
    
    return creds;
    
  } catch (error) {
    // Return cached credentials if available
    if (cachedCredentials) {
      console.warn('⚠️ Failed to read credentials file, using cache:', error.message);
      return cachedCredentials;
    }
    throw error;
  }
}

/**
 * Read secret (mock function for compatibility)
 * @param {string} path - Secret path (ignored, reads from file)
 * @returns {Promise<object>} Secret data in Vault API format
 */
async function read(secretPath) {
  // Read from file
  const creds = readCredentialsFromFile();
  
  // Return in same format as Vault API for compatibility with db.js
  return {
    data: {
      username: creds.username,
      password: creds.password,
    },
    lease_id: creds.lease_id || 'agent-managed',
    lease_duration: creds.lease_duration || 3600,
  };
}

/**
 * Get current credentials info
 * @returns {object} Credentials info
 */
function getCredentialsInfo() {
  const creds = readCredentialsFromFile();
  return {
    username: creds.username,
    leaseId: creds.lease_id,
    leaseDuration: creds.lease_duration,
    path: CREDS_PATH,
    lastRead: new Date(lastReadTime).toISOString(),
  };
}

/**
 * Health check
 * @returns {Promise<{healthy: boolean, message: string}>}
 */
async function healthCheck() {
  try {
    const creds = readCredentialsFromFile();
    
    if (!creds.username || !creds.password) {
      return { healthy: false, message: 'Invalid credentials' };
    }
    
    return {
      healthy: true,
      message: 'Credentials file available',
      credentials: getCredentialsInfo(),
    };
    
  } catch (error) {
    return {
      healthy: false,
      message: error.message,
    };
  }
}

module.exports = {
  read,
  readCredentialsFromFile,
  getCredentialsInfo,
  healthCheck,
};
```

### Step 4: Verify Sidecar Injection

```bash
# Get pod details
kubectl get pods -n production -l app=backend

# Describe pod to see injected containers
kubectl describe pod -n production -l app=backend

# You should see TWO containers:
# - backend (your application)
# - vault-agent-injector (sidecar)

# Check logs of Vault Agent
kubectl logs -n production -l app=backend -c vault-agent-init

# Expected output:
# [INFO]  sink: sink file: token written: path=/home/vault/.vault-token
# [INFO]  template: receiving template event: source=/vault/secrets/db-creds

# Check application logs
kubectl logs -n production -l app=backend -c backend

# Check the credentials file inside the pod
kubectl exec -n production -l app=backend -c backend -- cat /vault/secrets/db-creds

# Expected output:
# {
#   "username": "v-token-abc123",
#   "password": "xxxx-xxxx-xxxx-xxxx",
#   "lease_id": "database/creds/app-role/xxxxx",
#   "lease_duration": 3600
# }
```

---

## Method 3: AppRole Authentication

Use AppRole when Kubernetes auth is not available or when you need machine-to-machine authentication outside of Kubernetes.

### Step 1: Enable AppRole Auth

```bash
# Enable AppRole auth method
vault auth enable approle

# Expected output:
# Success! Enabled the approle auth method at: approle/
```

### Step 2: Create AppRole

```bash
# Create AppRole
vault write auth/approle/role/backend-role \
  token_policies="backend-policy" \
  token_ttl=1h \
  token_max_ttl=4h \
  secret_id_ttl=0 \
  secret_id_num_uses=0

# Get Role ID
vault read auth/approle/role/backend-role/role-id

# Expected output:
# Key        Value
# ---        -----
# role_id    xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Generate Secret ID
vault write -f auth/approle/role/backend-role/secret-id

# Expected output:
# Key                   Value
# ---                   -----
# secret_id             xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# secret_id_accessor    xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Step 3: Store Credentials in Kubernetes Secrets

```yaml
# vault-approle-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: vault-approle
  namespace: production
type: Opaque
stringData:
  role-id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  secret-id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Apply:

```bash
kubectl apply -f vault-approle-secret.yaml
```

### Step 4: Update Deployment

```yaml
# backend-deployment-approle.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      serviceAccountName: backend-sa
      containers:
      - name: backend
        image: your-ecr-repo.amazonaws.com/backend:latest
        env:
        - name: VAULT_ADDR
          value: "http://vault.vault.svc.cluster.local:8200"
        - name: VAULT_AUTH_METHOD
          value: "approle"
        - name: DB_HOST
          value: "mydb.xxxx.us-east-1.rds.amazonaws.com"
        - name: VAULT_APPROLE_ROLE_ID
          valueFrom:
            secretKeyRef:
              name: vault-approle
              key: role-id
        - name: VAULT_APPROLE_SECRET_ID
          valueFrom:
            secretKeyRef:
              name: vault-approle
              key: secret-id
        ports:
        - containerPort: 3000
```

### Step 5: Update Application Code

Update `backend/src/vault.js`:

```javascript
/**
 * Vault Client Module - AppRole Authentication
 */

const axios = require('axios');

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault.vault.svc.cluster.local:8200';
const ROLE_ID = process.env.VAULT_APPROLE_ROLE_ID;
const SECRET_ID = process.env.VAULT_APPROLE_SECRET_ID;

let token = null;
let tokenExpiry = null;

/**
 * Login to Vault using AppRole
 */
async function loginWithAppRole() {
  try {
    console.log('🔐 Logging in to Vault with AppRole...');
    
    const response = await axios.post(`${VAULT_ADDR}/v1/auth/approle/login`, {
      role_id: ROLE_ID,
      secret_id: SECRET_ID,
    });
    
    token = response.data.auth.client_token;
    const leaseDuration = response.data.auth.lease_duration;
    tokenExpiry = Date.now() + (leaseDuration * 1000);
    
    console.log('✅ Successfully authenticated with Vault');
    console.log(`   Token lease duration: ${leaseDuration}s`);
    
    return token;
    
  } catch (error) {
    const message = error.response?.data?.errors?.join(', ') || error.message;
    throw new Error(`AppRole auth failed: ${message}`);
  }
}

/**
 * Get valid token
 */
async function getToken() {
  if (!token || !tokenExpiry || Date.now() >= tokenExpiry - 60000) {
    await loginWithAppRole();
  }
  return token;
}

/**
 * Read secret from Vault
 */
async function read(path) {
  const vaultToken = await getToken();
  
  const response = await axios.get(`${VAULT_ADDR}/v1/${path}`, {
    headers: { 'X-Vault-Token': vaultToken },
    timeout: 10000,
  });
  
  return response.data;
}

module.exports = { read, loginWithAppRole, getToken };
```

---

## Security Best Practices

### 1. Network Security

```yaml
# Network Policy - Restrict access to Vault
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: vault-access
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: vault
      podSelector:
        matchLabels:
          app.kubernetes.io/name: vault
    ports:
    - protocol: TCP
      port: 8200
  - to:
    # Allow DNS
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
```

### 2. IAM Roles for Service Accounts (IRSA)

If Vault needs AWS permissions (e.g., for KMS auto-unseal):

```yaml
# Create IAM policy for Vault
# This is done via AWS CLI or Terraform

# IAM Policy Document
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/xxxxx"
    }
  ]
}
```

```bash
# Create IAM role for service account
eksctl create iamserviceaccount \
  --cluster my-eks-cluster \
  --namespace vault \
  --name vault-sa \
  --attach-policy-arn arn:aws:iam::123456789012:policy/VaultKMSAccess \
  --approve
```

### 3. Pod Security Standards

```yaml
# Pod Security Policy (or Pod Security Standards in newer K8s)
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  runAsUser:
    rule: MustRunAsNonRoot
  seLinux:
    rule: RunAsAny
  fsGroup:
    rule: RunAsAny
  supplementalGroups:
    rule: RunAsAny
  volumes:
  - 'configMap'
  - 'emptyDir'
  - 'projected'
  - 'secret'
  - 'downwardAPI'
  - 'persistentVolumeClaim'
  readOnlyRootFilesystem: true
```

### 4. Vault Policy Least Privilege

```hcl
# Minimal policy for backend application
path "database/creds/app-role" {
  capabilities = ["read"]
}

# Do NOT grant:
# - database/config/* (admin access)
# - database/roles/* (admin access)
# - sys/* (system admin)
```

### 5. Secret Rotation

```bash
# Set short TTL for database credentials
vault write database/roles/app-role \
  db_name=postgres \
  creation_statements="..." \
  default_ttl="5m" \     # Short TTL for high-security
  max_ttl="1h"

# Application will auto-renew at 70% of TTL
```

---

## Troubleshooting

### Issue 1: "Service Account JWT not found"

**Symptoms:**
```
Error: Kubernetes Service Account JWT not found
```

**Solution:**
```bash
# Check if service account exists
kubectl get serviceaccount backend-sa -n production

# Check if pod is using service account
kubectl get pod -n production -l app=backend -o jsonpath='{.items[0].spec.serviceAccountName}'

# Check if JWT is mounted
kubectl exec -n production -l app=backend -- ls -la /var/run/secrets/kubernetes.io/serviceaccount/
```

### Issue 2: "permission denied"

**Symptoms:**
```
Error: Vault Kubernetes auth failed: permission denied
```

**Solution:**
```bash
# Check Vault role configuration
vault read auth/kubernetes/role/backend-role

# Verify service account name matches
# bound_service_account_names must match pod's serviceAccountName
# bound_service_account_namespaces must match pod's namespace

# Check Kubernetes auth config
vault read auth/kubernetes/config
```

### Issue 3: "no handler for route"

**Symptoms:**
```
Error: no handler for route "database/creds/app-role"
```

**Solution:**
```bash
# Check if database secrets engine is enabled
vault secrets list

# Enable if needed
vault secrets enable database

# Check if role exists
vault read database/roles/app-role

# Create if needed
vault write database/roles/app-role ...
```

### Issue 4: Vault Agent Not Injecting Secrets

**Symptoms:**
Pod starts but `/vault/secrets/db-creds` is empty or missing

**Solution:**
```bash
# Check injector is running
kubectl get pods -n vault -l app.kubernetes.io/name=vault-agent-injector

# Check injector logs
kubectl logs -n vault -l app.kubernetes.io/name=vault-agent-injector

# Verify annotations are correct
kubectl get pod -n production -l app=backend -o yaml | grep -A 10 annotations

# Check if pod has both containers
kubectl get pod -n production -l app=backend -o jsonpath='{.spec.containers[*].name}'

# Should show: backend vault-agent
```

### Issue 5: Token Renewal Failing

**Symptoms:**
```
Error: failed to renew token
```

**Solution:**
```bash
# Check token TTL
vault token lookup

# Check if token is renewable
vault token lookup -format=json | jq '.data.renewable'

# Manually renew
vault token renew

# Check policy allows renewal
vault policy read backend-policy

# Ensure policy has:
# path "auth/token/renew-self" {
#   capabilities = ["update"]
# }
```

### Useful Debugging Commands

```bash
# Check Vault connectivity from pod
kubectl exec -n production -l app=backend -- curl -s http://vault.vault.svc.cluster.local:8200/v1/sys/health

# Check pod can access Kubernetes API
kubectl exec -n production -l app=backend -- curl -s --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
  https://kubernetes.default.svc/api/v1/namespaces/production/pods

# View Vault audit logs (if enabled)
kubectl logs -n vault -l app.kubernetes.io/name=vault | grep audit

# Test database connectivity from pod
kubectl exec -n production -l app=backend -- nc -zv mydb.xxxx.us-east-1.rds.amazonaws.com 5432
```

---

## Summary

### Method Comparison

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| **Kubernetes Auth** | EKS native apps | No secrets stored, automatic auth | Requires Vault config |
| **Vault Agent Sidecar** | Simplest code | Zero Vault code, auto-renewal | Extra container per pod |
| **AppRole** | Non-K8s apps | Works anywhere | Requires secret management |

### Recommended Setup for Production

1. **Use Kubernetes Authentication** - Most secure for EKS
2. **Enable auto-unseal with AWS KMS** - Automatic unseal on restart
3. **Use Raft storage** - Built-in replication
4. **Set short TTLs** - 5-15 minutes for database credentials
5. **Enable audit logging** - Track all access
6. **Use network policies** - Restrict pod-to-pod communication
7. **Monitor with Prometheus** - Track Vault metrics

### Files Created

```
vault-lab/
├── vault-values.yaml              # Helm values for Vault
├── backend-policy.hcl             # Vault policy
├── backend-service-account.yaml   # K8s ServiceAccount
├── backend-config.yaml            # K8s ConfigMap
├── backend-deployment.yaml        # K8s Deployment
├── backend-service.yaml           # K8s Service
├── vault-approle-secret.yaml      # AppRole secrets (if using Method 3)
└── backend-deployment-sidecar.yaml # Sidecar deployment (if using Method 2)
```

---

## Next Steps

1. **Add Monitoring**: Deploy Prometheus and Grafana to monitor Vault and application
2. **Add Alerting**: Set up alerts for credential expiry, failed auth attempts
3. **Implement Backup**: Configure Vault Raft snapshots to S3
4. **Add TLS**: Enable TLS for Vault traffic in production
5. **Disaster Recovery**: Document and test Vault recovery procedures
