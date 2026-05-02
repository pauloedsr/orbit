package main

import (
	"context"
	"fmt"
	"time"

	"github.com/paulocanedo/orbit/backend/config"
	"github.com/paulocanedo/orbit/backend/db"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App é o struct principal exposto ao frontend via Wails bindings.
// Cada método público vira uma função JS acessível em window.go.main.App
type App struct {
	ctx context.Context
	db  *db.Database
	cfg *config.Config
}

func NewApp(database *db.Database, cfg *config.Config) *App {
	return &App{db: database, cfg: cfg}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	a.db.Close()
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

type ConversationDTO struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Model     string `json:"model"`
	Provider  string `json:"provider"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func (a *App) CreateConversation(title, model, provider string) (ConversationDTO, error) {
	conv, err := a.db.CreateConversation(title, model, provider)
	if err != nil {
		return ConversationDTO{}, err
	}
	return toConvDTO(conv), nil
}

func (a *App) ListConversations() ([]ConversationDTO, error) {
	convs, err := a.db.ListConversations()
	if err != nil {
		return nil, err
	}
	out := make([]ConversationDTO, len(convs))
	for i, c := range convs {
		out[i] = toConvDTO(c)
	}
	return out, nil
}

func (a *App) DeleteConversation(id string) error {
	return a.db.DeleteConversation(id)
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type MessageDTO struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversationId"`
	Role           string `json:"role"`
	Content        string `json:"content"`
	Model          string `json:"model"`
	CreatedAt      string `json:"createdAt"`
}

func (a *App) GetMessages(conversationID string) ([]MessageDTO, error) {
	msgs, err := a.db.GetMessages(conversationID)
	if err != nil {
		return nil, err
	}
	out := make([]MessageDTO, len(msgs))
	for i, m := range msgs {
		out[i] = toMsgDTO(m)
	}
	return out, nil
}

func (a *App) AddMessage(conversationID, role, content, model string) (MessageDTO, error) {
	msg, err := a.db.AddMessage(conversationID, role, content, model)
	if err != nil {
		return MessageDTO{}, err
	}
	return toMsgDTO(msg), nil
}

// ---------------------------------------------------------------------------
// Chat (mock por enquanto — será substituído pelo provider real)
// ---------------------------------------------------------------------------

func (a *App) SendMessage(conversationID, content string) (MessageDTO, error) {
	// 1. Persiste mensagem do usuário
	_, err := a.db.AddMessage(conversationID, "user", content, a.cfg.DefaultModel)
	if err != nil {
		return MessageDTO{}, fmt.Errorf("save user msg: %w", err)
	}

	// 2. Emite evento de "pensando" para a UI
	runtime.EventsEmit(a.ctx, "chat:thinking", conversationID)

	// 3. Mock: resposta fake (substituir pelo provider na fase 2)
	reply := fmt.Sprintf("Echo from Orbit: %s", content)

	// 4. Persiste resposta do assistente
	msg, err := a.db.AddMessage(conversationID, "assistant", reply, a.cfg.DefaultModel)
	if err != nil {
		return MessageDTO{}, fmt.Errorf("save assistant msg: %w", err)
	}

	// 5. Emite evento de resposta completa
	runtime.EventsEmit(a.ctx, "chat:message", toMsgDTO(msg))

	return toMsgDTO(msg), nil
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

type SettingsDTO struct {
	DefaultModel    string `json:"defaultModel"`
	DefaultProvider string `json:"defaultProvider"`
	Theme           string `json:"theme"`
}

func (a *App) GetSettings() SettingsDTO {
	return SettingsDTO{
		DefaultModel:    a.cfg.DefaultModel,
		DefaultProvider: a.cfg.DefaultProvider,
		Theme:           a.cfg.Theme,
	}
}

func (a *App) UpdateSetting(key, value string) error {
	return a.db.SetSetting(key, value)
}

// ---------------------------------------------------------------------------
// Health check / IPC proof
// ---------------------------------------------------------------------------

func (a *App) Ping() string {
	return fmt.Sprintf("pong @ %s", time.Now().Format(time.RFC3339))
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

func toConvDTO(c db.Conversation) ConversationDTO {
	return ConversationDTO{
		ID:        c.ID,
		Title:     c.Title,
		Model:     c.Model,
		Provider:  c.Provider,
		CreatedAt: c.CreatedAt.Format(time.RFC3339),
		UpdatedAt: c.UpdatedAt.Format(time.RFC3339),
	}
}

func toMsgDTO(m db.Message) MessageDTO {
	return MessageDTO{
		ID:             m.ID,
		ConversationID: m.ConversationID,
		Role:           m.Role,
		Content:        m.Content,
		Model:          m.Model,
		CreatedAt:      m.CreatedAt.Format(time.RFC3339),
	}
}
