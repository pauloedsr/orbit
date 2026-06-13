package main

import (
	"context"
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
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
	ThinkingEnabled    bool    `json:"thinkingEnabled"`
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

func (a *App) SetConversationThinkingEnabled(id string, enabled bool) error {
	return a.db.SetConversationThinkingEnabled(id, enabled)
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
	Metadata       string `json:"metadata,omitempty"`
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
// Symbol Search
// ---------------------------------------------------------------------------

// SearchResult representa um único item nos resultados da busca.
type SearchResult struct {
	Type string `json:"type"`
	Name string `json:"name"`
	Path string `json:"path"`
	Line *int   `json:"line"` // Ponteiro para permitir valor nulo
}

// SearchSymbols realiza uma busca concorrente por arquivos e símbolos.
func (a *App) SearchSymbols(query string) ([]SearchResult, error) {
	if strings.TrimSpace(query) == "" {
		return []SearchResult{}, nil
	}

	var wg sync.WaitGroup
	resultsChan := make(chan SearchResult, 50)

	// Goroutine 1: Busca de Arquivos
	wg.Add(1)
	go func() {
		defer wg.Done()
		globPattern := fmt.Sprintf("**/*%s*", query)
		files, err := filesystem.SearchFilesByGlob(globPattern)
		if err != nil {
			// Em uma aplicação real, logaríamos este erro.
			// Por simplicidade, vamos ignorá-lo por enquanto.
			return
		}
		for _, file := range files {
			resultsChan <- SearchResult{
				Type: "file",
				Name: filepath.Base(file),
				Path: file,
				Line: nil,
			}
		}
	}()

	// Goroutine 2: Busca de Símbolos
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Regex para capturar definições de funções, classes, etc.
		// Ex: "func myFunction", "class myClass", "def my_function"
		symbolRegex := fmt.Sprintf(`(?i)(func|class|def|type|interface|method|const|let|var)\s+%s`, regexp.QuoteMeta(query))
		
		// Usamos a função GrepFilesLines que já existe no nosso pacote de filesystem.
		// Ela retorna resultados no formato "path:line:content".
		grepArgs := map[string]any{
			"pattern": symbolRegex,
			"glob":    "**/*.{go,ts,tsx,js,jsx,py,java,cs,rb,php}",
		}
		grepOutput := filesystem.GrepFilesLines(grepArgs)

		// A função retorna uma string única, com uma mensagem de erro ou os resultados.
		if strings.HasPrefix(grepOutput, "Nenhuma ocorrência") || strings.HasPrefix(grepOutput, "Padrão regex inválido") {
			return
		}

		lines := strings.Split(grepOutput, "\n")
		re := regexp.MustCompile(`^([^:]+):(\d+):(.*)`)
		typeRegex := regexp.MustCompile(`(?i)(func|class|def|type|interface|method|const|let|var)`)

		for _, line := range lines {
			matches := re.FindStringSubmatch(line)
			if len(matches) < 4 {
				continue
			}
			
			path := matches[1]
			lineNum, err := strconv.Atoi(matches[2])
			if err != nil {
				continue
			}
			content := matches[3]

			typeMatch := typeRegex.FindString(content)
			symbolType := "symbol"
			if typeMatch != "" {
				symbolType = strings.ToLower(typeMatch)
			}
			
			// Normaliza o tipo para o frontend
			switch symbolType {
				case "def":
					symbolType = "function" // Python
				case "const", "let", "var":
					symbolType = "variable"
			}


			resultsChan <- SearchResult{
				Type: symbolType,
				Name: query, // O nome do símbolo é a própria query
				Path: path,
				Line: &lineNum,
			}
		}
	}()

	// Espera as buscas terminarem e fecha o canal
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	// Agrega os resultados, removendo duplicatas
	uniqueResults := make(map[string]SearchResult)
	for res := range resultsChan {
		key := fmt.Sprintf("%s:%s", res.Path, res.Type)
		if res.Line != nil {
			key = fmt.Sprintf("%s:%d", res.Path, *res.Line)
		}

		// Prioriza símbolos sobre arquivos em caso de duplicata no mesmo caminho
		existing, found := uniqueResults[key]
		if !found || (existing.Type == "file" && res.Type != "file") {
			uniqueResults[key] = res
		}
	}

	// Converte o mapa para um slice
	finalResults := make([]SearchResult, 0, len(uniqueResults))
	for _, res := range uniqueResults {
		finalResults = append(finalResults, res)
	}

	// Ordena os resultados: arquivos primeiro, depois símbolos por caminho
	sort.Slice(finalResults, func(i, j int) bool {
		if finalResults[i].Type == "file" && finalResults[j].Type != "file" {
			return true
		}
		if finalResults[i].Type != "file" && finalResults[j].Type == "file" {
			return false
		}
		return finalResults[i].Path < finalResults[j].Path
	})

	return finalResults, nil
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
		ThinkingEnabled:    c.ThinkingEnabled,
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
		Metadata:       m.Metadata,
		CreatedAt:      m.CreatedAt.Format(time.RFC3339),
	}
}


// ---------------------------------------------------------------------------
// File Search for Mentions
// ---------------------------------------------------------------------------

// SearchFiles é a função exposta para o frontend via Wails.
// Ela espera um mapa com a chave "pattern" e retorna um slice de strings.
func (a *App) SearchFiles(params map[string]interface{}) ([]string, error) {
	pattern, ok := params["pattern"].(string)
	if !ok || pattern == "" {
		// Retorna um array vazio se o padrão for inválido, para não quebrar o frontend.
		return []string{}, nil
	}

	files, err := filesystem.SearchFilesByGlob(pattern)
	if err != nil {
		return nil, fmt.Errorf("falha ao buscar arquivos: %w", err)
	}

	return files, nil
}
