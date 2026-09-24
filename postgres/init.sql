-- ============================================
-- Task Management Application Schema
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Task tags table
CREATE TABLE IF NOT EXISTS task_tags (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample users
INSERT INTO users (username, email) VALUES 
    ('alice', 'alice@example.com'),
    ('bob', 'bob@example.com'),
    ('charlie', 'charlie@example.com');

-- Insert sample tasks
INSERT INTO tasks (title, description, status, priority, due_date, user_id) VALUES
    ('Complete Vault Integration', 'Set up Vault for secrets management', 'in_progress', 'high', '2026-09-25 18:00:00', 1),
    ('Review Security Policies', 'Audit and update security policies', 'pending', 'high', '2026-09-26 12:00:00', 1),
    ('Deploy to Production', 'Deploy the application to production servers', 'pending', 'urgent', '2026-09-27 09:00:00', 2),
    ('Write Documentation', 'Create comprehensive API documentation', 'completed', 'medium', '2026-09-24 17:00:00', 2),
    ('Setup Monitoring', 'Configure application monitoring and alerts', 'pending', 'medium', '2026-09-28 10:00:00', 3),
    ('Database Backup', 'Configure automated database backups', 'in_progress', 'high', '2026-09-25 15:00:00', 3);

-- Insert sample tags
INSERT INTO task_tags (task_id, tag) VALUES
    (1, 'security'),
    (1, 'vault'),
    (2, 'security'),
    (3, 'devops'),
    (4, 'documentation'),
    (5, 'monitoring'),
    (6, 'database');

-- Grant permissions for Vault dynamic credentials
GRANT ALL PRIVILEGES ON DATABASE vault_demo TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
