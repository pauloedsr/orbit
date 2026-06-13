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
	ID                 string
	Title              string
	Model              string
	Provider           string
	Pinned             bool
	Mode               string
	PlanPhase          string
	ContextWindowUsage float64
	ThinkingEnabled    bool
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type Message struct {
	ID             string
	ConversationID string
	Role           string
	Content        string
	Model          string
	ToolCalls      string
	ToolCallID     string
	Metadata       string // raw JSON; vazio = sem metadados específicos de provider
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
		`ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'edit'`,
		`ALTER TABLE conversations ADD COLUMN plan_phase TEXT NOT NULL DEFAULT 'planning'`,
		`ALTER TABLE messages ADD COLUMN metadata TEXT NOT NULL DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS models (
			id             TEXT PRIMARY KEY,
			friendly_name  TEXT NOT NULL,
			context_window INTEGER NOT NULL DEFAULT 0,
			temperature    REAL,
			top_p          REAL,
			max_tokens     INTEGER,
			created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`ALTER TABLE conversations ADD COLUMN context_window_usage REAL NOT NULL DEFAULT 0`,
		`CREATE TABLE IF NOT EXISTS providers (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL,
			api_url    TEXT NOT NULL,
			api_key    TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`ALTER TABLE models ADD COLUMN provider_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE models ADD COLUMN thinking_field TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE conversations ADD COLUMN thinking_enabled INTEGER NOT NULL DEFAULT 0`,
	}

	for _, m := range migrations {
		if _, err := d.conn.Exec(m); err != nil {
			// Ignora o erro intencional caso a coluna já tenha sido criada em dev anterior
			if !strings.Contains(err.Error(), "duplicate column name") && !strings.Contains(err.Error(), "already exists") {
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
		`INSERT INTO conversations (id, title, model, provider, mode, plan_phase, created_at, updated_at) VALUES (?, ?, ?, ?, 'edit', 'planning', ?, ?)`,
		id, title, model, provider, now, now,
	)
	if err != nil {
		return Conversation{}, err
	}
	return Conversation{
		ID: id, Title: title, Model: model, Provider: provider,
		Mode: "edit", PlanPhase: "planning",
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (d *Database) ListConversations() ([]Conversation, error) {
	rows, err := d.conn.Query(`SELECT id, title, model, provider, pinned, mode, plan_phase, context_window_usage, thinking_enabled, created_at, updated_at FROM conversations ORDER BY pinned DESC, updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Conversation
	for rows.Next() {
		var c Conversation
		var pinnedInt, thinkInt int
		if err := rows.Scan(&c.ID, &c.Title, &c.Model, &c.Provider, &pinnedInt, &c.Mode, &c.PlanPhase, &c.ContextWindowUsage, &thinkInt, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		c.Pinned = pinnedInt != 0
		c.ThinkingEnabled = thinkInt != 0
		out = append(out, c)
	}
	return out, rows.Err()
}

func (d *Database) GetConversation(id string) (Conversation, error) {
	var c Conversation
	var pinnedInt, thinkInt int
	err := d.conn.QueryRow(
		`SELECT id, title, model, provider, pinned, mode, plan_phase, context_window_usage, thinking_enabled, created_at, updated_at FROM conversations WHERE id = ?`, id,
	).Scan(&c.ID, &c.Title, &c.Model, &c.Provider, &pinnedInt, &c.Mode, &c.PlanPhase, &c.ContextWindowUsage, &thinkInt, &c.CreatedAt, &c.UpdatedAt)
	c.Pinned = pinnedInt != 0
	c.ThinkingEnabled = thinkInt != 0
	return c, err
}

func (d *Database) SetConversationThinkingEnabled(id string, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := d.conn.Exec(
		`UPDATE conversations SET thinking_enabled = ?, updated_at = datetime('now') WHERE id = ?`,
		v, id,
	)
	return err
}

func (d *Database) DeleteConversation(id string) error {
	_, err := d.conn.Exec(`DELETE FROM conversations WHERE id = ?`, id)
	return err
}

func (d *Database) UpdateConversation(id, title string) error {
	_, err := d.conn.Exec(
		`UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`,
		title, id,
	)
	return err
}

func (d *Database) SetConversationPinned(id string, pinned bool) error {
	pinnedInt := 0
	if pinned {
		pinnedInt = 1
	}
	_, err := d.conn.Exec(
		`UPDATE conversations SET pinned = ?, updated_at = datetime('now') WHERE id = ?`,
		pinnedInt, id,
	)
	return err
}

func (d *Database) TouchConversation(id string) error {
	_, err := d.conn.Exec(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, id)
	return err
}

func (d *Database) UpdateConversationContextWindowUsage(id string, pct float64) error {
	_, err := d.conn.Exec(
		`UPDATE conversations SET context_window_usage = ?, updated_at = datetime('now') WHERE id = ?`,
		pct, id,
	)
	return err
}

func (d *Database) SetConversationMode(id, mode, planPhase string) error {
	_, err := d.conn.Exec(
		`UPDATE conversations SET mode = ?, plan_phase = ?, updated_at = datetime('now') WHERE id = ?`,
		mode, planPhase, id,
	)
	return err
}

// ---------------------------------------------------------------------------
// Messages CRUD
// ---------------------------------------------------------------------------

func (d *Database) AddMessage(conversationID, role, content, model, toolCalls, toolCallID, metadata string) (Message, error) {
	id := uuid.NewString()
	now := time.Now().UTC()
	_, err := d.conn.Exec(
		`INSERT INTO messages (id, conversation_id, role, content, model, tool_calls, tool_call_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, conversationID, role, content, model, toolCalls, toolCallID, metadata, now,
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
		Metadata:  metadata,
		CreatedAt: now,
	}, nil
}

func (d *Database) GetMessages(conversationID string) ([]Message, error) {
	rows, err := d.conn.Query(
		`SELECT id, conversation_id, role, content, model, tool_calls, tool_call_id, metadata, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.Model, &m.ToolCalls, &m.ToolCallID, &m.Metadata, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Models CRUD
// ---------------------------------------------------------------------------

type Model struct {
	ID            string   `json:"id"`
	ProviderID    string   `json:"providerId"`
	FriendlyName  string   `json:"friendlyName"`
	ContextWindow int      `json:"contextWindow"`
	Temperature   *float64 `json:"temperature"`
	TopP          *float64 `json:"topP"`
	MaxTokens     *int     `json:"maxTokens"`
	ThinkingField string   `json:"thinkingField"`
}

func (d *Database) ListModels() ([]Model, error) {
	rows, err := d.conn.Query(
		`SELECT id, provider_id, friendly_name, context_window, temperature, top_p, max_tokens, thinking_field FROM models ORDER BY friendly_name ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Model
	for rows.Next() {
		var m Model
		if err := rows.Scan(&m.ID, &m.ProviderID, &m.FriendlyName, &m.ContextWindow, &m.Temperature, &m.TopP, &m.MaxTokens, &m.ThinkingField); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (d *Database) GetModel(id string) (Model, error) {
	var m Model
	err := d.conn.QueryRow(
		`SELECT id, provider_id, friendly_name, context_window, temperature, top_p, max_tokens, thinking_field FROM models WHERE id = ?`, id,
	).Scan(&m.ID, &m.ProviderID, &m.FriendlyName, &m.ContextWindow, &m.Temperature, &m.TopP, &m.MaxTokens, &m.ThinkingField)
	return m, err
}

func (d *Database) CreateModel(m Model) (Model, error) {
	_, err := d.conn.Exec(
		`INSERT INTO models (id, provider_id, friendly_name, context_window, temperature, top_p, max_tokens, thinking_field) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.ProviderID, m.FriendlyName, m.ContextWindow, m.Temperature, m.TopP, m.MaxTokens, m.ThinkingField,
	)
	return m, err
}

func (d *Database) UpdateModel(m Model) error {
	_, err := d.conn.Exec(
		`UPDATE models SET provider_id=?, friendly_name=?, context_window=?, temperature=?, top_p=?, max_tokens=?, thinking_field=? WHERE id=?`,
		m.ProviderID, m.FriendlyName, m.ContextWindow, m.Temperature, m.TopP, m.MaxTokens, m.ThinkingField, m.ID,
	)
	return err
}

func (d *Database) DeleteModel(id string) error {
	_, err := d.conn.Exec(`DELETE FROM models WHERE id = ?`, id)
	return err
}

// ---------------------------------------------------------------------------
// Providers CRUD
// ---------------------------------------------------------------------------

type Provider struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	APIUrl string `json:"apiUrl"`
	APIKey string `json:"apiKey"`
}

func (d *Database) ListProviders() ([]Provider, error) {
	rows, err := d.conn.Query(`SELECT id, name, api_url, api_key FROM providers ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Provider
	for rows.Next() {
		var p Provider
		if err := rows.Scan(&p.ID, &p.Name, &p.APIUrl, &p.APIKey); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (d *Database) CreateProvider(p Provider) (Provider, error) {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	_, err := d.conn.Exec(
		`INSERT INTO providers (id, name, api_url, api_key) VALUES (?, ?, ?, ?)`,
		p.ID, p.Name, p.APIUrl, p.APIKey,
	)
	return p, err
}

func (d *Database) UpdateProvider(p Provider) error {
	_, err := d.conn.Exec(
		`UPDATE providers SET name=?, api_url=?, api_key=? WHERE id=?`,
		p.Name, p.APIUrl, p.APIKey, p.ID,
	)
	return err
}

func (d *Database) DeleteProvider(id string) error {
	_, err := d.conn.Exec(`DELETE FROM providers WHERE id = ?`, id)
	return err
}

func (d *Database) SetConversationModel(id, model, provider string) error {
	_, err := d.conn.Exec(
		`UPDATE conversations SET model=?, provider=?, updated_at=datetime('now') WHERE id=?`,
		model, provider, id,
	)
	return err
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
