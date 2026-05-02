package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type Database struct {
	conn *sql.DB
}

type Conversation struct {
	ID        string
	Title     string
	Model     string
	Provider  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Message struct {
	ID             string
	ConversationID string
	Role           string
	Content        string
	Model          string
	ToolCalls      string
	ToolCallID     string
	CreatedAt      time.Time
}

// Open abre (ou cria) o banco SQLite no dataDir e roda migrations.
func Open(dataDir string) (*Database, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "orbit.db")
	conn, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	conn.SetMaxOpenConns(1) // SQLite single-writer

	db := &Database{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func (d *Database) Close() error {
	return d.conn.Close()
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

func (d *Database) migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS conversations (
			id         TEXT PRIMARY KEY,
			title      TEXT NOT NULL DEFAULT 'Nova conversa',
			model      TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
			provider   TEXT NOT NULL DEFAULT 'anthropic',
			created_at DATETIME NOT NULL DEFAULT (datetime('now')),
			updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id              TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			role            TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
			content         TEXT NOT NULL,
			model           TEXT NOT NULL DEFAULT '',
			tool_calls      TEXT NOT NULL DEFAULT '',
			tool_call_id    TEXT NOT NULL DEFAULT '',
			created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS mcp_servers (
			id      TEXT PRIMARY KEY,
			name    TEXT NOT NULL UNIQUE,
			command TEXT NOT NULL,
			args    TEXT NOT NULL DEFAULT '[]',
			env     TEXT NOT NULL DEFAULT '{}',
			enabled INTEGER NOT NULL DEFAULT 1
		)`,
		`ALTER TABLE messages ADD COLUMN tool_calls TEXT DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN tool_call_id TEXT DEFAULT ''`,
	}

	for _, m := range migrations {
		if _, err := d.conn.Exec(m); err != nil {
			// Ignora o erro intencional caso a coluna já tenha sido criada em dev anterior
			if !strings.Contains(err.Error(), "duplicate column name") {
				return fmt.Errorf("exec migration: %w", err)
			}
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Conversations CRUD
// ---------------------------------------------------------------------------

func (d *Database) CreateConversation(title, model, provider string) (Conversation, error) {
	id := uuid.NewString()
	now := time.Now().UTC()
	_, err := d.conn.Exec(
		`INSERT INTO conversations (id, title, model, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, title, model, provider, now, now,
	)
	if err != nil {
		return Conversation{}, err
	}
	return Conversation{
		ID: id, Title: title, Model: model, Provider: provider,
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (d *Database) ListConversations() ([]Conversation, error) {
	rows, err := d.conn.Query(`SELECT id, title, model, provider, created_at, updated_at FROM conversations ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.Title, &c.Model, &c.Provider, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (d *Database) GetConversation(id string) (Conversation, error) {
	var c Conversation
	err := d.conn.QueryRow(
		`SELECT id, title, model, provider, created_at, updated_at FROM conversations WHERE id = ?`, id,
	).Scan(&c.ID, &c.Title, &c.Model, &c.Provider, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (d *Database) DeleteConversation(id string) error {
	_, err := d.conn.Exec(`DELETE FROM conversations WHERE id = ?`, id)
	return err
}

func (d *Database) TouchConversation(id string) error {
	_, err := d.conn.Exec(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, id)
	return err
}

// ---------------------------------------------------------------------------
// Messages CRUD
// ---------------------------------------------------------------------------

func (d *Database) AddMessage(conversationID, role, content, model, toolCalls, toolCallID string) (Message, error) {
	id := uuid.NewString()
	now := time.Now().UTC()
	_, err := d.conn.Exec(
		`INSERT INTO messages (id, conversation_id, role, content, model, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, conversationID, role, content, model, toolCalls, toolCallID, now,
	)
	if err != nil {
		return Message{}, err
	}

	// Atualiza updated_at da conversa
	_ = d.TouchConversation(conversationID)

	return Message{
		ID: id, ConversationID: conversationID,
		Role: role, Content: content, Model: model,
		ToolCalls: toolCalls, ToolCallID: toolCallID,
		CreatedAt: now,
	}, nil
}

func (d *Database) GetMessages(conversationID string) ([]Message, error) {
	rows, err := d.conn.Query(
		`SELECT id, conversation_id, role, content, model, tool_calls, tool_call_id, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.Model, &m.ToolCalls, &m.ToolCallID, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Settings KV
// ---------------------------------------------------------------------------

func (d *Database) GetSetting(key string) (string, error) {
	var val string
	err := d.conn.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}

func (d *Database) SetSetting(key, value string) error {
	_, err := d.conn.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	return err
}
