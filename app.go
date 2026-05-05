package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/pauloedsr/orbit/backend/config"
	"github.com/pauloedsr/orbit/backend/db"
	"github.com/pauloedsr/orbit/backend/providers"
	"github.com/pauloedsr/orbit/backend/tools"
	"github.com/pauloedsr/orbit/backend/tools/filesystem"
	"github.com/pauloedsr/orbit/backend/tools/interaction"
	"github.com/pauloedsr/orbit/backend/tools/shell"
	"github.com/pauloedsr/orbit/backend/tools/subagent"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App é o struct principal exposto ao frontend via Wails bindings.
// Cada método público vira uma função JS acessível em window.go.main.App
type App struct {
	ctx   context.Context
	db    *db.Database
	cfg   *config.Config
	tools *tools.Registry

	// Interação bloqueante com o frontend (ask / confirm)
	pending   map[string]chan string
	pendingMu sync.Mutex

	// Allowlist de tools confirmadas com "sempre permitir"
	allowlist   map[string]struct{}
	allowlistMu sync.RWMutex

	// Cancelamento de stream por conversa (botão Stop)
	streamCancels   map[string]context.CancelFunc
	streamCancelsMu sync.Mutex
}

func NewApp(database *db.Database, cfg *config.Config) *App {
	a := &App{
		db:            database,
		cfg:           cfg,
		pending:       make(map[string]chan string),
		allowlist:     make(map[string]struct{}),
		streamCancels: make(map[string]context.CancelFunc),
	}

	reg := tools.New()
	filesystem.Register(reg)
	shell.Register(reg)
	reg.Register(interaction.AskTextDef, a.handleAskText)
	reg.Register(interaction.AskChoiceDef, a.handleAskChoice)
	reg.Register(subagent.Def, a.handleSubAgent)
	a.tools = reg

	return a
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
	Pinned    bool   `json:"pinned"`
	Mode      string `json:"mode"`
	PlanPhase string `json:"planPhase"`
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

func (a *App) UpdateConversation(id, title string) error {
	return a.db.UpdateConversation(id, title)
}

func (a *App) SetConversationPinned(id string, pinned bool) error {
	return a.db.SetConversationPinned(id, pinned)
}

func (a *App) SetConversationMode(id, mode string) error {
	// Resets plan_phase to 'planning' whenever mode changes
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
	msg, err := a.db.AddMessage(conversationID, role, content, model, "", "")
	if err != nil {
		return MessageDTO{}, err
	}
	return toMsgDTO(msg), nil
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

func (a *App) SendMessage(conversationID, content string) (MessageDTO, error) {
	// 1. Valida configuração antes de persistir
	endpoint, _ := a.db.GetSetting("llm_endpoint")
	if endpoint == "" {
		return MessageDTO{}, fmt.Errorf("LLM endpoint não configurado — abra Settings e configure o endpoint")
	}
	apiKey, _ := a.db.GetSetting("llm_api_key")

	// 2. Persiste mensagem do usuário
	_, err := a.db.AddMessage(conversationID, "user", content, "", "", "")
	if err != nil {
		return MessageDTO{}, fmt.Errorf("save user msg: %w", err)
	}

	// 3. Carrega conversa (para saber o modelo) e histórico
	conv, err := a.db.GetConversation(conversationID)
	if err != nil {
		return MessageDTO{}, fmt.Errorf("get conversation: %w", err)
	}

	model := conv.Model
	if m, _ := a.db.GetSetting("llm_model"); m != "" {
		model = m
	}

	// Contexto cancelável por conversa — permite botão Stop sem afetar outras conversas
	ctx, cancel := context.WithCancel(a.ctx)
	a.streamCancelsMu.Lock()
	a.streamCancels[conversationID] = cancel
	a.streamCancelsMu.Unlock()
	defer func() {
		cancel()
		a.streamCancelsMu.Lock()
		delete(a.streamCancels, conversationID)
		a.streamCancelsMu.Unlock()
	}()

	p := providers.NewOpenAIProvider("openai-compat", endpoint, apiKey)
	var finalMsg db.Message

	// Loop principal de Tool Calling
	for {
		dbMsgs, err := a.db.GetMessages(conversationID)
		if err != nil {
			return MessageDTO{}, fmt.Errorf("get messages: %w", err)
		}

		// 4. Sinaliza "pensando" para a UI
		runtime.EventsEmit(a.ctx, "chat:thinking", map[string]any{
			"conversationId": conversationID,
		})

		// 5. Monta payload mapeando tool_calls armazenados em JSON
		provMsgs := make([]providers.Message, 0, len(dbMsgs))
		for _, m := range dbMsgs {
			var tcs []providers.ToolCall
			if m.ToolCalls != "" {
				json.Unmarshal([]byte(m.ToolCalls), &tcs)
			}
			provMsgs = append(provMsgs, providers.Message{
				Role:       m.Role,
				Content:    m.Content,
				ToolCalls:  tcs,
				ToolCallID: m.ToolCallID,
			})
		}

		req := providers.Request{
			Model:    model,
			Messages: provMsgs,
			Tools:    a.toolsForMode(conv.Mode, conv.PlanPhase),
			Stream:   true,
		}

		// Inject system prompt for plan mode by prepending a system message
		if conv.Mode == "plan" {
			req.Messages = append([]providers.Message{{Role: "system", Content: planSystemPrompt}}, req.Messages...)
		}

		// 6. Streaming — corre em goroutine com contexto cancelável
		eventCh := make(chan providers.Event, 64)
		errCh := make(chan error, 1)
		go func() { errCh <- p.Stream(ctx, req, eventCh) }()

		var buf strings.Builder
		activeToolCalls := make(map[int]*providers.ToolCall)

		for evt := range eventCh {
			switch evt.Type {
			case providers.EventTextDelta:
				buf.WriteString(evt.Text)
				runtime.EventsEmit(a.ctx, "chat:chunk", map[string]any{
					"conversationId": conversationID,
					"text":           evt.Text,
				})
			case providers.EventToolCallStart:
				if activeToolCalls[evt.ToolCall.Index] == nil {
					activeToolCalls[evt.ToolCall.Index] = &providers.ToolCall{
						ID:   evt.ToolCall.ID,
						Name: evt.ToolCall.Name,
					}
					msg := fmt.Sprintf("\n\n⚙️ Chamando ferramenta: `%s`\nParâmetros: ", evt.ToolCall.Name)
					runtime.EventsEmit(a.ctx, "chat:chunk", map[string]any{
						"conversationId": conversationID,
						"text":           msg,
					})
				}
			case providers.EventToolCallDelta:
				if activeToolCalls[evt.ToolCall.Index] == nil {
					activeToolCalls[evt.ToolCall.Index] = &providers.ToolCall{}
				}
				activeToolCalls[evt.ToolCall.Index].Arguments += evt.ToolCall.ArgDelta
				runtime.EventsEmit(a.ctx, "chat:chunk", map[string]any{
					"conversationId": conversationID,
					"text":           evt.ToolCall.ArgDelta,
				})
			case providers.EventError:
			}
		}
		if err := <-errCh; err != nil {
			if errors.Is(err, context.Canceled) {
				// Salva conteúdo parcial acumulado antes do stop
				if buf.Len() > 0 {
					partialMsg, _ := a.db.AddMessage(conversationID, "assistant", buf.String(), model, "", "")
					runtime.EventsEmit(a.ctx, "chat:stopped", map[string]any{
						"conversationId": conversationID,
						"message":        toMsgDTO(partialMsg),
					})
				} else {
					runtime.EventsEmit(a.ctx, "chat:stopped", map[string]any{
						"conversationId": conversationID,
						"message":        nil,
					})
				}
				return MessageDTO{}, nil
			}
			return MessageDTO{}, fmt.Errorf("stream: %w", err)
		}

		// 7. Avalia Tool Calls invocadas ou finaliza o turno
		if len(activeToolCalls) > 0 {
			var tcs []providers.ToolCall
			for i := 0; i < len(activeToolCalls); i++ {
				if tc, ok := activeToolCalls[i]; ok {
					tcs = append(tcs, *tc)
				}
			}
			tcsJSON, _ := json.Marshal(tcs)

			msg, err := a.db.AddMessage(conversationID, "assistant", buf.String(), model, string(tcsJSON), "")
			if err != nil {
				return MessageDTO{}, fmt.Errorf("save assistant tool msg: %w", err)
			}
			runtime.EventsEmit(a.ctx, "chat:message", map[string]any{
				"conversationId": conversationID,
				"message":        toMsgDTO(msg),
			})

			// Executa ferramentas e injeta as respostas na conversa
			for _, tc := range tcs {
				result := a.executeToolCall(tc)
				toolMsg, err := a.db.AddMessage(conversationID, "tool", result, model, "", tc.ID)
				if err != nil {
					return MessageDTO{}, fmt.Errorf("save tool result msg: %w", err)
				}
				runtime.EventsEmit(a.ctx, "chat:message", map[string]any{
					"conversationId": conversationID,
					"message":        toMsgDTO(toolMsg),
				})
			}

			continue
		}

		// Sem tool calls, o LLM finalizou a resposta
		msg, err := a.db.AddMessage(conversationID, "assistant", buf.String(), model, "", "")
		if err != nil {
			return MessageDTO{}, fmt.Errorf("save assistant msg: %w", err)
		}
		finalMsg = msg
		runtime.EventsEmit(a.ctx, "chat:message", map[string]any{
			"conversationId": conversationID,
			"message":        toMsgDTO(finalMsg),
		})
		break
	}

	return toMsgDTO(finalMsg), nil
}

func (a *App) StopStream(conversationID string) {
	a.streamCancelsMu.Lock()
	defer a.streamCancelsMu.Unlock()
	if cancel, ok := a.streamCancels[conversationID]; ok {
		cancel()
	}
}

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

// askModeTools — only read-only filesystem tools.
var askModeTools = map[string]bool{
	"read_file": true, "tail_file": true, "search_files": true,
	"grep_files": true, "grep_files_lines": true, "diff_file": true,
}

// planPlanningTools — read + shell queries + write for creating the plan file + interaction.
var planPlanningTools = map[string]bool{
	"read_file": true, "tail_file": true, "search_files": true,
	"grep_files": true, "grep_files_lines": true, "diff_file": true,
	"write_file": true, "run_shell": true, "run_shell_script": true,
	"ask_user_text": true, "ask_user_choice": true,
}

const planSystemPrompt = `Você é Orbit, operando em MODO PLAN.

FASE DE PLANEJAMENTO:
- Utilize as ferramentas de leitura e shell (somente leitura/consulta) para compreender completamente o contexto do que o usuário precisa.
- Crie ou atualize o arquivo de plano em .orbit/plans/<nome-descritivo>.md com seções claras: Objetivo, Contexto, Tarefas, Riscos.
- Apresente um resumo executivo (ou mais detalhes quando necessário) ao usuário.
- Solicite que o usuário clique em "Iniciar Implementação" para confirmar o início da execução.
- NÃO faça modificações destrutivas ou alterações de código antes da confirmação.

FASE DE IMPLEMENTAÇÃO (após confirmação do usuário):
- Siga o plano criado fielmente.
- Use todas as ferramentas disponíveis, incluindo subagentes para delegar tarefas.
- Atualize o arquivo de plano marcando cada etapa concluída.`

func filterTools(all []providers.Tool, allowed map[string]bool) []providers.Tool {
	out := make([]providers.Tool, 0, len(allowed))
	for _, t := range all {
		if allowed[t.Name] {
			out = append(out, t)
		}
	}
	return out
}

func (a *App) toolsForMode(mode, planPhase string) []providers.Tool {
	all := a.tools.Definitions()
	switch mode {
	case "ask":
		return filterTools(all, askModeTools)
	case "plan":
		if planPhase == "implementing" {
			return all
		}
		return filterTools(all, planPlanningTools)
	default: // "edit"
		return all
	}
}

func (a *App) executeToolCall(tc providers.ToolCall) string {
	fmt.Printf("[Orbit] Tool: '%s' | Args: %s\n", tc.Name, tc.Arguments)
	var args map[string]any
	if tc.Arguments != "" {
		if err := json.Unmarshal([]byte(tc.Arguments), &args); err != nil {
			return fmt.Sprintf("Erro ao parsear argumentos JSON: %v", err)
		}
	}
	if denied := a.checkConfirm(tc.Name, args); denied != "" {
		return denied
	}
	return a.tools.Dispatch(tc.Name, args)
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
		ID:        c.ID,
		Title:     c.Title,
		Model:     c.Model,
		Provider:  c.Provider,
		Pinned:    c.Pinned,
		Mode:      mode,
		PlanPhase: planPhase,
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
		ToolCalls:      m.ToolCalls,
		ToolCallID:     m.ToolCallID,
		CreatedAt:      m.CreatedAt.Format(time.RFC3339),
	}
}
