# Real-World Task Management Application

## Overview

This is a complete 3-tier application demonstrating enterprise-grade security with HashiCorp Vault:

- Frontend: React SPA with modern UI
- Backend: Node.js REST API
- Database: PostgreSQL with dynamic credentials from Vault

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
│  • Task Management Dashboard                                 │
│  • Real-time Stats                                           │
│  • CRUD Operations                                           │
│  • Modern UI/UX                                              │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                         │
│  • REST API Endpoints                                        │
│  • Vault Integration                                         │
│  • Dynamic Credential Management                             │
│  • Auto-renewal (1 hour TTL)                                 │
└────────────────────────┬────────────────────────────────────┘
                         │ PostgreSQL Protocol
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE (PostgreSQL)                     │
│  • Users Table                                               │
│  • Tasks Table                                               │
│  • Task Tags Table                                           │
│  • Sample Data                                               │
└─────────────────────────────────────────────────────────────┘
                         ▲
                         │ Dynamic Credentials
                         │
┌─────────────────────────────────────────────────────────────┐
│                      VAULT SERVER                            │
│  • Database Secrets Engine                                   │
│  • Dynamic PostgreSQL Users                                  │
│  • Automatic Rotation                                        │
│  • Audit Logging                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Start All Services

```powershell
# Start everything (Vault, PostgreSQL, Backend, Frontend)
docker-compose up -d --build

# Wait for services to initialize (30 seconds)
Start-Sleep -Seconds 30
```

### 2. Configure Vault

```powershell
# Setup Vault database secrets engine
bash setup-vault-db.sh
```

### 3. Restart Backend with Database

```powershell
# Restart backend to connect to database
docker-compose restart backend
Start-Sleep -Seconds 10
```

### 4. Open the Application

```powershell
# Open frontend
start http://localhost:5173

# Open Vault UI
start http://localhost:8200/ui
# Token: dev-only-token
```

---

## Features

### Frontend Features

**Dashboard**
- Real-time task statistics
- Task counts by status
- Overdue task warnings

**Task Management**
- Create new tasks
- Edit existing tasks
- Delete tasks
- Filter by status/priority
- Due date tracking
- Tag support

**Security Display**
- Shows dynamic database username
- Displays credential expiration
- Real-time connection status

### Backend Features

**REST API Endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks | Get all tasks (with filters) |
| GET | /api/tasks/:id | Get single task |
| POST | /api/tasks | Create task |
| PUT | /api/tasks/:id | Update task |
| DELETE | /api/tasks/:id | Delete task |
| GET | /api/stats | Dashboard statistics |
| GET | /api/db/test | Test database connection |
| GET | /api/health | Health check |

**Vault Integration**
- Dynamic credential retrieval
- Auto-renewal (80% of TTL)
- Connection pool management
- Graceful credential rotation

### Database Features

**Schema**
- Users table
- Tasks table
- Task tags table
- Proper indexes
- Foreign key constraints

**Sample Data**
- 3 sample users
- 6 sample tasks
- Task tags

---

## Security Features

### Dynamic Database Credentials

**How it works:**

1. Backend requests credentials from Vault
2. Vault creates unique PostgreSQL user: v-token-xxxxx
3. User has 1 hour TTL
4. Backend auto-renews at 48 minutes
5. Old credentials automatically revoked

**Benefits:**

- No hardcoded passwords in code
- Automatic credential rotation
- Limited blast radius if leaked
- Complete audit trail
- Instant revocation capability

### Example Flow

```javascript
// Backend: backend/src/db.js

// 1. Get dynamic credentials
const creds = await vault.read('database/creds/app-role');
// Returns: {username: 'v-token-abc123', password: 'xyz'}

// 2. Connect to PostgreSQL
const pool = new Pool({
  host: 'postgres',
  database: 'vault_demo',
  user: creds.username,     // Dynamic!
  password: creds.password  // Dynamic!
});

// 3. Query database
const tasks = await pool.query('SELECT * FROM tasks');

// 4. Auto-renew before expiry
setTimeout(renewCredentials, 3600 * 0.8 * 1000);
```

---

## Testing

### Test API Endpoints

```powershell
# Get all tasks
curl http://localhost:3000/api/tasks

# Get dashboard stats
curl http://localhost:3000/api/stats

# Create a task
curl -X POST http://localhost:3000/api/tasks `
  -H "Content-Type: application/json" `
  -d '{"title":"New Task","description":"Test task","priority":"high"}'

# Update a task
curl -X PUT http://localhost:3000/api/tasks/1 `
  -H "Content-Type: application/json" `
  -d '{"status":"completed"}'

# Delete a task
curl -X DELETE http://localhost:3000/api/tasks/1
```

