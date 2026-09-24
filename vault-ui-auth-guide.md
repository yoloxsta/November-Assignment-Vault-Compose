# Vault UI Authentication Guide - Complete Step-by-Step

Complete guide to set up authentication in Vault UI without using commands.

---

## Table of Contents

1. [Overview](#overview)
2. [Accessing Vault UI](#accessing-vault-ui)
3. [Enable Userpass Authentication](#enable-userpass-authentication)
4. [Create Policies](#create-policies)
5. [Create Users](#create-users)
6. [Test User Login](#test-user-login)
7. [Manage Users](#manage-users)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What You'll Learn

- How to login to Vault UI
- How to enable Username/Password authentication
- How to create policies (access control rules)
- How to create users with different permission levels
- How to test and manage users

### Authentication Methods Available

| Method | Use Case | For Humans? | For Apps? |
|--------|----------|-------------|-----------|
| **Token** | Quick access, development | Yes | No |
| **Username/Password** | Team access, production | Yes | No |
| **AppRole** | Application authentication | No | Yes |
| **GitHub** | SSO with GitHub | Yes | No |
| **LDAP** | Enterprise SSO | Yes | No |

### What We'll Set Up

```
3 Users with different access levels:

1. admin
   - Full access to everything
   - Policy: root
   
2. developer
   - Read database credentials
   - Read/list secrets
   - Cannot write or delete
   - Policy: developer-policy
   
3. viewer
   - Read secrets only
   - No write access
   - Policy: read-only-policy
```

---

## Accessing Vault UI

### Step 1: Open Vault UI

```
URL: http://localhost:8200/ui
```

You'll see the login page:

```
┌─────────────────────────────────────────┐
│ Sign in to Vault                        │
├─────────────────────────────────────────┤
│                                         │
│ Method                                  │
│ [Token ▼]                               │
│                                         │
│ Token                                   │
│ [________________]                      │
│                                         │
│ [Sign in]                               │
│                                         │
│ Contact your administrator for login    │
│ credentials                             │
│                                         │
└─────────────────────────────────────────┘
```

### Step 2: Login with Root Token

```
1. Method: Token (default)
2. Token: dev-only-token
3. Click "Sign in"
```

**Note:** The root token `dev-only-token` is configured in `docker-compose.yml` for development mode.

### Step 3: Verify Successful Login

After login, you'll see the Vault dashboard:

```
┌─────────────────────────────────────────┐
│ Vault                                   │
├─────────────────────────────────────────┤
│                                         │
│ Secrets          Access         Admin   │
│                                         │
│ ▼ secret/                               │
│   └─ kv                                  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Enable Userpass Authentication

### Step 1: Navigate to Access

1. Click **"Access"** in the top menu
2. You'll see the Auth Methods page

```
┌─────────────────────────────────────────┐
│ Access > Auth Methods                   │
├─────────────────────────────────────────┤
│                                         │
│ Auth Methods                            │
│                                         │
│ Path        Type       Description      │
│ ────        ────       ───────────      │
│ token/      token      token based...   │
│                                         │
│ [Enable new method]                     │
│                                         │
└─────────────────────────────────────────┘
```

### Step 2: Enable New Method

1. Click **"Enable new method"** button

```
┌─────────────────────────────────────────┐
│ Enable Method                           │
├─────────────────────────────────────────┤
│                                         │
│ Select method type:                     │
│                                         │
│ ○ AppRole                               │
│ ○ GitHub                                │
│ ○ JWT/OIDC                              │
│ ○ Kerberos                              │
│ ○ Kubernetes                            │
│ ○ LDAP                                  │
│ ○ Okta                                  │
│ ○ RADIUS                                │
│ ● Username & Password    ← Select this  │
│                                         │
│ [Enable Method]                         │
│                                         │
└─────────────────────────────────────────┘
```

2. Select **"Username & Password"**
3. Click **"Enable Method"**

### Step 3: Configure Userpass

```
┌─────────────────────────────────────────┐
│ Enable Username & Password Method       │
├─────────────────────────────────────────┤
│                                         │
│ Path (optional):                        │
│ [userpass]              ← Keep default  │
│                                         │
│ Description (optional):                 │
│ [Userpass authentication]               │
│                                         │
│ Accessor (read-only):                   │
│ auth_userpass_xxxxx                     │
│                                         │
│ [Enable Method]         ← Click this    │
│                                         │
└─────────────────────────────────────────┘
```

1. Leave path as `userpass` (default)
2. Optionally add a description
3. Click **"Enable Method"**

### Step 4: Verify Userpass Enabled

You'll see the updated Auth Methods list:

```
┌─────────────────────────────────────────┐
│ Access > Auth Methods                   │
├─────────────────────────────────────────┤
│                                         │
│ Auth Methods                            │
│                                         │
│ Path          Type            Desc...   │
│ ────          ────            ──────    │
│ token/        token          token...   │
│ userpass/     userpass       Userpass   │
│                                         │
└─────────────────────────────────────────┘
```

---

## Create Policies

Policies define what users can access. We'll create three policies.

### Step 1: Navigate to Policies

1. Click **"Policies"** in the top menu

```
┌─────────────────────────────────────────┐
│ Policies                                │
├─────────────────────────────────────────┤
│                                         │
│ Policies                                │
│                                         │
│ Name          Description               │
│ ────          ───────────               │
│ default       Default policy            │
│ root          Root access policy        │
│                                         │
│ [Create ACL policy]                     │
│                                         │
└─────────────────────────────────────────┘
```

### Step 2: Create Developer Policy

1. Click **"Create ACL policy"**

```
┌─────────────────────────────────────────┐
│ Create ACL Policy                       │
├─────────────────────────────────────────┤
│                                         │
│ Name *                                  │
│ [developer-policy]     ← Enter this     │
│                                         │
│ Description                             │
│ [Developer read-only access]            │
│                                         │
│ Policy *                                │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │ path "database/creds/*" {           │ │
│ │   capabilities = ["read"]           │ │
│ │ }                                   │ │
│ │                                     │ │
│ │ path "secret/data/*" {              │ │
│ │   capabilities = ["read", "list"]   │ │
│ │ }                                   │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Create policy]                         │
│                                         │
└─────────────────────────────────────────┘
```

2. Enter the following details:

**Name:** `developer-policy`

**Description:** `Developer read-only access to database credentials and secrets`

**Policy:**

```hcl
# Allow reading database credentials
path "database/creds/*" {
  capabilities = ["read"]
}

# Allow reading and listing secrets
path "secret/data/*" {
  capabilities = ["read", "list"]
}

# Allow listing secret paths
path "secret/metadata/*" {
  capabilities = ["list"]
}
```

3. Click **"Create policy"**

### Step 3: Create Read-Only Policy

1. Click **"Create ACL policy"** again

**Name:** `read-only-policy`

**Description:** `Read-only access to secrets only`

**Policy:**

```hcl
# Allow reading secrets only
path "secret/data/*" {
  capabilities = ["read"]
}

# Allow listing secret paths
path "secret/metadata/*" {
  capabilities = ["list"]
}
```

2. Click **"Create policy"**

### Step 4: Verify Policies Created

You should see:

```
┌─────────────────────────────────────────┐
│ Policies                                │
├─────────────────────────────────────────┤
│                                         │
│ Name              Description           │
│ ────              ───────────           │
│ default           Default policy        │
│ developer-policy  Developer read-only   │
│ read-only-policy  Read-only access      │
│ root              Root access policy    │
│                                         │
└─────────────────────────────────────────┘
```

### Policy Permissions Summary

| Policy | Database Credentials | Read Secrets | Write Secrets | Delete Secrets |
|--------|---------------------|--------------|---------------|----------------|
| root | Yes | Yes | Yes | Yes |
| developer-policy | Yes | Yes | No | No |
| read-only-policy | No | Yes | No | No |

---

## Create Users

Now we'll create three users with different policies.

### Step 1: Navigate to Userpass

1. Click **"Access"** in the top menu
2. Click **"userpass"** in the Auth Methods list

```
┌─────────────────────────────────────────┐
│ Access > Auth Methods > userpass        │
├─────────────────────────────────────────┤
│                                         │
│ userpass                                │
│                                         │
│ Method overview                         │
│                                         │
│ Type: userpass                          │
│ Path: userpass/                         │
│ Description: Userpass authentication    │
│                                         │
│ [Create user]                           │
│                                         │
└─────────────────────────────────────────┘
```

### Step 2: Create Admin User

1. Click **"Create user"**

```
┌─────────────────────────────────────────┐
│ Create user                             │
├─────────────────────────────────────────┤
│                                         │
│ Username *                              │
│ [admin]                ← Enter this     │
│                                         │
│ Password *                              │
│ [AdminPass123!]        ← Enter this     │
│                                         │
│ Confirm password *                      │
│ [AdminPass123!]        ← Re-enter       │
│                                         │
│ Policies                                │
│ [root ▼]               ← Select root    │
│                                         │
│ [Save]                 ← Click this     │
│                                         │
└─────────────────────────────────────────┘
```

2. Enter the following:

**Username:** `admin`  
**Password:** `AdminPass123!`  
**Confirm password:** `AdminPass123!`  
**Policies:** `root`

3. Click **"Save"**

### Step 3: Create Developer User

1. Click **"Create user"** again

```
┌─────────────────────────────────────────┐
│ Create user                             │
├─────────────────────────────────────────┤
│                                         │
│ Username *                              │
│ [developer]            ← Enter this     │
│                                         │
│ Password *                              │
│ [DevPass123!]          ← Enter this     │
│                                         │
│ Confirm password *                      │
│ [DevPass123!]          ← Re-enter       │
│                                         │
│ Policies                                │
│ [developer-policy ▼]   ← Select this    │
│                                         │
│ [Save]                 ← Click this     │
│                                         │
└─────────────────────────────────────────┘
```

2. Enter the following:

**Username:** `developer`  
**Password:** `DevPass123!`  
**Confirm password:** `DevPass123!`  
**Policies:** `developer-policy`

3. Click **"Save"**

### Step 4: Create Viewer User

1. Click **"Create user"** again

```
┌─────────────────────────────────────────┐
│ Create user                             │
├─────────────────────────────────────────┤
│                                         │
│ Username *                              │
│ [viewer]               ← Enter this     │
│                                         │
│ Password *                              │
│ [ViewPass123!]         ← Enter this     │
│                                         │
│ Confirm password *                      │
│ [ViewPass123!]         ← Re-enter       │
│                                         │
│ Policies                                │
│ [read-only-policy ▼]   ← Select this    │
│                                         │
│ [Save]                 ← Click this     │
│                                         │
└─────────────────────────────────────────┘
```

2. Enter the following:

**Username:** `viewer`  
**Password:** `ViewPass123!`  
**Confirm password:** `ViewPass123!`  
**Policies:** `read-only-policy`

3. Click **"Save"**

### Step 5: Verify Users Created

You should see all users:

```
┌─────────────────────────────────────────┐
│ Access > Auth Methods > userpass        │
├─────────────────────────────────────────┤
│                                         │
│ Users                                   │
│                                         │
│ Username          Policies              │
│ ────────          ────────              │
│ admin             root                  │
│ developer         developer-policy      │
│ viewer            read-only-policy      │
│                                         │
│ [Create user]                           │
│                                         │
└─────────────────────────────────────────┘
```

---

## Test User Login

Now let's test each user to make sure they can login and have the correct permissions.

### Step 1: Sign Out

1. Click your username in the top right corner
2. Click **"Sign out"**

```
┌─────────────────────────────────────────┐
│ Vault                    [admin ▼]      │
├─────────────────────────────────────────┤
│                                         │
│                                         │
└─────────────────────────────────────────┘

Click [admin ▼] → Sign out
```

### Step 2: Test Admin Login

```
1. Method: Username        ← Select this
2. Username: admin
3. Password: AdminPass123!
4. Click: Sign in
```

**What admin can do:**

- See all secrets
- Create/edit/delete secrets
- Access database credentials
- Manage policies
- Manage users
- Everything (root access)

**Test admin access:**

1. Go to **"Secrets"** → Can see, create, edit, delete
2. Go to **"Access"** → Can see all auth methods
3. Go to **"Policies"** → Can create/edit/delete policies

### Step 3: Test Developer Login

1. Sign out
2. Login with:

```
Method: Username
Username: developer
Password: DevPass123!
```

**What developer can do:**

- Read database credentials
- Read and list secrets
- Cannot write or delete secrets
- Cannot manage policies or users

**Test developer access:**

1. Go to **"Secrets"** → Can read, but cannot create new secrets
2. Try to create a secret → Should see permission denied
3. Try to access database credentials → Should work

**Developer restrictions:**

```
Trying to create a secret:
┌─────────────────────────────────────────┐
│ Error                                   │
├─────────────────────────────────────────┤
│                                         │
│ permission denied                       │
│                                         │
│ [OK]                                    │
│                                         │
└─────────────────────────────────────────┘
```

### Step 4: Test Viewer Login

1. Sign out
2. Login with:

```
Method: Username
Username: viewer
Password: ViewPass123!
```

**What viewer can do:**

- Read secrets only
- Cannot access database credentials
- Cannot write, delete, or list

**Test viewer access:**

1. Go to **"Secrets"** → Can read existing secrets
2. Try to access database credentials → Permission denied
3. Try to create a secret → Permission denied

### Step 5: Test Summary

| Test | admin | developer | viewer |
|------|-------|-----------|--------|
| Login | ✓ | ✓ | ✓ |
| Read secrets | ✓ | ✓ | ✓ |
| Write secrets | ✓ | ✗ | ✗ |
| Delete secrets | ✓ | ✗ | ✗ |
| Access database/creds | ✓ | ✓ | ✗ |
| Manage policies | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ |

---

## Manage Users

### How to View User Details

1. Go to **Access** → **userpass**
2. Click on a username

```
┌─────────────────────────────────────────┐
│ User: developer                         │
├─────────────────────────────────────────┤
│                                         │
│ Username: developer                     │
│ Policies: developer-policy              │
│                                         │
│ [Edit user]  [Delete user]              │
│                                         │
└─────────────────────────────────────────┘
```

### How to Update User Password

1. Click **"Edit user"**
2. Enter new password in the password field
3. Click **"Save"**

```
┌─────────────────────────────────────────┐
│ Edit user: developer                    │
├─────────────────────────────────────────┤
│                                         │
│ Username (read-only): developer         │
│                                         │
│ New password *                          │
│ [NewDevPass456!]      ← Enter new       │
│                                         │
│ Confirm password *                      │
│ [NewDevPass456!]      ← Re-enter        │
│                                         │
│ Policies                                │
│ [developer-policy ▼]                    │
│                                         │
│ [Save]                                  │
│                                         │
└─────────────────────────────────────────┘
```

### How to Update User Policies

1. Click **"Edit user"**
2. Select different policies from the dropdown
3. Click **"Save"**

### How to Delete a User

1. Click on the user
2. Click **"Delete user"**
3. Confirm the deletion

```
┌─────────────────────────────────────────┐
│ Confirm Delete                          │
├─────────────────────────────────────────┤
│                                         │
│ Are you sure you want to delete user    │
│ "developer"?                            │
│                                         │
│ [Cancel]  [Delete]                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## Troubleshooting

### Issue 1: Cannot Login

**Symptoms:**
```
Error: invalid username or password
```

**Possible Causes:**
1. User doesn't exist
2. Wrong password entered
3. Userpass auth method not enabled

**Solutions:**
1. Verify userpass is enabled: Access → Auth Methods → Should see `userpass/`
2. Check username spelling
3. Check password (case-sensitive)
4. Try logging in with root token to verify

### Issue 2: Permission Denied

**Symptoms:**
```
Error: permission denied
```

**Possible Causes:**
1. User's policy doesn't allow the action
2. Policy not attached to user
3. Policy syntax error

**Solutions:**
1. Check user's policies: Access → userpass → Click username
2. Verify policy content: Policies → Click policy name
3. Test with admin user first

### Issue 3: Cannot See Auth Methods

**Symptoms:**
```
Auth Methods page is empty or missing options
```

**Possible Causes:**
1. Not logged in with sufficient privileges
2. Using token with limited policy

**Solutions:**
1. Login with root token: `dev-only-token`
2. Or login with admin user

### Issue 4: Cannot Create Users

**Symptoms:**
```
"Create user" button not visible or disabled
```

**Possible Causes:**
1. Not logged in as admin or root
2. Userpass not enabled

**Solutions:**
1. Login as admin or with root token
2. Verify userpass is enabled

### Issue 5: User Cannot Access Certain Paths

**Symptoms:**
```
User can login but cannot access specific secrets
```

**Possible Causes:**
1. Policy path doesn't match
2. Wrong capabilities specified

**Solutions:**
1. Check policy paths match actual secret paths
2. Verify capabilities are correct
3. Test policy with root user first

Example of correct policy path:

```hcl
# Correct - for KV v2
path "secret/data/myapp/*" {
  capabilities = ["read"]
}

# Wrong - missing /data/ for KV v2
path "secret/myapp/*" {
  capabilities = ["read"]
}
```

---

## Best Practices

### 1. Use Strong Passwords

```
Bad:  admin123
Good: Adm!n_P@ss2024$ecure
```

### 2. Follow Least Privilege Principle

```
Admin     → Only for system administrators
Developer → Only what they need for work
Viewer    → Read-only for auditors/managers
```

### 3. Regular Password Rotation

Change passwords every 90 days or when employees leave.

### 4. Use Specific Policies

Instead of giving broad access:

```
Bad:
path "secret/*" {
  capabilities = ["read"]
}

Good:
path "secret/data/production/database" {
  capabilities = ["read"]
}
```

### 5. Audit User Access

Regularly review:
- Who has access
- What they can access
- When they last logged in

---

## Quick Reference

### Login Credentials Summary

| Username | Password | Policy | Access Level |
|----------|----------|--------|--------------|
| Token | dev-only-token | root | Full access |
| admin | AdminPass123! | root | Full access |
| developer | DevPass123! | developer-policy | Read DB creds, read secrets |
| viewer | ViewPass123! | read-only-policy | Read secrets only |

### UI Navigation Paths

```
Enable Userpass:
Access → Enable new method → Username & Password → Enable

Create Policy:
Policies → Create ACL policy → Enter policy → Create

Create User:
Access → userpass → Create user → Enter details → Save

View Users:
Access → userpass → See user list

Edit User:
Access → userpass → Click username → Edit user

Delete User:
Access → userpass → Click username → Delete user
```

### Policy Templates

**Admin (root) - Built-in:**
```hcl
# Has all permissions automatically
```

**Developer:**
```hcl
path "database/creds/*" {
  capabilities = ["read"]
}
path "secret/data/*" {
  capabilities = ["read", "list"]
}
```

**Read-Only:**
```hcl
path "secret/data/*" {
  capabilities = ["read"]
}
```

---

## Summary

You have successfully:

1. Accessed Vault UI
2. Enabled Userpass authentication
3. Created three policies with different access levels
4. Created three users with different permissions
5. Tested each user's login and access
6. Learned how to manage users

**Key Takeaways:**

- UI is the easiest way to manage authentication
- Always follow the principle of least privilege
- Test each user's access after creation
- Regularly audit and rotate credentials
- Use strong passwords

**Next Steps:**

- Set up AppRole for application authentication
- Configure LDAP/OIDC for enterprise SSO
- Enable audit logging
- Set up policy testing workflows

---

**Your Vault UI is now configured with user authentication!**
