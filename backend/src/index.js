const express = require('express');
const cors = require('cors');
require('dotenv').config();

const vault = require('./vault');
const secretsRouter = require('./routes/secrets');
const healthRouter = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/secrets', secretsRouter);
app.use('/api/health', healthRouter);

// Encryption routes (Transit engine)
app.post('/api/encrypt', async (req, res) => {
  try {
    const { plaintext, key_name = 'myapp-key' } = req.body;
    
    if (!plaintext) {
      return res.status(400).json({ error: 'plaintext is required' });
    }

    // Encode plaintext to base64 (required by Transit)
    const encodedPlaintext = Buffer.from(plaintext).toString('base64');
    
    const result = await vault.write(`transit/encrypt/${key_name}`, {
      plaintext: encodedPlaintext
    });

    res.json({
      success: true,
      ciphertext: result.data.ciphertext,
      key_version: result.data.key_version
    });
  } catch (error) {
    console.error('Encryption error:', error.message);
    res.status(500).json({ 
      error: 'Encryption failed', 
      details: error.message 
    });
  }
});

// Decryption endpoint
app.post('/api/decrypt', async (req, res) => {
  try {
    const { ciphertext, key_name = 'myapp-key' } = req.body;
    
    if (!ciphertext) {
      return res.status(400).json({ error: 'ciphertext is required' });
    }

    const result = await vault.write(`transit/decrypt/${key_name}`, {
      ciphertext: ciphertext
    });

    // Decode base64 to plaintext
    const decodedPlaintext = Buffer.from(result.data.plaintext, 'base64').toString('utf-8');

    res.json({
      success: true,
      plaintext: decodedPlaintext
    });
  } catch (error) {
    console.error('Decryption error:', error.message);
    res.status(500).json({ 
      error: 'Decryption failed', 
      details: error.message 
    });
  }
});

// Vault status endpoint
app.get('/api/vault/status', async (req, res) => {
  try {
    const status = await vault.read('sys/health');
    res.json({
      success: true,
      status: {
        initialized: status.initialized,
        sealed: status.sealed,
        standby: status.standby,
        version: status.server_time_utc
      }
    });
  } catch (error) {
    console.error('Vault status error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get Vault status', 
      details: error.message 
    });
  }
});

// List all secrets at a path
app.get('/api/secrets/list/:path(*)', async (req, res) => {
  try {
    const path = req.params.path;
    const result = await vault.list(`secret/metadata/${path}`);
    
    res.json({
      success: true,
      keys: result.data.keys || []
    });
  } catch (error) {
    console.error('List secrets error:', error.message);
    res.status(500).json({ 
      error: 'Failed to list secrets', 
      details: error.message 
    });
  }
});

// ============================================
// DATABASE ROUTES (Dynamic Credentials Demo)
// ============================================

// Test database connection
app.get('/api/db/test', async (req, res) => {
  try {
    const db = require('./db');
    const pool = db.getPool();
    const credentials = db.getCredentialsInfo();
    
    // Execute a test query
    const result = await pool.query('SELECT NOW() as current_time, current_user');
    
    res.json({
      success: true,
      message: 'Database connection successful',
      database: {
        currentTime: result.rows[0].current_time,
        connectedUser: result.rows[0].current_user,
        credentials: {
          username: credentials.username,
          expiresAt: credentials.expiresAt,
          timeUntilExpiry: Math.round(credentials.timeUntilExpiry / 1000) + ' seconds'
        }
      }
    });
  } catch (error) {
    console.error('Database test error:', error.message);
    res.status(500).json({ 
      error: 'Database connection failed', 
      details: error.message 
    });
  }
});

// Get all users (demo query)
app.get('/api/db/users', async (req, res) => {
  try {
    const db = require('./db');
    const pool = db.getPool();
    
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    
    res.json({
      success: true,
      users: result.rows,
      credentials: db.getCredentialsInfo()
    });
  } catch (error) {
    console.error('Query error:', error.message);
    res.status(500).json({ 
      error: 'Database query failed', 
      details: error.message 
    });
  }
});

// Create a user
app.post('/api/db/users', async (req, res) => {
  try {
    const { username, email } = req.body;
    
    if (!username || !email) {
      return res.status(400).json({ error: 'username and email are required' });
    }
    
    const db = require('./db');
    const pool = db.getPool();
    
    const result = await pool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
      [username, email]
    );
    
    res.status(201).json({
      success: true,
      user: result.rows[0],
      credentials: db.getCredentialsInfo()
    });
  } catch (error) {
    console.error('Create user error:', error.message);
    res.status(500).json({ 
      error: 'Failed to create user', 
      details: error.message 
    });
  }
});

// Get database credentials info
app.get('/api/db/credentials', (req, res) => {
  try {
    const db = require('./db');
    const info = db.getCredentialsInfo();
    
    res.json({
      success: true,
      credentials: info
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get credentials info', 
      details: error.message 
    });
  }
});

// ============================================
// TASK MANAGEMENT API (Real-World Application)
// ============================================