### Test Database Credentials

```powershell
# Check which database user is connected
curl http://localhost:3000/api/db/test

# Generate new credentials manually
docker exec vault-server sh -c "VAULT_TOKEN=dev-only-token vault read database/creds/app-role"

# See dynamic users in PostgreSQL
docker exec vault-postgres psql -U postgres -d vault_demo -c "\du"
```

### Test Frontend

1. Open http://localhost:5173
2. Create a new task
3. Edit task status/priority
4. Filter tasks
5. Delete a task
6. Watch database status change

---

## Project Structure

```
vault-lab/
├── docker-compose.yml          # All services
├── setup-vault-db.sh           # Vault database setup
├── postgres/
│   └── init.sql                # Database schema
├── backend/
│   ├── src/
│   │   ├── index.js            # API endpoints
│   │   ├── db.js               # Database connection
│   │   ├── vault.js            # Vault client
│   │   └── routes/             # API routes
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main React component
│   │   ├── App.css             # Modern styles
│   │   └── main.jsx
│   ├── package.json
│   └── Dockerfile
└── docs/
    ├── README.md               # Main documentation
    ├── burmese.md              # Burmese documentation
    └── REAL-WORLD-APP.md       # This file
```

---

## Learning Points

### 1. No Hardcoded Credentials

**Traditional (INSECURE)**:
```javascript
const pool = new Pool({
  user: 'admin',
  password: 'password123'  // In code!
});
```

**Your Way (SECURE)**:
```javascript
const creds = await vault.read('database/creds/app-role');
const pool = new Pool({
  user: creds.username,     // Dynamic
  password: creds.password  // Never in code
});
```

### 2. Automatic Rotation

Credentials rotate every hour automatically:
- No manual intervention
- Zero downtime
- Transparent to application

### 3. Audit Trail

Every credential generation is logged:
```powershell
# View Vault audit logs
docker exec vault-server cat /vault/logs/audit.log
```

### 4. Instant Revocation

If credentials are compromised:
```powershell
# Revoke all credentials immediately
docker exec vault-server sh -c "VAULT_TOKEN=dev-only-token vault lease revoke -prefix database/creds/app-role"
```

---

## Real-World Use Cases

### Use Case 1: Microservices Architecture

Each microservice gets its own credentials:

```
Order Service     → v-token-order-xxx
Payment Service   → v-token-payment-xxx
User Service      → v-token-user-xxx
Inventory Service → v-token-inventory-xxx
```

### Use Case 2: Multi-Tenant Application

Each customer gets isolated credentials:

```
Customer A → v-token-tenant-a-xxx
Customer B → v-token-tenant-b-xxx
Customer C → v-token-tenant-c-xxx
```

### Use Case 3: CI/CD Pipeline

Dynamic credentials for deployment:

```yaml
# GitHub Actions
- name: Get DB Credentials
  run: |
    CREDS=$(vault read -format=json database/creds/deploy-role)
    export DB_USER=$(echo $CREDS | jq -r '.data.username')
    export DB_PASS=$(echo $CREDS | jq -r '.data.password')
```

---

## Production Deployment

### Environment Variables

```bash
# Backend
VAULT_ADDR=https://vault.company.com
VAULT_ROLE_ID=abc-123
VAULT_SECRET_ID=xyz-789
DB_HOST=prod-postgres.cluster-xxx.region.rds.amazonaws.com
DB_NAME=production_db
```

### Vault Configuration

```bash
# Production role with stricter TTL
vault write database/roles/app-role \
    db_name=postgres \
    creation_statements="..." \
    default_ttl="5m" \
    max_ttl="1h"
```

### High Availability

- Multiple Vault instances
- Raft storage backend
- Auto-unseal with cloud KMS
- Load balancer for backend
- Connection pooling

---

## Additional Resources

- [Vault Database Secrets Engine](https://developer.hashicorp.com/vault/docs/secrets/databases)
- [Vault PostgreSQL Plugin](https://developer.hashicorp.com/vault/docs/secrets/databases/postgresql)
- [node-vault Documentation](https://github.com/nodevault/node-vault)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

---

You now have a production-ready 3-tier application with enterprise-grade secrets management!
