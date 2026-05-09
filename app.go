package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/pauloedsr/orbit/backend/chat"
	"github.com/pauloedsr/orbit/backend/config"
	"github.com/pauloedsr/orbit/backend/db"
	"github.com/pauloedsr/orbit/backend/events"
	"github.com/pauloedsr/orbit/backend/interaction"
	"github.com/pauloedsr/orbit/backend/subagent"
	"github.com/pauloedsr/orbit/backend/tools"
	"github.com/pauloedsr/orbit/backend/tools/filesystem"
	toolinteraction "github.com/pauloedsr/orbit/backend/tools/interaction"
	"github.com/pauloedsr/orbit/backend/tools/shell"
	toolsubagent "github.com/pauloedsr/orbit/backend/tools/subagent"
)

// App é o struct principal exposto ao frontend via Wails bindings.
// Cada método público vira uma função JS acessível em window.go.main.App
type App struct {
	ctx  context.Context
	db   *db.Database
	cfg  *config.Config
	reg  *tools.Registry
	ia   *interaction.Service
	sa   *subagent.Service
	chat *chat.Service
}

func NewApp(database *db.Database, cfg *config.Config) *App {
	reg := tools.New()
	filesystem.Register(reg)
	shell.Register(reg)

	ia := interaction.New(nil)
	sa := subagent.New(nil, reg, database)

	reg.Register(toolinteraction.AskTextDef, ia.HandleAskText)
	reg.Register(toolinteraction.AskChoiceDef, ia.HandleAskChoice)
	reg.Register(toolsubagent.Def, sa.AsToolHandler())

	chatSvc := chat.New(nil, database, reg, ia)

	return &App{
		db:   database,
		cfg:  cfg,
		reg:  reg,
		ia:   ia,
		sa:   sa,
		chat: chatSvc,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	emitter := events.NewWailsEmitter(ctx)
	a.ia.SetEmitter(emitter)
	a.ia.SetContext(ctx)
	a.sa.SetEmitter(emitter)
	a.sa.SetContext(ctx)
	a.chat.SetEmitter(emitter)
}

func (a *App) shutdown(ctx context.Context) {
	a.db.Close()
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

type ConversationDTO struct {
	ID                 string  `json:"id"`
	Title              string  `json:"title"`
	Model              string  `json:"model"`
	Provider           string  `json:"provider"`
	Pinned             bool    `json:"pinned"`
	Mode               string  `json:"mode"`
	PlanPhase          string  `json:"planPhase"`
	ContextWindowUsage float64 `json:"contextWindowUsage"`
	CreatedAt          string  `json:"createdAt"`
	UpdatedAt          string  `json:"updatedAt"`
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

func (a *App) UpdateConversation(id, title string) error {
	return a.db.UpdateConversation(id, title)
}

func (a *App) SetConversationPinned(id string, pinned bool) error {
	return a.db.SetConversationPinned(id, pinned)
}

func (a *App) SetConversationMode(id, mode string) error {
	return a.db.SetConversationMode(id, mode, "planning")
}

func (a *App) StartPlanImplementation(id string) error {
	return a.db.SetConversationMode(id, "plan", "implementing")
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
	ToolCalls      string `json:"toolCalls,omitempty"`
	ToolCallID     string `json:"toolCallId,omitempty"`
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
	msg, err := a.db.AddMessage(conversationID, role, content, model, "", "", "")
	if err != nil {
		return MessageDTO{}, err
	}
	return toMsgDTO(msg), nil
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

func (a *App) SendMessage(conversationID, content string) (MessageDTO, error) {
	msg, err := a.chat.Send(a.ctx, conversationID, content)
	if err != nil {
		return MessageDTO{}, err
	}
	return toMsgDTO(msg), nil
}

func (a *App) StopStream(conversationID string) {
	a.chat.Stop(conversationID)
}

func (a *App) SubmitToolResponse(requestID, response string) {
	a.ia.SubmitResponse(requestID, response)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

type SettingsDTO struct {
	DefaultModel    string `json:"defaultModel"`
	DefaultProvider string `json:"defaultProvider"`
	Theme           string `json:"theme"`
	LLMEndpoint     string `json:"llmEndpoint"`
	LLMApiKey       string `json:"llmApiKey"`
	LLMModel        string `json:"llmModel"`
}

func (a *App) GetSettings() (SettingsDTO, error) {
	endpoint, _ := a.db.GetSetting("llm_endpoint")
	apiKey, _ := a.db.GetSetting("llm_api_key")
	model, _ := a.db.GetSetting("llm_model")
	if model == "" {
		model = a.cfg.DefaultModel
	}
	return SettingsDTO{
		DefaultModel:    a.cfg.DefaultModel,
		DefaultProvider: a.cfg.DefaultProvider,
		Theme:           a.cfg.Theme,
		LLMEndpoint:     endpoint,
		LLMApiKey:       apiKey,
		LLMModel:        model,
	}, nil
}

func (a *App) UpdateSetting(key, value string) error {
	return a.db.SetSetting(key, value)
}

// ---------------------------------------------------------------------------
// Models registry
// ---------------------------------------------------------------------------

func (a *App) ListModels() ([]db.Model, error) {
	return a.db.ListModels()
}

func (a *App) CreateModel(m db.Model) (db.Model, error) {
	return a.db.CreateModel(m)
}

func (a *App) UpdateModel(m db.Model) error {
	return a.db.UpdateModel(m)
}

func (a *App) DeleteModel(id string) error {
	return a.db.DeleteModel(id)
}

// ---------------------------------------------------------------------------
// Providers registry
// ---------------------------------------------------------------------------

func (a *App) ListProviders() ([]db.Provider, error) {
	return a.db.ListProviders()
}

func (a *App) CreateProvider(p db.Provider) (db.Provider, error) {
	return a.db.CreateProvider(p)
}

func (a *App) UpdateProvider(p db.Provider) error {
	return a.db.UpdateProvider(p)
}

func (a *App) DeleteProvider(id string) error {
	return a.db.DeleteProvider(id)
}

func (a *App) SetConversationModel(convID, modelID string) error {
	provider := "openai-compat"
	if strings.HasPrefix(modelID, "claude-") {
		provider = "anthropic"
	}
	return a.db.SetConversationModel(convID, modelID, provider)
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

func (a *App) Ping() string {
	return fmt.Sprintf("pong @ %s", time.Now().Format(time.RFC3339))
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

func toConvDTO(c db.Conversation) ConversationDTO {
	mode := c.Mode
	if mode == "" {
		mode = "edit"
	}
	planPhase := c.PlanPhase
	if planPhase == "" {
		planPhase = "planning"
	}
	return ConversationDTO{
		ID:                 c.ID,
		Title:              c.Title,
		Model:              c.Model,
		Provider:           c.Provider,
		Pinned:             c.Pinned,
		Mode:               mode,
		PlanPhase:          planPhase,
		ContextWindowUsage: c.ContextWindowUsage,
		CreatedAt:          c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:          c.UpdatedAt.Format(time.RFC3339),
	}
}

func toMsgDTO(m db.Message) MessageDTO {
	return MessageDTO{
		ID:             m.ID,
		ConversationID: m.ConversationID,
		Role:           m.Role,
		Content:        m.Content,
		Model:          m.Model,
		ToolCalls:      m.ToolCalls,
		ToolCallID:     m.ToolCallID,
		CreatedAt:      m.CreatedAt.Format(time.RFC3339),
	}
}
