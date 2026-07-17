import sqlite3
import json
import hashlib
import bcrypt
from datetime import datetime, timedelta
from pathlib import Path
import config

DB_PATH = Path("data/chatbot.db")
DB_PATH.parent.mkdir(exist_ok=True)

class Database:
    def __init__(self):
        self.init_db()
    
    def get_connection(self):
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_db(self):
        """Initialize database tables"""
        conn = self.get_connection()
        c = conn.cursor()
        
        # Users table
        c.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1
            )
        ''')
        
        # Conversations table
        c.execute('''
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                language TEXT DEFAULT 'en',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_archived BOOLEAN DEFAULT 0,
                is_pinned BOOLEAN DEFAULT 0,
                share_token TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        
        # Messages table
        c.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                text TEXT NOT NULL,
                language TEXT DEFAULT 'en',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                tokens_used INTEGER DEFAULT 0,
                FOREIGN KEY(conversation_id) REFERENCES conversations(id)
            )
        ''')
        
        # API usage tracking
        c.execute('''
            CREATE TABLE IF NOT EXISTS api_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                endpoint TEXT,
                tokens_used INTEGER,
                cost REAL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Personas table (custom named system prompts)
        c.execute('''
            CREATE TABLE IF NOT EXISTS personas (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        conn.commit()
        conn.close()
    
    # USER MANAGEMENT
    def create_user(self, username, email, password):
        """Create new user with hashed password"""
        user_id = hashlib.md5(f"{username}{datetime.now()}".encode()).hexdigest()
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        
        conn = self.get_connection()
        c = conn.cursor()
        try:
            c.execute('''
                INSERT INTO users (id, username, email, password_hash)
                VALUES (?, ?, ?, ?)
            ''', (user_id, username, email, password_hash))
            conn.commit()
            return user_id
        except sqlite3.IntegrityError:
            return None
        finally:
            conn.close()
    
    def get_user(self, username):
        """Get user by username"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = c.fetchone()
        conn.close()
        return dict(user) if user else None

    def get_user_by_id(self, user_id):
        """Get user by id"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        user = c.fetchone()
        conn.close()
        return dict(user) if user else None

    def verify_password(self, stored_hash, password):
        """Verify password against stored hash"""
        return bcrypt.checkpw(password.encode(), stored_hash.encode())

    def update_password(self, user_id, new_password):
        """Hash and store a new password for a user"""
        password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
        conn = self.get_connection()
        c = conn.cursor()
        c.execute(
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (password_hash, user_id),
        )
        conn.commit()
        updated = c.rowcount > 0
        conn.close()
        return updated

    def delete_user(self, user_id):
        """Permanently delete a user and all their data.

        SQLite foreign keys aren't enforced here (no PRAGMA foreign_keys=ON),
        so child rows are deleted explicitly in dependency order rather than
        relying on cascade.
        """
        conn = self.get_connection()
        c = conn.cursor()
        c.execute(
            'DELETE FROM messages WHERE conversation_id IN '
            '(SELECT id FROM conversations WHERE user_id = ?)',
            (user_id,),
        )
        c.execute('DELETE FROM conversations WHERE user_id = ?', (user_id,))
        c.execute('DELETE FROM api_usage WHERE user_id = ?', (user_id,))
        c.execute('DELETE FROM personas WHERE user_id = ?', (user_id,))
        c.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        deleted = c.rowcount > 0
        conn.close()
        return deleted
    
    # CONVERSATION MANAGEMENT
    def create_conversation(self, user_id, title, language='en'):
        """Create new conversation"""
        conv_id = hashlib.md5(f"{user_id}{datetime.now()}".encode()).hexdigest()
        
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO conversations (id, user_id, title, language)
            VALUES (?, ?, ?, ?)
        ''', (conv_id, user_id, title, language))
        conn.commit()
        conn.close()
        return conv_id
    
    def get_conversations(self, user_id, limit=50):
        """Get all conversations for user"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            SELECT * FROM conversations 
            WHERE user_id = ? AND is_archived = 0
            ORDER BY updated_at DESC
            LIMIT ?
        ''', (user_id, limit))
        convs = [dict(row) for row in c.fetchall()]
        conn.close()
        return convs
    
    def update_conversation_title(self, conv_id, title):
        """Update conversation title"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            UPDATE conversations 
            SET title = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (title, conv_id))
        conn.commit()
        conn.close()
    
    # MESSAGE MANAGEMENT
    def add_message(self, conv_id, sender, text, language='en', tokens=0):
        """Add message to conversation"""
        msg_id = hashlib.md5(f"{conv_id}{datetime.now()}".encode()).hexdigest()
        
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO messages (id, conversation_id, sender, text, language, tokens_used)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (msg_id, conv_id, sender, text, language, tokens))
        
        # Update conversation timestamp
        c.execute('''
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (conv_id,))
        
        conn.commit()
        conn.close()
        return msg_id
    
    def get_messages(self, conv_id, limit=100):
        """Get messages from conversation"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            SELECT * FROM messages 
            WHERE conversation_id = ?
            ORDER BY timestamp ASC
            LIMIT ?
        ''', (conv_id, limit))
        messages = [dict(row) for row in c.fetchall()]
        conn.close()
        return messages
    
    def get_conversation_history(self, conv_id, max_tokens=4000):
        """Get conversation history for context"""
        messages = self.get_messages(conv_id, limit=50)
        
        history = []
        token_count = 0
        for msg in messages:
            msg_tokens = len(msg['text'].split())
            if token_count + msg_tokens > max_tokens:
                break
            history.append({
                'role': 'user' if msg['sender'] == 'user' else 'assistant',
                'content': msg['text']
            })
            token_count += msg_tokens
        
        return history
    
    # ANALYTICS
    def log_api_usage(self, user_id, endpoint, tokens_used=0, cost=0):
        """Log API usage for analytics"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO api_usage (user_id, endpoint, tokens_used, cost)
            VALUES (?, ?, ?, ?)
        ''', (user_id, endpoint, tokens_used, cost))
        conn.commit()
        conn.close()
    
    def get_user_stats(self, user_id):
        """Get user statistics"""
        conn = self.get_connection()
        c = conn.cursor()

        # Total tokens
        c.execute('''
            SELECT SUM(tokens_used) as total_tokens FROM api_usage
            WHERE user_id = ?
        ''', (user_id,))
        total_tokens = c.fetchone()['total_tokens'] or 0

        # Total conversations
        c.execute('''
            SELECT COUNT(*) as count FROM conversations
            WHERE user_id = ? AND is_archived = 0
        ''', (user_id,))
        total_conversations = c.fetchone()['count']

        conn.close()
        return {
            'total_tokens': total_tokens,
            'total_conversations': total_conversations
        }

    # PERSONA MANAGEMENT
    def create_persona(self, user_id, name, system_prompt):
        """Create a new persona for a user"""
        persona_id = hashlib.md5(f"{user_id}{name}{datetime.now()}".encode()).hexdigest()

        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            INSERT INTO personas (id, user_id, name, system_prompt)
            VALUES (?, ?, ?, ?)
        ''', (persona_id, user_id, name, system_prompt))
        conn.commit()
        conn.close()
        return persona_id

    def list_personas(self, user_id):
        """List all personas belonging to a user"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            SELECT * FROM personas WHERE user_id = ? ORDER BY created_at ASC
        ''', (user_id,))
        personas = [dict(row) for row in c.fetchall()]
        conn.close()
        return personas

    def get_persona(self, persona_id, user_id):
        """Get a single persona, scoped to its owner"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            SELECT * FROM personas WHERE id = ? AND user_id = ?
        ''', (persona_id, user_id))
        persona = c.fetchone()
        conn.close()
        return dict(persona) if persona else None

    def update_persona(self, persona_id, user_id, name, system_prompt):
        """Update a persona's name/system_prompt. Returns False if it doesn't belong to user_id."""
        if not self.get_persona(persona_id, user_id):
            return False

        conn = self.get_connection()
        c = conn.cursor()
        c.execute('''
            UPDATE personas
            SET name = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        ''', (name, system_prompt, persona_id, user_id))
        conn.commit()
        conn.close()
        return True

    def delete_persona(self, persona_id, user_id):
        """Delete a persona. Returns False if it doesn't belong to user_id."""
        if not self.get_persona(persona_id, user_id):
            return False

        conn = self.get_connection()
        c = conn.cursor()
        c.execute('DELETE FROM personas WHERE id = ? AND user_id = ?', (persona_id, user_id))
        conn.commit()
        conn.close()
        return True

# Global instance
db = Database()
