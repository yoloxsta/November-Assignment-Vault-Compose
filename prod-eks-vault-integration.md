# Complete Guide: Deploy Vault on AWS EKS with Full Stack Integration

**A comprehensive, step-by-step guide for deploying HashiCorp Vault on Amazon EKS with public access, user authentication, frontend, backend, RDS, and API key management.**

---

## Table of Contents

1. [What, Why, How Overview](#what-why-how-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Prerequisites](#prerequisites)
4. [Part 1: Deploy EKS Cluster](#part-1-deploy-eks-cluster)
5. [Part 2: Deploy RDS PostgreSQL](#part-2-deploy-rds-postgresql)
6. [Part 3: Deploy Vault on EKS](#part-3-deploy-vault-on-eks)
7. [Part 4: Configure Vault for Production](#part-4-configure-vault-for-production)
8. [Part 5: Create User Authentication](#part-5-create-user-authentication)
9. [Part 6: Configure Database Secrets Engine](#part-6-configure-database-secrets-engine)
10. [Part 7: Manage API Keys in Vault](#part-7-manage-api-keys-in-vault)
11. [Part 8: Deploy Backend Application](#part-8-deploy-backend-application)
12. [Part 9: Deploy Frontend Application](#part-9-deploy-frontend-application)
13. [Part 10: Developer Access Management](#part-10-developer-access-management)
14. [Part 11: Monitoring and Maintenance](#part-11-monitoring-and-maintenance)
15. [Part 12: Troubleshooting](#part-12-troubleshooting)
16. [Summary and Checklist](#summary-and-checklist)

---

## What, Why, How Overview

### What is Vault?

**HashiCorp Vault** is a secrets management tool that provides:
- **Dynamic secrets**: Auto-generate database credentials, API keys, certificates
- **Encryption as a Service**: Encrypt data without managing keys
- **Secrets management**: Store and access secrets securely
- **Identity-based access**: Fine-grained access control

### Why Use Vault?

| Problem | Without Vault | With Vault |
|---------|---------------|------------|
| **Database passwords** | Hardcoded in config files, never change | Auto-generated, rotate every hour |
| **API keys** | Stored in code, Git, environment variables | Stored centrally, accessed on-demand |
| **Access control** | Shared passwords, no audit trail | Individual users, full audit logging |
| **Secrets rotation** | Manual process, often forgotten | Automatic rotation, never expires |
| **Compliance** | Hard to prove security | Full audit trail, compliance ready |

### How Vault Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        How Vault Works                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User/Service authenticates to Vault                         │
│     └─► Username + Password, Kubernetes Auth, AppRole, etc.     │
│                                                                 │
│  2. Vault validates identity and returns a token                │
│     └─► Token has policies attached (permissions)               │
│                                                                 │
│  3. User/Service uses token to request secrets                  │
│     └─► GET /v1/database/creds/app-role                         │
│                                                                 │
│  4. Vault generates secrets dynamically                         │
│     └─► Creates database user with random password              │
│     └─► Returns: { username: "v-token-xxx", password: "..." }   │
│                                                                 │
│  5. Secrets have lease duration (auto-expire)                   │
│     └─► 1 hour default, automatically revoked after expiry      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Deploy on EKS?

| Feature | Benefit |
|---------|---------|
| **High Availability** | Multiple replicas across availability zones |
| **Auto-scaling** | Scale based on demand |
| **Kubernetes Integration** | Native pod authentication |
| **AWS Integration** | KMS auto-unseal, RDS, IAM |
| **Cost Effective** | Pay for what you use |
| **Managed Service** | AWS handles the infrastructure |

---

## Architecture Diagram

### Complete Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud (us-east-1)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                            Internet Gateway                                │ │
│  │                         (Public Internet Access)                           │ │
│  └────────────────────────────────┬──────────────────────────────────────────┘ │
│                                   │                                             │
│                                   ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                          Application Load Balancer                         │ │
│  │                                                                              │ │
│  │   vault.example.com ──────────────────► Vault UI (Public)                 │ │
│  │   api.example.com   ──────────────────► Backend API (Public)              │ │
│  │   app.example.com   ──────────────────► Frontend (Public)                 │ │
│  │                                                                              │ │
│  └────────────────────────────────┬──────────────────────────────────────────┘ │
│                                   │                                             │
│                                   ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                              EKS Cluster                                   │ │
│  │                                                                              │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐   │ │
│  │  │                    Kubernetes Namespace: vault                      │   │ │
│  │  │                                                                     │   │ │
│  │  │  ┌──────────────────────────────────────────────────────────────┐  │   │ │
│  │  │  │                    Vault StatefulSet                          │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │   │ │
│  │  │  │   │  vault-0    │  │  vault-1    │  │  vault-2    │        │  │   │ │
│  │  │  │   │  (Leader)   │  │  (Standby)  │  │  (Standby)  │        │  │   │ │
│  │  │  │   │             │  │             │  │             │        │  │   │ │
│  │  │  │   │ Port: 8200  │  │ Port: 8200  │  │ Port: 8200  │        │  │   │ │
│  │  │  │   │ Port: 8201  │  │ Port: 8201  │  │ Port: 8201  │        │  │   │ │
│  │  │  │   └─────────────┘  └─────────────┘  └─────────────┘        │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  │   Storage: Raft (replicated)                                 │  │   │ │
│  │  │  │   Auto-unseal: AWS KMS                                       │  │   │ │
│  │  │  │   Snapshots: S3                                              │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  └──────────────────────────────────────────────────────────────┘  │   │ │
│  │  │                                                                     │   │ │
│  │  │  ┌──────────────────────────────────────────────────────────────┐  │   │ │
│  │  │  │              Vault Agent Injector (DaemonSet)                │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  │   Injects secrets into pods automatically                     │  │   │ │
│  │  │  │   Manages token renewal                                       │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  └──────────────────────────────────────────────────────────────┘  │   │ │
│  │  │                                                                     │   │ │
│  │  └────────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                              │ │
│  │  ┌────────────────────────────────────────────────────────────────────┐   │ │
│  │  │                 Kubernetes Namespace: production                   │   │ │
│  │  │                                                                     │   │ │
│  │  │  ┌──────────────────────────────────────────────────────────────┐  │   │ │
│  │  │  │                    Backend Deployment                         │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │   │ │
│  │  │  │   │  backend    │  │  backend    │  │  backend    │        │  │   │ │
│  │  │  │   │  pod-1      │  │  pod-2      │  │  pod-3      │        │  │   │ │
│  │  │  │   │             │  │             │  │             │        │  │   │ │
│  │  │  │   │ Service     │  │ Service     │  │ Service     │        │  │   │ │
│  │  │  │   │ Account:    │  │ Account:    │  │ Account:    │        │  │   │ │
│  │  │  │   │ backend-sa  │  │ backend-sa  │  │ backend-sa  │        │  │   │ │
│  │  │  │   └─────────────┘  └─────────────┘  └─────────────┘        │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  │   ┌─────────────────────────────────────────────────┐       │  │   │ │
│  │  │  │   │         Service: backend-service               │       │  │   │ │
│  │  │  │   │         Port: 80 → Container: 3000             │       │  │   │ │
│  │  │  │   └─────────────────────────────────────────────────┘       │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  └──────────────────────────────────────────────────────────────┘  │   │ │
│  │  │                                                                     │   │ │
│  │  │  ┌──────────────────────────────────────────────────────────────┐  │   │ │
│  │  │  │                    Frontend Deployment                        │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  │   ┌─────────────┐  ┌─────────────┐                         │  │   │ │
│  │  │  │   │  frontend   │  │  frontend   │                         │  │   │ │
│  │  │  │   │  pod-1      │  │  pod-2      │                         │  │   │ │
│  │  │  │   │             │  │             │                         │  │   │ │
│  │  │  │   │ Nginx +     │  │ Nginx +     │                         │  │   │ │
│  │  │  │   │ React Build │  │ React Build │                         │  │   │ │
│  │  │  │   └─────────────┘  └─────────────┘                         │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  │   ┌─────────────────────────────────────────────────┐       │  │   │ │
│  │  │  │   │         Service: frontend-service              │       │  │   │ │
│  │  │  │   │         Port: 80 → Container: 80              │       │  │   │ │
│  │  │  │   └─────────────────────────────────────────────────┘       │  │   │ │
│  │  │  │                                                               │  │   │ │
│  │  │  └──────────────────────────────────────────────────────────────┘  │   │ │
│  │  │                                                                     │   │ │
│  │  └────────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                             │
│                                   │                                             │
│                                   ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                              AWS RDS                                       │ │
│  │                                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    PostgreSQL Database                               │  │ │
│  │  │                                                                      │  │ │
│  │  │   ┌─────────────────────┐  ┌─────────────────────┐                 │  │ │
│  │  │   │   Primary Instance  │  │  Read Replica       │                 │  │ │
│  │  │   │   (Multi-AZ)        │  │  (Optional)         │                 │  │ │
│  │  │   │                     │  │                     │                 │  │ │
│  │  │   │   vault_admin       │  │                     │                 │  │ │
│  │  │   │   (Static user for  │  │                     │                 │  │ │
│  │  │   │    Vault)           │  │                     │                 │  │ │
│  │  │   └─────────────────────┘  └─────────────────────┘                 │  │ │
│  │  │                                                                      │  │ │
│  │  │   Database: app_production                                          │  │ │
│  │  │   Port: 5432                                                         │  │ │
│  │  │   Encryption: At-rest (KMS)                                         │  │ │
│  │  │   SSL: Required                                                      │  │ │
│  │  │                                                                      │  │ │
│  │  └─────────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                          AWS Supporting Services                           │ │
│  │                                                                              │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │ │
│  │  │    AWS KMS      │  │    AWS S3       │  │   AWS Secrets   │           │ │
│  │  │                 │  │                 │  │    Manager      │           │ │
│  │  │ Auto-unseal     │  │ Vault backups   │  │ Root token     │           │ │
│  │  │ Encryption      │  │ Raft snapshots  │  │ recovery       │           │ │
│  │  │                 │  │                 │  │                 │           │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘           │ │
│  │                                                                              │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │ │
│  │  │    AWS IAM      │  │  Route 53       │  │  AWS ACM        │           │ │
│  │  │                 │  │                 │  │                 │           │ │
│  │  │ Service         │  │ DNS for         │  │ SSL/TLS         │           │ │
│  │  │ accounts        │  │ vault.example   │  │ Certificates    │           │ │
│  │  │ (IRSA)          │  │ api.example     │  │                 │           │ │
│  │  │                 │  │ app.example     │  │                 │           │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘           │ │
│  │                                                                              │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Complete Authentication & Secret Access Flow               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SCENARIO 1: Developer Accessing Vault UI                                    │
│  ────────────────────────────────────────────                                │
│                                                                              │
│  ┌─────────────┐                                                            │
│  │  Developer  │                                                            │
│  │  (Alice)    │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         │ 1. Opens browser to https://vault.example.com/ui                  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │              Vault UI (Public)                      │                    │
│  │                                                      │                    │
│  │  Method: Username & Password                        │                    │
│  │  Username: alice@company.com                        │                    │
│  │  Password: ********                                 │                    │
│  │                                                      │                    │
│  └──────────────────────┬──────────────────────────────┘                    │
│                         │                                                    │
│                         │ 2. Vault validates credentials                    │
│                         │    Checks policies for alice@company.com          │
│                         │                                                    │
│                         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │  Vault returns token with policies attached:        │                    │
│  │                                                      │                    │
│  │  Token: s.xxxxxxxx                                  │                    │
│  │  Policies: [developer-read-only]                    │                    │
│  │  TTL: 8 hours                                       │                    │
│  │                                                      │                    │
│  └──────────────────────┬──────────────────────────────┘                    │
│                         │                                                    │
│                         │ 3. Developer can now:                             │
│                         │    - View secrets (read-only)                     │
│                         │    - Cannot modify secrets                        │
│                         │    - Cannot access admin paths                    │
│                         │                                                    │
│                         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │  What Alice Can Access:                             │                    │
│  │                                                      │                    │
│  │  ✅ READ database/creds/app-role                    │                    │
│  │  ✅ READ secret/data/api-keys/stripe                │                    │
│  │  ✅ READ secret/data/api-keys/sendgrid              │                    │
│  │  ❌ WRITE secret/data/*                             │                    │
│  │  ❌ READ database/config/*                          │                    │
│  │  ❌ READ sys/*                                      │                    │
│  │                                                      │                    │
│  └─────────────────────────────────────────────────────┘                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  SCENARIO 2: Backend Pod Getting Database Credentials                        │
│  ─────────────────────────────────────────────────────────────               │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │  Backend Pod    │                                                        │
│  │  (backend-abc)  │                                                        │
│  │                 │                                                        │
│  │  Service        │                                                        │
│  │  Account:       │                                                        │
│  │  backend-sa     │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           │ 1. Read mounted JWT token                                       │
│           │    /var/run/secrets/kubernetes.io/                              │
│           │    serviceaccount/token                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │  2. Login to Vault with Kubernetes Auth:            │                    │
│  │                                                      │                    │
│  │  POST /v1/auth/kubernetes/login                     │                    │
│  │  {                                                  │                    │
│  │    "role": "backend-role",                          │                    │
│  │    "jwt": "eyJhbGciOiJSUzI1NiIs..."                 │                    │
│  │  }                                                  │                    │
│  │                                                      │                    │
│  └──────────────────────┬──────────────────────────────┘                    │
│                         │                                                    │
│                         │ 3. Vault validates:                               │
│                         │    - JWT signature (via K8s API)                  │
│                         │    - Service account: backend-sa                  │
│                         │    - Namespace: production                        │
│                         │    - Role: backend-role exists                    │
│                         │                                                    │
│                         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │  4. Vault returns token:                            │                    │
│  │                                                      │                    │
│  │  {                                                  │                    │
│  │    "auth": {                                        │                    │
│  │      "client_token": "s.yyyyyyyy",                  │                    │
│  │      "policies": ["backend-policy"],                │                    │
│  │      "lease_duration": 3600                         │                    │
│  │    }                                                │                    │
│  │  }                                                  │                    │
│  │                                                      │                    │
│  └──────────────────────┬──────────────────────────────┘                    │
│                         │                                                    │
│                         │ 5. Get database credentials:                      │
│                         │                                                    │
│                         │    GET /v1/database/creds/app-role                │
│                         │    Header: X-Vault-Token: s.yyyyyyyy              │
│                         │                                                    │
│                         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │  6. Vault creates temporary database user:          │                    │
│  │                                                      │                    │
│  │  - Connects to RDS as vault_admin                   │                    │
│  │  - Executes: CREATE ROLE "v-token-xxx" ...          │                    │
│  │  - Returns:                                         │                    │
│  │    {                                                │                    │
│  │      "username": "v-token-app-abc123",              │                    │
│  │      "password": "random-secure-password",          │                    │
│  │      "lease_duration": 3600                         │                    │
│  │    }                                                │                    │
│  │                                                      │                    │
│  └──────────────────────┬──────────────────────────────┘                    │
│                         │                                                    │
│                         │ 7. Backend connects to RDS:                       │
│                         │                                                    │
│                         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │  ┌─────────────────┐      ┌─────────────────┐      │                    │
│  │  │  Backend Pod    │      │   RDS PostgreSQL│      │                    │
│  │  │                 │      │                 │      │                    │
│  │  │  User: v-token- │─────►│  User exists:   │      │                    │
│  │  │  app-abc123     │      │  v-token-app-   │      │                    │
│  │  │  Pass: random-  │      │  abc123         │      │                    │
│  │  │  secure-pass    │      │                 │      │                    │
│  │  └─────────────────┘      └─────────────────┘      │                    │
│  │                                                      │                    │
│  │  Connection: SUCCESS!                               │                    │
│  │                                                      │                    │
│  │  8. Auto-renewal at 80% of lease (2880s)           │                    │
│  │                                                      │                    │
│  └─────────────────────────────────────────────────────┘                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  SCENARIO 3: Backend Getting API Keys                                        │
│  ─────────────────────────────────────────                                    │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │  Backend Pod    │                                                        │
│  │                 │                                                        │
│  │  Needs:         │                                                        │
│  │  - Stripe API   │                                                        │
│  │  - SendGrid API │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           │ Already has token from Kubernetes auth                          │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │  GET /v1/secret/data/api-keys/stripe                │                    │
│  │  Header: X-Vault-Token: s.yyyyyyyy                  │                    │
│  │                                                      │                    │
│  │  Response:                                          │                    │
│  │  {                                                  │                    │
│  │    "data": {                                        │                    │
│  │      "data": {                                      │                    │
│  │        "api_key": "sk_live_xxxxx",                  │                    │
│  │        "webhook_secret": "whsec_xxxxx"              │                    │
│  │      }                                              │                    │
│  │    }                                                │                    │
│  │  }                                                  │                    │
│  │                                                      │                    │
│  └─────────────────────────────────────────────────────┘                    │
│                                                                              │
│  Same process for SendGrid, Twilio, etc.                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### What You Need

#### 1. AWS Account
- AWS account with admin access
- AWS CLI installed and configured
- Region: `us-east-1` (or your preferred region)

#### 2. Local Tools

```bash
# Install required tools

# AWS CLI
brew install awscli
aws --version
# Should be 2.x or higher

# kubectl
brew install kubectl
kubectl version --client

# Helm
brew install helm
helm version

# Vault CLI
brew install vault
vault version

# eksctl (for EKS cluster creation)
brew install eksctl
eksctl version

# jq (for JSON processing)
brew install jq
jq --version

# OpenSSL (for certificate generation)
openssl version
```

#### 3. Domain Name

You need a domain name (e.g., `example.com`) for:
- `vault.example.com` - Vault UI
- `api.example.com` - Backend API
- `app.example.com` - Frontend

#### 4. Estimated Costs

| Service | Cost (Monthly) |
|---------|---------------|
| EKS Cluster | $73 |
| EKS Nodes (3x m5.large) | $210 |
| RDS PostgreSQL (db.r5.large) | $175 |
| Application Load Balancer | $20 |
| NAT Gateway (2x) | $64 |
| Data Transfer | ~$20 |
| KMS, S3, etc. | ~$10 |
| **Total** | **~$572/month** |

> **Note**: You can reduce costs by using smaller instance types for development.

---

## Part 1: Deploy EKS Cluster

### What We're Doing

Creating an Amazon EKS (Elastic Kubernetes Service) cluster where all our applications will run.

### Why EKS?

| Feature | Benefit |
|---------|---------|
| Managed Kubernetes | AWS manages the control plane |
| High Availability | Multiple availability zones |
| Auto-scaling | Automatically scale nodes |
| Integration | Works with IAM, RDS, KMS |

### Step-by-Step Instructions

#### Step 1.1: Configure AWS CLI

```bash
# Configure AWS CLI
aws configure

# Enter when prompted:
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region: us-east-1
# Default output format: json

# Verify configuration
aws sts get-caller-identity

# Expected output:
# {
#   "UserId": "AIDAXXXXXXXXXXXXX",
#   "Account": "123456789012",
#   "Arn": "arn:aws:iam::123456789012:user/your-username"
# }
```

#### Step 1.2: Create VPC for EKS

Create `vpc.yaml`:

```yaml
# vpc.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: vault-cluster
  region: us-east-1

vpc:
  id: vpc-xxxxxx  # Will be created automatically if not specified
  cidr: 10.0.0.0/16
  
  subnets:
    private:
      us-east-1a:
        cidr: 10.0.1.0/24
      us-east-1b:
        cidr: 10.0.2.0/24
      us-east-1c:
        cidr: 10.0.3.0/24
    public:
      us-east-1a:
        cidr: 10.0.101.0/24
      us-east-1b:
        cidr: 10.0.102.0/24
      us-east-1c:
        cidr: 10.0.103.0/24

  nat:
    gateway: HighlyAvailable  # One NAT gateway per AZ
```

#### Step 1.3: Create EKS Cluster

```bash
# Create EKS cluster (takes 15-20 minutes)
eksctl create cluster \
  --name vault-cluster \
  --region us-east-1 \
  --version 1.28 \
  --nodegroup-name standard-workers \
  --node-type m5.large \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 5 \
  --managed \
  --with-oidc \
  --ssh-access \
  --ssh-public-key ~/.ssh/id_rsa.pub

# Expected output:
# [✔]  EKS cluster "vault-cluster" in "us-east-1" region is ready
```

**What this does:**
- Creates VPC with public and private subnets
- Deploys EKS control plane (managed by AWS)
- Creates 3 worker nodes (m5.large instances)
- Enables OIDC for IAM roles for service accounts
- Configures kubectl context

#### Step 1.4: Verify Cluster Access

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --region us-east-1 \
  --name vault-cluster

# Verify connection
kubectl get nodes

# Expected output:
# NAME                                       STATUS   ROLES    AGE   VERSION
# ip-10-0-1-100.us-east-1.compute.internal   Ready    <none>   5m    v1.28.0
# ip-10-0-2-100.us-east-1.compute.internal   Ready    <none>   5m    v1.28.0
# ip-10-0-3-100.us-east-1.compute.internal   Ready    <none>   5m    v1.28.0

# Verify namespaces
kubectl get namespaces

# Expected output:
# NAME              STATUS   AGE
# default           Active   5m
# kube-node-lease   Active   5m
# kube-public       Active   5m
# kube-system       Active   5m
```

#### Step 1.5: Install Essential Add-ons

```bash
# Install AWS Load Balancer Controller
# Required for ALB Ingress

# 1. Create IAM policy
curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.5.4/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam-policy.json

# 2. Create IAM service account
eksctl create iamserviceaccount \
  --cluster=vault-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# 3. Install using Helm
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=vault-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# 4. Verify installation
kubectl get deployment -n kube-system aws-load-balancer-controller

# Expected output:
# NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
# aws-load-balancer-controller   2/2     2            2           30s
```

#### Step 1.6: Install Metrics Server (for HPA)

```bash
# Install metrics server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify
kubectl get deployment metrics-server -n kube-system

# Test
kubectl top nodes

# Expected output:
# NAME                                       CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# ip-10-0-1-100.us-east-1.compute.internal   150m         7%    800Mi           10%
# ip-10-0-2-100.us-east-1.compute.internal   140m         7%    750Mi           9%
# ip-10-0-3-100.us-east-1.compute.internal   145m         7%    780Mi           10%
```

---

## Part 2: Deploy RDS PostgreSQL

### What We're Doing

Creating an Amazon RDS PostgreSQL database for the application.

### Why RDS?

| Feature | Benefit |
|---------|---------|
| Managed Database | AWS handles backups, patching |
| High Availability | Multi-AZ deployment |
| Encryption | At-rest and in-transit |
| Automated Backups | Point-in-time recovery |

### Step-by-Step Instructions

#### Step 2.1: Create DB Subnet Group

```bash
# Get VPC ID
VPC_ID=$(aws ec2 describe-vpcs \
  --filters Name=tag:Name,Values="eksctl-vault-cluster-cluster/VPC" \
  --query "Vpcs[0].VpcId" \
  --output text)

echo "VPC ID: $VPC_ID"

# Get private subnet IDs
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters \
    Name=vpc-id,Values=$VPC_ID \
    Name=tag:Name,Values="eksctl-vault-cluster-cluster/SubnetPrivate*" \
  --query "Subnets[].SubnetId" \
  --output text)

echo "Private Subnets: $SUBNET_IDS"

# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name vault-db-subnet-group \
  --db-subnet-group-description "Subnet group for Vault database" \
  --subnet-ids $SUBNET_IDS
```

#### Step 2.2: Create Security Group for RDS

```bash
# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name vault-db-sg \
  --description "Security group for Vault RDS" \
  --vpc-id $VPC_ID \
  --query "GroupId" \
  --output text)

echo "Security Group ID: $SG_ID"

# Get EKS node security group
EKS_SG=$(aws ec2 describe-security-groups \
  --filters \
    Name=vpc-id,Values=$VPC_ID \
    Name=group-name,Values="eksctl-vault-cluster-cluster-sg" \
  --query "SecurityGroups[0].GroupId" \
  --output text)

echo "EKS Security Group: $EKS_SG"

# Allow PostgreSQL access from EKS nodes
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --source-group $EKS_SG

# Save SG ID for later
echo "DB_SG_ID=$SG_ID" >> ~/.bashrc
```

#### Step 2.3: Create RDS PostgreSQL Instance

```bash
# Create a master password (save this securely!)
DB_PASSWORD="YourSecurePassword123!@#"

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier vault-postgres \
  --db-instance-class db.r5.large \
  --engine postgres \
  --engine-version 15.4 \
  --master-username vault_admin \
  --master-user-password "$DB_PASSWORD" \
  --allocated-storage 100 \
  --storage-encrypted \
  --db-name app_production \
  --vpc-security-group-ids $SG_ID \
  --db-subnet-group-name vault-db-subnet-group \
  --backup-retention-period 7 \
  --multi-az \
  --publicly-accessible \
  --storage-type gp3 \
  --deletion-protection

# Wait for database to be available (10-15 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier vault-postgres

# Get database endpoint
DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier vault-postgres \
  --query "DBInstances[0].Endpoint.Address" \
  --output text)

echo "Database Endpoint: $DB_ENDPOINT"

# Save for later
echo "DB_ENDPOINT=$DB_ENDPOINT" >> ~/.bashrc
echo "DB_ADMIN_USER=vault_admin" >> ~/.bashrc
echo "DB_ADMIN_PASSWORD=$DB_PASSWORD" >> ~/.bashrc
```

#### Step 2.4: Configure Database for Vault

```bash
# Connect to database
psql -h $DB_ENDPOINT -U vault_admin -d app_production -W

# Enter password when prompted

# Create schema and grant permissions
CREATE SCHEMA IF NOT EXISTS vault;

# Create the application tables
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(50) DEFAULT 'medium',
  due_date DATE,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

# Grant permissions to vault_admin (for Vault to create dynamic users)
ALTER USER vault_admin CREATEROLE;

# Exit
\q
```

---

## Part 3: Deploy Vault on EKS

### What We're Doing

Deploying HashiCorp Vault on EKS using the official Helm chart.

### Why Use Helm?

| Feature | Benefit |
|---------|---------|
| Official Chart | Maintained by HashiCorp |
| Easy Updates | `helm upgrade` |
| Configurable | Values file customization |
| Production Ready | HA, auto-unseal, raft storage |

### Step-by-Step Instructions

#### Step 3.1: Create AWS KMS Key for Auto-Unseal

```bash
# Create KMS key
KMS_KEY_ID=$(aws kms create-key \
  --description "Vault auto-unseal key" \
  --query "KeyMetadata.KeyId" \
  --output text)

echo "KMS Key ID: $KMS_KEY_ID"

# Get key ARN
KMS_KEY_ARN=$(aws kms describe-key \
  --key-id $KMS_KEY_ID \
  --query "KeyMetadata.Arn" \
  --output text)

echo "KMS Key ARN: $KMS_KEY_ARN"

# Create alias for easy reference
aws kms create-alias \
  --alias-name alias/vault-auto-unseal \
  --target-key-id $KMS_KEY_ID

# Save for later
echo "KMS_KEY_ARN=$KMS_KEY_ARN" >> ~/.bashrc
```

#### Step 3.2: Create S3 Bucket for Vault Backups

```bash
# Create S3 bucket (use unique name)
BUCKET_NAME="vault-backups-$(aws sts get-caller-identity --query Account --output text)-$(date +%Y%m%d)"

aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket $BUCKET_NAME \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

echo "Backup Bucket: $BUCKET_NAME"

# Save for later
echo "VAULT_BACKUP_BUCKET=$BUCKET_NAME" >> ~/.bashrc
```

#### Step 3.3: Create IAM Role for Vault

```bash
# Create trust policy document
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    },
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):oidc-provider/oidc.eks.us-east-1.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.us-east-1.amazonaws.com:aud": "sts.amazonaws.com",
          "oidc.eks.us-east-1.amazonaws.com:sub": "system:serviceaccount:vault:vault"
        }
      }
    }
  ]
}
EOF

# Create IAM role
VAULT_ROLE_ARN=$(aws iam create-role \
  --role-name vault-kms-role \
  --assume-role-policy-document file://trust-policy.json \
  --query "Role.Arn" \
  --output text)

echo "Vault IAM Role: $VAULT_ROLE_ARN"

# Create KMS policy
cat > kms-policy.json <<EOF
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
      "Resource": "$KMS_KEY_ARN"
    }
  ]
}
EOF

# Attach KMS policy to role
aws iam put-role-policy \
  --role-name vault-kms-role \
  --policy-name vault-kms-policy \
  --policy-document file://kms-policy.json

# Create S3 policy for backups
cat > s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::$BUCKET_NAME",
        "arn:aws:s3:::$BUCKET_NAME/*"
      ]
    }
  ]
}
EOF

# Attach S3 policy
aws iam put-role-policy \
  --role-name vault-kms-role \
  --policy-name vault-s3-policy \
  --policy-document file://s3-policy.json

# Save role ARN
echo "VAULT_ROLE_ARN=$VAULT_ROLE_ARN" >> ~/.bashrc
```

#### Step 3.4: Create Vault Namespace

```bash
# Create namespace
kubectl create namespace vault

# Verify
kubectl get namespace vault
```

#### Step 3.5: Add HashiCorp Helm Repository

```bash
# Add Helm repo
helm repo add hashicorp https://helm.releases.hashicorp.com

# Update repo
helm repo update

# Verify
helm search repo hashicorp/vault

# Expected output:
# NAME            CHART VERSION   APP VERSION     DESCRIPTION
# hashicorp/vault 0.25.0          1.15.2          Official HashiCorp Vault Chart
```

#### Step 3.6: Create Vault Values File

Create `vault-values.yaml`:

```yaml
# vault-values.yaml
# Production configuration for Vault on EKS

global:
  enabled: true
  namespace: vault
  
  # Image configuration
  image: hashicorp/vault:1.15.2
  imagePullPolicy: IfNotPresent

server:
  # High Availability mode
  ha:
    enabled: true
    replicas: 3
    
    # Raft storage (integrated storage)
    raft:
      enabled: true
      setNodeId: true
      
      config: |
        ui = true
        
        listener "tcp" {
          tls_disable = 1
          address = "[::]:8200"
          cluster_address = "[::]:8201"
        }
        
        storage "raft" {
          path = "/vault/data"
          retry_join {
            leader_api_addr = "http://vault-0.vault-internal:8200"
          }
          retry_join {
            leader_api_addr = "http://vault-1.vault-internal:8200"
          }
          retry_join {
            leader_api_addr = "http://vault-2.vault-internal:8200"
          }
        }
        
        disable_mlock = true
        
        # Auto-unseal using AWS KMS
        seal "awskms" {
          region = "us-east-1"
          kms_key_id = "REPLACE_WITH_KMS_KEY_ID"
        }
        
        # API address
        api_addr = "https://vault.example.com"
        
        # Cluster address
        cluster_addr = "https://vault.example.com"

  # Resource limits
  resources:
    requests:
      memory: "512Mi"
      cpu: "500m"
    limits:
      memory: "2Gi"
      cpu: "1000m"

  # Data storage (persistent)
  dataStorage:
    enabled: true
    size: 50Gi
    storageClass: gp2
    accessMode: ReadWriteOnce

  # Audit storage
  auditStorage:
    enabled: true
    size: 10Gi
    storageClass: gp2

  # Service configuration
  service:
    type: ClusterIP
    annotations: {}

  # Ingress configuration (public access)
  ingress:
    enabled: true
    ingressClassName: alb
    annotations:
      kubernetes.io/ingress.class: alb
      alb.ingress.kubernetes.io/scheme: internet-facing
      alb.ingress.kubernetes.io/target-type: ip
      alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
      alb.ingress.kubernetes.io/certificate-arn: "REPLACE_WITH_ACM_CERT_ARN"
      alb.ingress.kubernetes.io/healthcheck-path: "/v1/sys/health?standbycode=200&sealedcode=200&uninitcode=200"
    hosts:
      - host: vault.example.com
        paths:
          - /

  # Service account
  serviceAccount:
    create: true
    name: vault
    annotations:
      eks.amazonaws.com/role-arn: "REPLACE_WITH_IAM_ROLE_ARN"

  # Pod disruption budget
  podDisruptionBudget:
    enabled: true
    maxUnavailable: 1

# Vault UI
ui:
  enabled: true
  serviceType: ClusterIP

# Injector (for Vault Agent sidecar)
injector:
  enabled: true
  
  # Replica count
  replicas: 2
  
  # Resource limits
  resources:
    requests:
      memory: "256Mi"
      cpu: "250m"
    limits:
      memory: "512Mi"
      cpu: "500m"

# CSI Driver (for Kubernetes secrets)
csi:
  enabled: false  # We'll use agent injector instead
```

Replace the placeholders:

```bash
# Replace placeholders in values file
sed -i "s/REPLACE_WITH_KMS_KEY_ID/$KMS_KEY_ID/g" vault-values.yaml
sed -i "s/REPLACE_WITH_IAM_ROLE_ARN/$VAULT_ROLE_ARN/g" vault-values.yaml

# For ACM certificate ARN, create one first (see next section)
```

#### Step 3.7: Request SSL Certificate from AWS ACM

```bash
# Request SSL certificate
CERT_ARN=$(aws acm request-certificate \
  --domain-name vault.example.com \
  --subject-alternative-names api.example.com app.example.com \
  --validation-method DNS \
  --query "CertificateArn" \
  --output text)

echo "Certificate ARN: $CERT_ARN"

# Get validation records
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query "Certificate.DomainValidationOptions" \
  --output json > cert-validation.json

# Add these CNAME records to your DNS provider
cat cert-validation.json | jq '.'

# Example output:
# [
#   {
#     "DomainName": "vault.example.com",
#     "ResourceRecord": {
#       "Name": "_xxxxx.vault.example.com.",
#       "Type": "CNAME",
#       "Value": "_yyyyy.acm-validations.aws."
#     }
#   }
# ]

# Wait for validation (after adding DNS records)
aws acm wait certificate-validated \
  --certificate-arn $CERT_ARN

# Update values file
sed -i "s/REPLACE_WITH_ACM_CERT_ARN/$CERT_ARN/g" vault-values.yaml

# Save cert ARN
echo "ACM_CERT_ARN=$CERT_ARN" >> ~/.bashrc
```

#### Step 3.8: Install Vault Using Helm

```bash
# Install Vault
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
# vault-agent-injector-7d8f9c6b4-x9y2z    1/1     Running   0          30s

# Wait for all pods to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=vault -n vault --timeout=300s

# Check Vault status
kubectl exec -n vault vault-0 -- vault status

# Expected output (if auto-unseal works):
# Key                      Value
# ---                      -----
# Seal Type                awskms
# Initialized              false
# Sealed                   true
# ...
```

#### Step 3.9: Initialize Vault (First Time Only)

```bash
# Initialize Vault (run only once on first install)
kubectl exec -n vault vault-0 -- vault operator init -format=json > vault-init.json

# IMPORTANT: Save this file securely!
# It contains:
# - unseal_keys (5 keys)
# - root_token (admin token)

# View the output
cat vault-init.json

# Example output:
# {
#   "keys": [
#     "key1...",
#     "key2...",
#     "key3...",
#     "key4...",
#     "key5..."
#   ],
#   "root_token": "hvs.xxxxxxxx"
# }

# With AWS KMS auto-unseal, Vault should auto-unseal
# Verify Vault is unsealed
kubectl exec -n vault vault-0 -- vault status

# Expected output:
# Key                      Value
# ---                      -----
# Seal Type                awskms
# Initialized              true
# Sealed                   false  <-- Should be false
# ...
```

#### Step 3.10: Verify Vault UI Access

```bash
# Get ALB address
ALB_ADDRESS=$(kubectl get ingress -n vault vault -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "Vault UI: https://$ALB_ADDRESS"

# Or if using Route 53:
echo "Vault UI: https://vault.example.com"

# Open in browser and login with root token
# Token: hvs.xxxxxxxx (from vault-init.json)
```

**What You Should See:**

![Vault UI Login](https://developer.hashicorp.com/vault/docs/getting-started/images/vault-ui-login.png)

---

## Part 4: Configure Vault for Production

### What We're Doing

Configuring Vault with secrets engines, authentication methods, and policies.

### Why This Configuration?

| Component | Purpose |
|-----------|---------|
| **Database Secrets Engine** | Auto-generate PostgreSQL credentials |
| **KV Secrets Engine** | Store API keys, certificates |
| **Userpass Auth** | Username/password login for developers |
| **Kubernetes Auth** | Pod authentication for applications |
| **Policies** | Define who can access what |

### Step-by-Step Instructions

#### Step 4.1: Configure Vault CLI

```bash
# Set Vault address (use ALB address from previous step)
export VAULT_ADDR="https://vault.example.com"

# Or use ALB directly:
export VAULT_ADDR="https://$ALB_ADDRESS"

# Login with root token
export VAULT_TOKEN="hvs.xxxxxxxx"  # From vault-init.json

# Verify connection
vault status

# Expected output:
# Key                      Value
# ---                      -----
# Seal Type                awskms
# Initialized              true
# Sealed                   false
# Total Shares             5
# Threshold               3
# Version                 1.15.2
# ...
```

#### Step 4.2: Enable Audit Logging

```bash
# Enable file audit log (stored in container)
vault audit enable file file_path=/vault/audit/audit.log

# Verify
vault audit list

# Expected output:
# Path     Type
# ----     ----
# file/    file
```

#### Step 4.3: Enable Secrets Engines

```bash
# Enable database secrets engine
vault secrets enable database

# Enable KV secrets engine for API keys
vault secrets enable -path=secret -version=2 kv

# Verify
vault secrets list

# Expected output:
# Path               Type         Description
# ----               ----         -----------
# database/          database     n/a
# secret/            kv           key/value secret storage
# ...
```

#### Step 4.4: Create Admin Policy

Create `admin-policy.hcl`:

```hcl
# admin-policy.hcl
# Full admin access to all paths

# Manage all secrets
path "*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
```

Apply:

```bash
# Create policy
vault policy write admin admin-policy.hcl

# Verify
vault policy read admin
```

#### Step 4.5: Create Security Admin Policy

Create `security-admin-policy.hcl`:

```hcl
# security-admin-policy.hcl
# Security team can manage auth, policies, and view all secrets

# Manage authentication methods
path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Manage policies
path "sys/policies/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Manage secrets engines
path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Read all secrets
path "secret/*" {
  capabilities = ["read", "list"]
}

path "database/*" {
  capabilities = ["read", "list"]
}

# Manage audit logs
path "sys/audit/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
```

Apply:

```bash
vault policy write security-admin security-admin-policy.hcl
```

---

## Part 5: Create User Authentication

### What We're Doing

Setting up username/password authentication for developers and administrators.

### Why Userpass Auth?

| Feature | Benefit |
|---------|---------|
| Simple | Easy for developers to use |
| Familiar | Username/password pattern |
| Auditable | Track who accessed what |
| Fine-grained | Different policies per user |

### Step-by-Step Instructions

#### Step 5.1: Enable Userpass Authentication

```bash
# Enable userpass auth method
vault auth enable userpass

# Verify
vault auth list

# Expected output:
# Path         Type        Description
# ----         ----        -----------
# userpass/    userpass    n/a
# token/       token       token based credentials
```

#### Step 5.2: Create Developer Policy

Create `developer-policy.hcl`:

```hcl
# developer-policy.hcl
# Developers can read secrets but not modify them

# Read database credentials
path "database/creds/*" {
  capabilities = ["read"]
}

# Read API keys
path "secret/data/api-keys/*" {
  capabilities = ["read"]
}

# Read application secrets
path "secret/data/apps/*" {
  capabilities = ["read"]
}

# List secrets (for UI navigation)
path "secret/metadata/*" {
  capabilities = ["list"]
}

# Cannot:
# - Write secrets
# - Delete secrets
# - Manage auth/policies
# - Access admin paths
```

Apply:

```bash
vault policy write developer developer-policy.hcl
```

#### Step 5.3: Create Developer Users

```bash
# Create developer users
vault write auth/userpass/users/alice@company.com \
  password="AlicePassword123!" \
  policies="developer"

vault write auth/userpass/users/bob@company.com \
  password="BobPassword456!" \
  policies="developer"

vault write auth/userpass/users/charlie@company.com \
  password="CharliePassword789!" \
  policies="developer"

# Verify user
vault read auth/userpass/users/alice@company.com

# Expected output:
# Key                        Value
# ---                        -----
# password_hmac              xxxx
# policies                   [developer]
# token_bound_cidrs          []
# token_explicit_max_ttl     0s
# token_max_ttl              0s
# token_no_default_policy    false
# token_num_uses             0
# token_period               0s
# token_policies             [developer]
# token_ttl                  0s
# token_type                 default
```

#### Step 5.4: Create Admin Users

```bash
# Create admin users (security team)
vault write auth/userpass/users/admin@company.com \
  password="AdminPassword123!" \
  policies="admin"

vault write auth/userpass/users/security@company.com \
  password="SecurityPassword456!" \
  policies="security-admin"

# Verify
vault list auth/userpass/users

# Expected output:
# Keys
# ----
# alice@company.com
# bob@company.com
# charlie@company.com
# admin@company.com
# security@company.com
```

#### Step 5.5: Test User Login

```bash
# Login as developer
vault login -method=userpass \
  username="alice@company.com" \
  password="AlicePassword123!"

# Expected output:
# Success! You are now authenticated.
# token_accessor: xxxxx
# token_duration: 768h
# token_policies: [default developer]
# ...

# Try to read secrets (should work)
vault read database/creds/app-role

# Try to write secrets (should fail)
vault write secret/data/test message="hello"
# Error: permission denied
```

#### Step 5.6: Configure Token Settings

```bash
# Set default token TTL
vault write auth/userpass/config \
  default_lease_ttl="8h" \
  max_lease_ttl="24h"

# Verify
vault read auth/userpass/config
```

---

## Part 6: Configure Database Secrets Engine

### What We're Doing

Configuring Vault to automatically generate PostgreSQL credentials for applications.

### Why Dynamic Credentials?

| Without Vault | With Vault |
|---------------|------------|
| One shared password for all | Unique password per pod |
| Password never changes | Password rotates every hour |
| If leaked, all access compromised | If leaked, limited to one pod |
| Manual rotation required | Automatic rotation |
| No audit trail | Full audit trail |

### Step-by-Step Instructions

#### Step 6.1: Configure PostgreSQL Connection

```bash
# Configure database connection
vault write database/config/postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="app-role" \
  connection_url="postgresql://{{username}}:{{password}}@$DB_ENDPOINT:5432/app_production?sslmode=require" \
  username="vault_admin" \
  password="$DB_ADMIN_PASSWORD"

# Expected output:
# Success! Data written to: database/config/postgres

# Verify
vault read database/config/postgres

# Expected output:
# Key                                   Value
# ---                                   -----
# allowed_roles                         [app-role]
# connection_details                    map[connection_url:postgresql://...]
# plugin_name                           postgresql-database-plugin
```

#### Step 6.2: Create Database Role

```bash
# Create role for application
vault write database/roles/app-role \
  db_name=postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# Expected output:
# Success! Data written to: database/roles/app-role

# Verify
vault read database/roles/app-role

# Expected output:
# Key                      Value
# ---                      -----
# creation_statements      [CREATE ROLE "{{name}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{{name}}";]
# default_ttl              1h
# max_ttl                  24h
```

#### Step 6.3: Test Credential Generation

```bash
# Generate credentials
vault read database/creds/app-role

# Expected output:
# Key                Value
# ---                -----
# lease_id           database/creds/app-role/xxxxx
# lease_duration     1h
# lease_renewable    true
# password           xxxx-xxxx-xxxx-xxxx
# username           v-token-app-role-xxxx

# Verify in database
psql -h $DB_ENDPOINT -U vault_admin -d app_production -c "\du"

# Expected output:
#                                        List of roles
#            Role name             |                         Attributes                         | Member of
# ----------------------------------+------------------------------------------------------------+-----------
# vault_admin                      | Create role, +                                             | {}
# v-token-app-role-xxxx            | Password valid until 2024-09-25 12:00:00+00               | {}
```

---

## Part 7: Manage API Keys in Vault

### What We're Doing

Storing and managing API keys for external services (Stripe, SendGrid, Twilio, etc.).

### Why Store API Keys in Vault?

| Benefit | Description |
|---------|-------------|
| Centralized | All API keys in one place |
| Encrypted | AES-256 encryption at rest |
| Audited | Know who accessed what key |
| Rotated | Easy key rotation |
| Versioned | Keep history of changes |

### Step-by-Step Instructions

#### Step 7.1: Store Stripe API Keys

```bash
# Store Stripe API key
vault kv put secret/api-keys/stripe \
  api_key="sk_live_xxxxxxxxxxxxxxxxxxxx" \
  publishable_key="pk_live_xxxxxxxxxxxxxxxxxxxx" \
  webhook_secret="whsec_xxxxxxxxxxxxxxxxxxxx" \
  environment="production"

# Expected output:
# ====== Secret Path ======
# secret/data/api-keys/stripe
# 
# ====== Metadata ======
# Key              Value
# ---              -----
# created_time     2024-09-25T10:00:00.000Z
# custom_metadata  <nil>
# deletion_time    n/a
# destroyed        false
# version          1

# Verify
vault kv get secret/api-keys/stripe

# Expected output:
# ====== Secret Path ======
# secret/data/api-keys/stripe
# 
# ====== Metadata ======
# Key              Value
# ---              -----
# created_time     2024-09-25T10:00:00.000Z
# custom_metadata  <nil>
# deletion_time    n/a
# destroyed        false
# version          1
# 
# ====== Data ======
# Key               Value
# ---               -----
# api_key           sk_live_xxxxxxxxxxxxxxxxxxxx
# publishable_key   pk_live_xxxxxxxxxxxxxxxxxxxx
# webhook_secret    whsec_xxxxxxxxxxxxxxxxxxxx
# environment       production
```

#### Step 7.2: Store SendGrid API Key

```bash
# Store SendGrid API key
vault kv put secret/api-keys/sendgrid \
  api_key="SG.xxxxxxxxxxxxxxxxxxxx" \
  from_email="noreply@company.com" \
  from_name="Company Name"

# Verify
vault kv get secret/api-keys/sendgrid
```

#### Step 7.3: Store Twilio Credentials

```bash
# Store Twilio credentials
vault kv put secret/api-keys/twilio \
  account_sid="ACxxxxxxxxxxxxxxxxxxx" \
  auth_token="xxxxxxxxxxxxxxxxxxx" \
  api_key="SKxxxxxxxxxxxxxxxxxxx" \
  api_secret="xxxxxxxxxxxxxxxxxxx" \
  phone_number="+1234567890"

# Verify
vault kv get secret/api-keys/twilio
```

#### Step 7.4: Store AWS Credentials (for S3, SES, etc.)

```bash
# Store AWS credentials
vault kv put secret/api-keys/aws \
  access_key_id="AKIAIOSFODNN7EXAMPLE" \
  secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" \
  region="us-east-1"

# Verify
vault kv get secret/api-keys/aws
```

#### Step 7.5: List All API Keys

```bash
# List all API keys
vault kv list secret/api-keys

# Expected output:
# Keys
# ----
# aws
# sendgrid
# stripe
# twilio
```

#### Step 7.6: Create Policy for API Keys

Create `api-keys-read-policy.hcl`:

```hcl
# api-keys-read-policy.hcl
# Read-only access to API keys

# Read API keys
path "secret/data/api-keys/*" {
  capabilities = ["read"]
}

# List API keys
path "secret/metadata/api-keys/*" {
  capabilities = ["list"]
}
```

Apply:

```bash
vault policy write api-keys-read api-keys-read-policy.hcl
```

#### Step 7.7: Rotate API Key

```bash
# When you need to rotate a key (e.g., Stripe key compromised)

# 1. Generate new key in Stripe dashboard

# 2. Update in Vault
vault kv put secret/api-keys/stripe \
  api_key="sk_live_NEWxxxxxxxxxxxxxxxx" \
  publishable_key="pk_live_xxxxxxxxxxxxxxxxxxxx" \
  webhook_secret="whsec_xxxxxxxxxxxxxxxxxxxx" \
  environment="production"

# 3. Version history maintained
vault kv get -version=1 secret/api-keys/stripe  # Old version
vault kv get -version=2 secret/api-keys/stripe  # New version

# 4. Check metadata
vault kv metadata get secret/api-keys/stripe

# Expected output:
# ====== Metadata Path ======
# secret/metadata/api-keys/stripe
# 
# ====== Metadata ======
# Key                              Value
# ---                              -----
# cas_required                     false
# created_time                     2024-09-25T10:00:00.000Z
# current_version                  2
# delete_version_after             0s
# max_versions                     0
# oldest_version                   1
# updated_time                     2024-09-25T11:00:00.000Z
```

---

## Part 8: Deploy Backend Application

### What We're Doing

Deploying the Node.js backend application on EKS that uses Vault for database credentials and API keys.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Backend Pod                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Application Container                   │ │
│  │                                                        │ │
│  │  1. Read JWT from /var/run/secrets/.../token          │ │
│  │  2. Login to Vault (Kubernetes Auth)                   │ │
│  │  3. Get database credentials from Vault                │ │
│  │  4. Connect to RDS PostgreSQL                          │ │
│  │  5. Get API keys from Vault                            │ │
│  │  6. Serve API requests                                 │ │
│  │                                                        │ │
│  │  Environment Variables:                                │ │
│  │  - VAULT_ADDR=https://vault.example.com               │ │
│  │  - VAULT_ROLE=backend-role                             │ │
│  │  - DB_HOST=mydb.xxxx.rds.amazonaws.com                │ │
│  │  - DB_NAME=app_production                             │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Service Account: backend-sa                                │
│  └── Authenticates to Vault automatically                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Step-by-Step Instructions

#### Step 8.1: Create Namespace

```bash
# Create namespace
kubectl create namespace production

# Verify
kubectl get namespace production
```

#### Step 8.2: Enable Kubernetes Authentication in Vault

```bash
# Enable Kubernetes auth
vault auth enable kubernetes

# Get Kubernetes host
K8S_HOST="https://kubernetes.default.svc:443"

# Configure Kubernetes auth
vault write auth/kubernetes/config \
  kubernetes_host="$K8S_HOST"

# Verify
vault read auth/kubernetes/config
```

#### Step 8.3: Create Backend Policy

Create `backend-policy.hcl`:

```hcl
# backend-policy.hcl
# Policy for backend application

# Get database credentials
path "database/creds/app-role" {
  capabilities = ["read"]
}

# Get API keys
path "secret/data/api-keys/*" {
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

Apply:

```bash
vault policy write backend backend-policy.hcl
```

#### Step 8.4: Create Kubernetes Auth Role

```bash
# Create role for backend
vault write auth/kubernetes/role/backend-role \
  bound_service_account_names=backend-sa \
  bound_service_account_namespaces=production \
  policies=backend \
  ttl=1h

# Verify
vault read auth/kubernetes/role/backend-role
```

#### Step 8.5: Create Service Account

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
kubectl get serviceaccount backend-sa -n production
```

#### Step 8.6: Build and Push Docker Image

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name vault-backend \
  --image-scanning-configuration scanOnPush=true

# Get ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# Build image
cd backend
docker build -t vault-backend:latest .

# Tag for ECR
docker tag vault-backend:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/vault-backend:latest

# Push to ECR
docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/vault-backend:latest

cd ..
```

#### Step 8.7: Create ConfigMap

Create `backend-configmap.yaml`:

```yaml
# backend-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
  namespace: production
data:
  VAULT_ADDR: "https://vault.example.com"
  VAULT_ROLE: "backend-role"
  VAULT_AUTH_METHOD: "kubernetes"
  DB_HOST: "mydb.xxxx.rds.amazonaws.com"  # Replace with your RDS endpoint
  DB_PORT: "5432"
  DB_NAME: "app_production"
  NODE_ENV: "production"
```

Apply:

```bash
kubectl apply -f backend-configmap.yaml
```

#### Step 8.8: Create Secret (Optional)

If you have any static secrets:

```yaml
# backend-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: backend-secret
  namespace: production
type: Opaque
stringData:
  # Any static configuration
  JWT_SECRET: "your-jwt-secret"
```

Apply:

```bash
kubectl apply -f backend-secret.yaml
```

#### Step 8.9: Create Deployment

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
  replicas: 3
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
        image: $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/vault-backend:latest
        imagePullPolicy: Always
        
        envFrom:
        - configMapRef:
            name: backend-config
        
        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        
        # Health checks
        livenessProbe:
          httpGet:
            path: /api/health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /api/health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        
        # Resource limits
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        
        # Security context
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
        
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      
      volumes:
      - name: tmp
        emptyDir: {}
      
      # Pod security context
      securityContext:
        fsGroup: 1000
```

Apply:

```bash
# Replace account ID
sed -i "s/\$(aws sts get-caller-identity --query Account --output text)/$(aws sts get-caller-identity --query Account --output text)/g" backend-deployment.yaml

kubectl apply -f backend-deployment.yaml

# Check deployment
kubectl get deployment backend -n production

# Check pods
kubectl get pods -n production -l app=backend

# Expected output:
# NAME                       READY   STATUS    RESTARTS   AGE
# backend-7d8f9c6b4-abc12   1/1     Running   0          30s
# backend-7d8f9c6b4-xyz34   1/1     Running   0          30s
# backend-7d8f9c6b4-def56   1/1     Running   0          30s
```

#### Step 8.10: Check Logs

```bash
# Check logs
kubectl logs -n production -l app=backend --tail=50

# Expected output:
# 🔌 Connecting to Vault at: https://vault.example.com
# ✅ Connected to Vault
# 🔐 Logging in to Vault with Kubernetes auth...
#    Vault Address: https://vault.example.com
#    Role: backend-role
# ✅ Successfully authenticated with Vault
# ✅ Got credentials from Vault:
#    Username: v-token-app-role-abc123
#    Lease Duration: 3600s
# ✅ Database connection established
# 🔄 Will refresh credentials in 2520s (at 70% of lease)
# 🚀 Backend server running on http://localhost:3000
```

#### Step 8.11: Create Service

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

# Verify
kubectl get service backend -n production
```

#### Step 8.12: Create Ingress

Create `backend-ingress.yaml`:

```yaml
# backend-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: backend
  namespace: production
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: "$ACM_CERT_ARN"
spec:
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 80
```

Apply:

```bash
# Replace certificate ARN
sed -i "s/\$ACM_CERT_ARN/$ACM_CERT_ARN/g" backend-ingress.yaml

kubectl apply -f backend-ingress.yaml

# Get ALB address
kubectl get ingress backend -n production

# Expected output:
# NAME      CLASS   HOSTS              ADDRESS                                                              PORTS   AGE
# backend   alb     api.example.com    k8s-production-backend-xxx.us-east-1.elb.amazonaws.com              80      30s
```

#### Step 8.13: Test Backend API

```bash
# Test health endpoint
curl https://api.example.com/api/health

# Expected output:
# {
#   "status": "healthy",
#   "timestamp": "2024-09-25T10:00:00.000Z",
#   "services": {
#     "api": "running",
#     "vault": "connected",
#     "database": "connected"
#   }
# }

# Test database connection
curl https://api.example.com/api/db/test

# Expected output:
# {
#   "success": true,
#   "message": "Database connection successful",
#   "database": {
#     "connectedUser": "v-token-app-role-abc123",
#     "credentials": {
#       "username": "v-token-app-role-abc123",
#       "expires": "2024-09-25T11:00:00.000Z"
#     }
#   }
# }
```

---

## Part 9: Deploy Frontend Application

### What We're Doing

Deploying the React frontend application on EKS.

### Step-by-Step Instructions

#### Step 9.1: Build Frontend

```bash
# Build production bundle
cd frontend
npm install
npm run build

# Expected output:
# dist/
# ├── index.html
# ├── assets/
# │   ├── index-abc123.js
# │   └── index-xyz789.css
```

#### Step 9.2: Create Dockerfile

Create `frontend/Dockerfile`:

```dockerfile
# frontend/Dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

Create `frontend/nginx.conf`:

```nginx
# frontend/nginx.conf
events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  
  server {
    listen 80;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # Handle React Router
    location / {
      try_files $uri $uri/ /index.html;
    }
    
    # API proxy
    location /api {
      proxy_pass http://backend.production.svc.cluster.local;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
  }
}
```

#### Step 9.3: Build and Push Docker Image

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name vault-frontend \
  --image-scanning-configuration scanOnPush=true

# Build image
docker build -t vault-frontend:latest .

# Tag for ECR
docker tag vault-frontend:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/vault-frontend:latest

# Push to ECR
docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/vault-frontend:latest

cd ..
```

#### Step 9.4: Create Deployment

Create `frontend-deployment.yaml`:

```yaml
# frontend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: production
  labels:
    app: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/vault-frontend:latest
        imagePullPolicy: Always
        
        ports:
        - name: http
          containerPort: 80
          protocol: TCP
        
        # Health checks
        livenessProbe:
          httpGet:
            path: /
            port: http
          initialDelaySeconds: 10
          periodSeconds: 10
        
        readinessProbe:
          httpGet:
            path: /
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
        
        # Resource limits
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "250m"
        
        # Security context
        securityContext:
          runAsNonRoot: false
          readOnlyRootFilesystem: true
```

Apply:

```bash
sed -i "s/\$(aws sts get-caller-identity --query Account --output text)/$(aws sts get-caller-identity --query Account --output text)/g" frontend-deployment.yaml

kubectl apply -f frontend-deployment.yaml

# Check pods
kubectl get pods -n production -l app=frontend
```

#### Step 9.5: Create Service

Create `frontend-service.yaml`:

```yaml
# frontend-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: production
spec:
  type: ClusterIP
  selector:
    app: frontend
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
```

Apply:

```bash
kubectl apply -f frontend-service.yaml
```

#### Step 9.6: Create Ingress

Create `frontend-ingress.yaml`:

```yaml
# frontend-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: frontend
  namespace: production
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: "$ACM_CERT_ARN"
spec:
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

Apply:

```bash
sed -i "s/\$ACM_CERT_ARN/$ACM_CERT_ARN/g" frontend-ingress.yaml

kubectl apply -f frontend-ingress.yaml
```

#### Step 9.7: Access Frontend

```bash
# Get ALB address
kubectl get ingress frontend -n production

# Open in browser: https://app.example.com
```

---

## Part 10: Developer Access Management

### What We're Doing

Setting up access control for different developer roles.

### Access Matrix

| Role | Vault UI Access | Database Creds | API Keys | Manage Users | Admin |
|------|-----------------|----------------|----------|--------------|-------|
| **Developer** | ✅ Read-only | ✅ Read | ✅ Read | ❌ | ❌ |
| **Senior Developer** | ✅ Read-only | ✅ Read | ✅ Read/Write | ❌ | ❌ |
| **Security Admin** | ✅ Full | ✅ Read | ✅ Read | ✅ | ❌ |
| **Admin** | ✅ Full | ✅ Full | ✅ Full | ✅ | ✅ |

### Step-by-Step Instructions

#### Step 10.1: Create Senior Developer Policy

Create `senior-developer-policy.hcl`:

```hcl
# senior-developer-policy.hcl
# Senior developers can create/update secrets

# Read database credentials
path "database/creds/*" {
  capabilities = ["read"]
}

# Read and write API keys
path "secret/data/api-keys/*" {
  capabilities = ["read", "create", "update"]
}

# List secrets
path "secret/metadata/api-keys/*" {
  capabilities = ["list"]
}

# Delete old versions
path "secret/delete/api-keys/*" {
  capabilities = ["update"]
}
```

Apply:

```bash
vault policy write senior-developer senior-developer-policy.hcl
```

#### Step 10.2: Create Senior Developer Users

```bash
# Create senior developer users
vault write auth/userpass/users/david@company.com \
  password="DavidPassword123!" \
  policies="senior-developer"

vault write auth/userpass/users/eve@company.com \
  password="EvePassword456!" \
  policies="senior-developer"
```

#### Step 10.3: Create Team-Based Access

```bash
# Create team structure
# Team: payments-team
# Access: Stripe, PayPal, Twilio

# Create team policy
cat > payments-team-policy.hcl <<EOF
# payments-team-policy.hcl
# Payment team can access payment-related API keys

# Read database credentials
path "database/creds/app-role" {
  capabilities = ["read"]
}

# Read/write Stripe keys
path "secret/data/api-keys/stripe" {
  capabilities = ["read", "create", "update"]
}

# Read/write PayPal keys
path "secret/data/api-keys/paypal" {
  capabilities = ["read", "create", "update"]
}

# Cannot access: SendGrid, AWS, other teams' secrets
EOF

vault policy write payments-team payments-team-policy.hcl

# Create payment team users
vault write auth/userpass/users/frank@company.com \
  password="FrankPassword123!" \
  policies="payments-team"
```

#### Step 10.4: Setup Team Groups (Using Identity)

```bash
# Create groups using Vault Identity

# Create group type
vault write identity/group/name/developers \
  policies="developer" \
  member_entity_ids=""

vault write identity/group/name/senior-developers \
  policies="senior-developer" \
  member_entity_ids=""

vault write identity/group/name/payments-team \
  policies="payments-team" \
  member_entity_ids=""

vault write identity/group/name/security \
  policies="security-admin" \
  member_entity_ids=""

vault write identity/group/name/admins \
  policies="admin" \
  member_entity_ids=""
```

#### Step 10.5: Audit and Monitor Access

```bash
# View audit logs
kubectl exec -n vault vault-0 -- cat /vault/audit/audit.log | tail -20

# Example audit log:
# {
#   "time": "2024-09-25T10:00:00Z",
#   "type": "request",
#   "auth": {
#     "client_token": "hvs.xxxx",
#     "accessor": "xxxx",
#     "display_name": "userpass-alice@company.com",
#     "policies": ["default", "developer"],
#     "entity_id": "xxxx"
#   },
#   "request": {
#     "operation": "read",
#     "path": "database/creds/app-role"
#   }
# }

# Monitor failed auth attempts
kubectl exec -n vault vault-0 -- grep "403" /vault/audit/audit.log | tail -10
```

#### Step 10.6: Create Access Request Workflow (Optional)

For production, implement approval workflow:

1. Developer requests access via ticket (Jira, ServiceNow)
2. Security team reviews request
3. Security team creates user with appropriate policy
4. Credentials sent via secure channel (1Password, Slack secret)

```bash
# Security team creates user after approval
vault write auth/userpass/users/newuser@company.com \
  password="TemporaryPassword123!" \
  policies="requested-policy"

# User must change password on first login
# (implement in your application)
```

---

## Part 11: Monitoring and Maintenance

### What We're Doing

Setting up monitoring, alerts, and backup procedures.

### Step-by-Step Instructions

#### Step 11.1: Setup Prometheus Monitoring

```bash
# Install Prometheus stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

# Access Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Open: http://localhost:3000
# Default: admin/prom-operator
```

#### Step 11.2: Configure Vault Metrics

```bash
# Vault exposes metrics at /v1/sys/metrics
# Configure Prometheus to scrape

cat > vault-servicemonitor.yaml <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: vault
  namespace: vault
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: vault
  endpoints:
  - port: http
    path: /v1/sys/metrics
    interval: 30s
    scheme: http
    bearerTokenSecret:
      name: vault-token
      key: token
EOF

kubectl apply -f vault-servicemonitor.yaml
```

#### Step 11.3: Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `vault_core_unsealed` | Vault sealed status | < 1 (sealed) |
| `vault_core_active` | Vault active status | < 1 (standby) |
| `vault_lease_expiration` | Leases expiring soon | Count > 100 |
| `vault_token_create_count` | Tokens created | Unusual spike |
| `vault_route_request_sum` | Request latency | > 100ms avg |
| `vault_core_request_count` | Total requests | Unusual spike |

#### Step 11.4: Setup Alerts

Create `vault-alerts.yaml`:

```yaml
# vault-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: vault-alerts
  namespace: vault
spec:
  groups:
  - name: vault
    rules:
    - alert: VaultSealed
      expr: vault_core_unsealed == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Vault is sealed"
        description: "Vault instance {{ $labels.instance }} is sealed"
    
    - alert: VaultDown
      expr: up{job="vault"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Vault is down"
        description: "Vault instance {{ $labels.instance }} is unreachable"
    
    - alert: HighRequestLatency
      expr: histogram_quantile(0.99, rate(vault_route_request_sum[5m])) > 0.1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High request latency"
        description: "99th percentile latency is {{ $value }}s"
```

Apply:

```bash
kubectl apply -f vault-alerts.yaml
```

#### Step 11.5: Setup Automated Backups

Create `vault-backup-cronjob.yaml`:

```yaml
# vault-backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: vault-backup
  namespace: vault
spec:
  schedule: "0 */6 * * *"  # Every 6 hours
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: vault
          containers:
          - name: backup
            image: hashicorp/vault:1.15.2
            command:
            - /bin/sh
            - -c
            - |
              # Create snapshot
              vault operator raft snapshot save /backup/vault-$(date +%Y%m%d-%H%M%S).snap
              
              # Upload to S3
              aws s3 cp /backup/vault-*.snap s3://${BUCKET_NAME}/snapshots/
              
              # Clean up old snapshots (keep last 30)
              aws s3 ls s3://${BUCKET_NAME}/snapshots/ | sort | head -n -30 | awk '{print $4}' | xargs -I {} aws s3 rm s3://${BUCKET_NAME}/snapshots/{}
            env:
            - name: VAULT_ADDR
              value: "http://vault:8200"
            - name: VAULT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: vault-root-token
                  key: token
            - name: BUCKET_NAME
              value: "${VAULT_BACKUP_BUCKET}"
            volumeMounts:
            - name: backup
              mountPath: /backup
          volumes:
          - name: backup
            emptyDir: {}
          restartPolicy: OnFailure
```

Apply:

```bash
sed -i "s/\${VAULT_BACKUP_BUCKET}/$VAULT_BACKUP_BUCKET/g" vault-backup-cronjob.yaml

kubectl apply -f vault-backup-cronjob.yaml
```

#### Step 11.6: Disaster Recovery Plan

**Scenario: Vault is completely lost**

```bash
# 1. Restore from S3 snapshot
aws s3 cp s3://${VAULT_BACKUP_BUCKET}/snapshots/vault-latest.snap ./vault-restore.snap

# 2. Copy to Vault pod
kubectl cp vault-restore.snap vault/vault-0:/tmp/vault-restore.snap

# 3. Restore snapshot
kubectl exec -n vault vault-0 -- vault operator raft snapshot restore /tmp/vault-restore.snap

# 4. Verify
kubectl exec -n vault vault-0 -- vault status
```

---

## Part 12: Troubleshooting

### Common Issues and Solutions

#### Issue 1: Vault Pods Not Starting

**Symptoms:**
```
NAME       READY   STATUS
vault-0    0/1     CrashLoopBackOff
```

**Diagnosis:**
```bash
# Check logs
kubectl logs -n vault vault-0

# Check events
kubectl describe pod -n vault vault-0
```

**Common causes:**
- IAM role not properly configured
- KMS key permissions denied
- Storage issues

**Solution:**
```bash
# Verify IAM role
kubectl exec -n vault vault-0 -- aws sts get-caller-identity

# Test KMS access
kubectl exec -n vault vault-0 -- aws kms describe-key --key-id $KMS_KEY_ID
```

#### Issue 2: Database Connection Failed

**Symptoms:**
```
Error: failed to get database credentials: connection refused
```

**Diagnosis:**
```bash
# Test connection from Vault pod
kubectl exec -n vault vault-0 -- nc -zv $DB_ENDPOINT 5432

# Check security group
aws ec2 describe-security-groups --group-ids $DB_SG_ID
```

**Solution:**
```bash
# Ensure EKS nodes can access RDS
aws ec2 authorize-security-group-ingress \
  --group-id $DB_SG_ID \
  --protocol tcp \
  --port 5432 \
  --source-group $EKS_SG
```

#### Issue 3: Kubernetes Auth Failing

**Symptoms:**
```
Error: permission denied
```

**Diagnosis:**
```bash
# Check service account
kubectl get serviceaccount backend-sa -n production -o yaml

# Check role in Vault
vault read auth/kubernetes/role/backend-role

# Check Kubernetes auth config
vault read auth/kubernetes/config
```

**Solution:**
```bash
# Ensure role matches service account name and namespace
vault write auth/kubernetes/role/backend-role \
  bound_service_account_names=backend-sa \
  bound_service_account_namespaces=production \
  policies=backend \
  ttl=1h
```

#### Issue 4: Token Renewal Failing

**Symptoms:**
```
Error: token is not renewable
```

**Solution:**
```bash
# Check token capabilities
vault token lookup

# Ensure policy allows renewal
vault policy read backend

# Should include:
# path "auth/token/renew-self" {
#   capabilities = ["update"]
# }
```

---

## Summary and Checklist

### Final Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Internet ──────► ALB ──────► Vault UI (vault.example.com)     │
│                         └──────► Backend API (api.example.com) │
│                         └──────► Frontend (app.example.com)    │
│                                                                 │
│  EKS Cluster:                                                   │
│  ├── Namespace: vault                                           │
│  │   ├── vault-0, vault-1, vault-2 (HA)                        │
│  │   └── vault-agent-injector                                   │
│  │                                                              │
│  └── Namespace: production                                      │
│      ├── backend (3 replicas)                                   │
│      └── frontend (2 replicas)                                  │
│                                                                 │
│  RDS PostgreSQL: mydb.xxxx.rds.amazonaws.com                   │
│                                                                 │
│  Vault Configuration:                                           │
│  ├── Database secrets engine (dynamic credentials)             │
│  ├── KV secrets engine (API keys)                              │
│  ├── Userpass auth (developers)                                │
│  └── Kubernetes auth (applications)                            │
│                                                                 │
│  Users:                                                         │
│  ├── Developers (read-only access)                             │
│  ├── Senior Developers (read/write secrets)                    │
│  ├── Security Admin (manage auth & policies)                   │
│  └── Admin (full access)                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Deployment Checklist

#### Pre-Deployment
- [ ] AWS account ready with admin access
- [ ] Domain name purchased and hosted zone created
- [ ] SSL certificate requested and validated
- [ ] Local tools installed (kubectl, helm, vault, aws-cli)

#### EKS Cluster
- [ ] EKS cluster created with 3+ nodes
- [ ] kubectl configured and verified
- [ ] AWS Load Balancer Controller installed
- [ ] Metrics server installed

#### RDS Database
- [ ] RDS PostgreSQL instance created
- [ ] Security group allows EKS access
- [ ] Database and tables created
- [ ] vault_admin user has CREATEROLE privilege

#### Vault Deployment
- [ ] KMS key created for auto-unseal
- [ ] S3 bucket created for backups
- [ ] IAM role created with KMS and S3 permissions
- [ ] Vault installed via Helm
- [ ] Vault initialized and unsealed
- [ ] Root token saved securely

#### Vault Configuration
- [ ] Audit logging enabled
- [ ] Database secrets engine configured
- [ ] KV secrets engine enabled
- [ ] Userpass auth enabled
- [ ] Kubernetes auth enabled

#### Users and Policies
- [ ] Admin policy created
- [ ] Security admin policy created
- [ ] Developer policy created
- [ ] Senior developer policy created
- [ ] Users created with appropriate policies

#### Application Deployment
- [ ] Backend policy created in Vault
- [ ] Kubernetes auth role created
- [ ] Service account created
- [ ] Docker images built and pushed to ECR
- [ ] Backend deployed and working
- [ ] Frontend deployed and working
- [ ] Ingress configured with SSL

#### Monitoring
- [ ] Prometheus installed
- [ ] Vault metrics being collected
- [ ] Alerts configured
- [ ] Backup cronjob configured

#### Testing
- [ ] Developer can login to Vault UI
- [ ] Backend can get database credentials
- [ ] Backend can get API keys
- [ ] Frontend loads and displays data
- [ ] Auto-renewal of credentials working

### Security Checklist
- [ ] Root token stored securely (offline)
- [ ] Unseal keys stored securely (offline, distributed)
- [ ] IAM roles follow least privilege
- [ ] Security groups restrict access
- [ ] TLS enabled everywhere
- [ ] Audit logging enabled
- [ ] Regular backup schedule
- [ ] Disaster recovery plan documented

### Cost Breakdown
| Service | Monthly Cost |
|---------|-------------|
| EKS Cluster | $73 |
| EKS Nodes (3x m5.large) | $210 |
| RDS PostgreSQL (db.r5.large) | $175 |
| Application Load Balancer (3x) | $60 |
| NAT Gateway (3x) | $96 |
| S3 Storage | $5 |
| KMS | $1 |
| Data Transfer | ~$20 |
| **Total** | **~$640/month** |

---

## Quick Reference Commands

### Vault Commands

```bash
# Status
vault status

# Login as user
vault login -method=userpass username="alice@company.com"

# Get database credentials
vault read database/creds/app-role

# Get API key
vault kv get secret/api-keys/stripe

# List users
vault list auth/userpass/users

# Create user
vault write auth/userpass/users/new@company.com \
  password="Password123!" \
  policies="developer"
```

### kubectl Commands

```bash
# Get pods
kubectl get pods -n vault
kubectl get pods -n production

# Check logs
kubectl logs -n vault vault-0
kubectl logs -n production -l app=backend

# Port forward
kubectl port-forward -n vault svc/vault 8200:8200

# Execute command
kubectl exec -n vault vault-0 -- vault status
```

### AWS CLI Commands

```bash
# Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier vault-postgres

# Check EKS cluster
aws eks describe-cluster --name vault-cluster

# View Vault backups
aws s3 ls s3://$VAULT_BACKUP_BUCKET/snapshots/
```

---

## Next Steps

1. **Implement CI/CD**: Automate deployments with GitHub Actions or Jenkins
2. **Add more secrets**: Migrate all secrets to Vault
3. **Setup PagerDuty**: Alert routing for critical issues
4. **Document processes**: Create runbooks for common operations
5. **Train team**: Educate developers on using Vault
6. **Security audit**: Regular security reviews
7. **Compliance**: Document for SOC2, HIPAA, etc.

---

**End of Guide**

This comprehensive guide covers everything needed to deploy Vault on EKS with full stack integration. Follow each part sequentially for a successful deployment.
