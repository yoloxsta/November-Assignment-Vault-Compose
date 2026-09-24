import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:3000/api';
const VAULT_UI_URL = 'http://localhost:8200/ui';

function App() {
  const [vaultStatus, setVaultStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Database state
  const [dbStatus, setDbStatus] = useState(null);

  // Tasks state
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState({ status: '', priority: '' });

  // Form state
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    due_date: '',
    tags: []
  });

  useEffect(() => {
    fetchVaultStatus();
    testDatabase();
    fetchTasks();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [filter]);

  const fetchVaultStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/health`);
      setVaultStatus(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to connect to Vault backend');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const testDatabase = async () => {
    try {
      const response = await axios.get(`${API_URL}/db/test`);
      setDbStatus(response.data);
    } catch (err) {
      setDbStatus({ success: false, error: err.response?.data?.details || err.message });
    }
  };

  const fetchTasks = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.priority) params.append('priority', filter.priority);
      
      const response = await axios.get(`${API_URL}/tasks?${params}`);
      setTasks(response.data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/stats`);
      setStats(response.data.stats);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/tasks`, taskForm);
      setShowTaskForm(false);
      setTaskForm({
        title: '',
        description: '',
        status: 'pending',
        priority: 'medium',
        due_date: '',
        tags: []
      });
      fetchTasks();
      fetchStats();
    } catch (err) {
      alert('Failed to create task: ' + err.message);
    }
  };

  const updateTask = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/tasks/${editingTask.id}`, taskForm);
      setEditingTask(null);
      setShowTaskForm(false);
      fetchTasks();
      fetchStats();
    } catch (err) {
      alert('Failed to update task: ' + err.message);
    }
  };

  const deleteTask = async (id) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await axios.delete(`${API_URL}/tasks/${id}`);
      fetchTasks();
      fetchStats();
    } catch (err) {
      alert('Failed to delete task: ' + err.message);
    }
  };

  const startEdit = (task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ? task.due_date.split('T')[0] : '',
      tags: task.tags || []
    });
    setShowTaskForm(true);
  };

  const cancelForm = () => {
    setShowTaskForm(false);
    setEditingTask(null);
    setTaskForm({
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      due_date: '',
      tags: []
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      in_progress: '#3b82f6',
      completed: '#10b981',
      cancelled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: '#6b7280',
      medium: '#3b82f6',
      high: '#f59e0b',
      urgent: '#ef4444'
    };
    return colors[priority] || '#6b7280';
  };

  return (
    <div className="app">
      <header className="header">
        <h1>📋 Task Management App</h1>
        <div className="header-right">
          <span className="vault-badge">
            🔐 Secured by Vault
          </span>
          <a href={VAULT_UI_URL} target="_blank" rel="noopener noreferrer" className="vault-link">
            Open Vault UI →
          </a>
        </div>
      </header>

      <main className="main">
        {/* Stats Dashboard */}
        {stats && (
          <section className="stats-section">
            <div className="stat-card">
              <div className="stat-icon">📊</div>
              <div className="stat-value">{stats.total_tasks}</div>
              <div className="stat-label">Total Tasks</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⏳</div>
              <div className="stat-value">{stats.pending_tasks}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🔄</div>
              <div className="stat-value">{stats.in_progress_tasks}</div>
              <div className="stat-label">In Progress</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-value">{stats.completed_tasks}</div>
              <div className="stat-label">Completed</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⚠️</div>
              <div className="stat-value">{stats.overdue_tasks}</div>
              <div className="stat-label">Overdue</div>
            </div>
          </section>
        )}

        {/* Database Connection Status */}
        {dbStatus && dbStatus.success && (
          <section className="db-status-compact">
            <div className="db-info">
              <span className="db-badge">💾 PostgreSQL Connected</span>
              <span className="db-user">User: <code>{dbStatus.database.connectedUser}</code></span>
              <span className="db-expiry">Expires in: {dbStatus.database.credentials.timeUntilExpiry}</span>
            </div>
          </section>
        )}

        {/* Task Management */}
        <section className="tasks-section">
          <div className="tasks-header">
            <h2>Tasks</h2>
            <button 
              className="btn-primary"
              onClick={() => setShowTaskForm(true)}
            >
              + New Task
            </button>
          </div>

          {/* Filters */}
          <div className="filters">
            <select 
              value={filter.status} 
              onChange={(e) => setFilter({...filter, status: e.target.value})}
              className="filter-select"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select 
              value={filter.priority} 
              onChange={(e) => setFilter({...filter, priority: e.target.value})}
              className="filter-select"
            >
              <option value="">All Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>

            <button 
              className="btn-secondary"
              onClick={() => setFilter({ status: '', priority: '' })}
            >
              Clear Filters
            </button>
          </div>

          {/* Task Form */}
          {showTaskForm && (
            <div className="task-form-overlay">
              <form className="task-form" onSubmit={editingTask ? updateTask : createTask}>
                <h3>{editingTask ? 'Edit Task' : 'Create New Task'}</h3>
                
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({...taskForm, title: e.target.value})}
                    placeholder="Enter task title"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({...taskForm, description: e.target.value})}
                    placeholder="Enter task description"
                    rows="3"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={taskForm.status}
                      onChange={(e) => setTaskForm({...taskForm, status: e.target.value})}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm({...taskForm, priority: e.target.value})}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={taskForm.due_date}
                      onChange={(e) => setTaskForm({...taskForm, due_date: e.target.value})}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={cancelForm}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingTask ? 'Update Task' : 'Create Task'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tasks List */}
          <div className="tasks-list">
            {tasks.length === 0 ? (
              <div className="empty-state">
                <p>No tasks found. Create your first task!</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="task-card">
                  <div className="task-header-row">
                    <h3 className="task-title">{task.title}</h3>
                    <div className="task-badges">
                      <span 
                        className="badge status-badge"
                        style={{ backgroundColor: getStatusColor(task.status) }}
                      >
                        {task.status.replace('_', ' ')}
                      </span>
                      <span 
                        className="badge priority-badge"
                        style={{ backgroundColor: getPriorityColor(task.priority) }}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  
                  {task.description && (
                    <p className="task-description">{task.description}</p>
                  )}
                  
                  <div className="task-meta">
                    <div className="task-meta-left">
                      {task.due_date && (
                        <span className="task-due">
                          📅 {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {task.tags && task.tags.length > 0 && (
                        <div className="task-tags">
                          {task.tags.map((tag, i) => (
                            <span key={i} className="tag">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="task-actions">
                      <button 
                        className="btn-icon"
                        onClick={() => startEdit(task)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn-icon"
                        onClick={() => deleteTask(task.id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <div className="task-footer">
                    <small>Created by {task.username} • {new Date(task.created_at).toLocaleDateString()}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Vault Security Info */}
        <section className="vault-info">
          <h2>🔐 Security Information</h2>
          <div className="vault-details">
            <div className="vault-item">
              <strong>Database Credentials:</strong>
              <p>Dynamic credentials from Vault</p>
              <p>Auto-rotate every 1 hour</p>
              <p>No hardcoded passwords</p>
            </div>
            <div className="vault-item">
              <strong>Security Benefits:</strong>
              <p>✅ No credentials in code</p>
              <p>✅ Automatic rotation</p>
              <p>✅ Audit trail in Vault</p>
              <p>✅ Limited blast radius</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>Task Management App • Secured by HashiCorp Vault • React + Node.js + PostgreSQL</p>
      </footer>
    </div>
  );
}

export default App;