// Get all tasks with filtering
app.get('/api/tasks', async (req, res) => {
  try {
    const db = require('./db');
    const pool = db.getPool();
    
    const { status, priority, user_id } = req.query;
    
    let query = `
      SELECT t.*, u.username, u.email,
             array_agg(tt.tag) FILTER (WHERE tt.tag IS NOT NULL) as tags
      FROM tasks t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (priority) {
      query += ` AND t.priority = $${paramCount}`;
      params.push(priority);
      paramCount++;
    }
    
    if (user_id) {
      query += ` AND t.user_id = $${paramCount}`;
      params.push(user_id);
      paramCount++;
    }
    
    query += ` GROUP BY t.id, u.username, u.email ORDER BY t.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      tasks: result.rows,
      count: result.rows.length,
      credentials: db.getCredentialsInfo()
    });
  } catch (error) {
    console.error('Get tasks error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get tasks', 
      details: error.message 
    });
  }
});

// Get single task
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const db = require('./db');
    const pool = db.getPool();
    
    const result = await pool.query(`
      SELECT t.*, u.username, u.email,
             array_agg(tt.tag) FILTER (WHERE tt.tag IS NOT NULL) as tags
      FROM tasks t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      WHERE t.id = $1
      GROUP BY t.id, u.username, u.email
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({
      success: true,
      task: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get task', 
      details: error.message 
    });
  }
});

// Create task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, status, priority, due_date, user_id, tags } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const db = require('./db');
    const pool = db.getPool();
    
    // Insert task
    const taskResult = await pool.query(`
      INSERT INTO tasks (title, description, status, priority, due_date, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [title, description, status || 'pending', priority || 'medium', due_date, user_id || 1]);
    
    const task = taskResult.rows[0];
    
    // Insert tags if provided
    if (tags && Array.isArray(tags) && tags.length > 0) {
      for (const tag of tags) {
        await pool.query(
          'INSERT INTO task_tags (task_id, tag) VALUES ($1, $2)',
          [task.id, tag]
        );
      }
    }
    
    res.status(201).json({
      success: true,
      task: task,
      message: 'Task created successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create task', 
      details: error.message 
    });
  }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { title, description, status, priority, due_date, user_id, tags } = req.body;
    
    const db = require('./db');
    const pool = db.getPool();
    
    // Update task
    const result = await pool.query(`
      UPDATE tasks
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          status = COALESCE($3, status),
          priority = COALESCE($4, priority),
          due_date = COALESCE($5, due_date),
          user_id = COALESCE($6, user_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [title, description, status, priority, due_date, user_id, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = result.rows[0];
    
    // Update tags if provided
    if (tags && Array.isArray(tags)) {
      // Delete existing tags
      await pool.query('DELETE FROM task_tags WHERE task_id = $1', [task.id]);
      
      // Insert new tags
      for (const tag of tags) {
        await pool.query(
          'INSERT INTO task_tags (task_id, tag) VALUES ($1, $2)',
          [task.id, tag]
        );
      }
    }
    
    res.json({
      success: true,
      task: task,
      message: 'Task updated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update task', 
      details: error.message 
    });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const db = require('./db');
    const pool = db.getPool();
    
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({
      success: true,
      message: 'Task deleted successfully',
      task: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete task', 
      details: error.message 
    });
  }
});

// Get dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    const db = require('./db');
    const pool = db.getPool();
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_tasks,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_tasks,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority_tasks,
        COUNT(*) FILTER (WHERE due_date < CURRENT_TIMESTAMP AND status NOT IN ('completed', 'cancelled')) as overdue_tasks
      FROM tasks
    `);
    
    const usersResult = await pool.query('SELECT COUNT(*) as total_users FROM users');
    
    res.json({
      success: true,
      stats: {
        ...statsResult.rows[0],
        total_users: parseInt(usersResult.rows[0].total_users)
      },
      credentials: db.getCredentialsInfo()
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get stats', 
      details: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    details: err.message 
  });
});

// Initialize Vault connection and start server
async function startServer() {
  console.log('🔌 Connecting to Vault at:', process.env.VAULT_ADDR);
  
  // Wait for Vault to be ready
  let connected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const health = await vault.read('sys/health');
      console.log('✅ Connected to Vault');
      console.log(`   Health response:`, JSON.stringify(health));
      connected = true;
      break;
    } catch (error) {
      console.log(`⏳ Waiting for Vault... (${30 - i - 1} retries left)`);
      console.log(`   Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!connected) {
    console.error('❌ Failed to connect to Vault after 30 retries');
    process.exit(1);
    return;
  }

  // Initialize database with dynamic credentials
  try {
    const db = require('./db');
    await db.initializeDatabase();
  } catch (error) {
    console.error('⚠️  Database initialization failed:', error.message);
    console.log('   Continuing without database connection...');
  }

  // Start Express server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📊 Health: http://localhost:${PORT}/api/health`);
    console.log(`🔐 Secrets: http://localhost:${PORT}/api/secrets`);
    console.log(`💾 Database: http://localhost:${PORT}/api/db/test`);
  });
}

startServer();
