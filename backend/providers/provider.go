package providers

import "context"

// EventType identifica o tipo de evento no stream.
type EventType int

const (
	EventTextDelta EventType = iota
	EventToolCallStart
	EventToolCallDelta
	EventToolCallEnd
	EventError
	EventDone
)

// Event é a unidade atômica de streaming — o gateway e a UI consomem isso.
type Event struct {
	Type      EventType
	Text      string // para TextDelta
	ToolCall  *ToolCallEvent
	Error     error
}

type ToolCallEvent struct {
	Index    int
	ID       string
	Name     string
	ArgDelta string
}

// Message é o formato intermediário próprio do Orbit.
// Superset de OpenAI e Anthropic — adapters convertem de/para.
type Message struct {
	Role       string      `json:"role"`
	Content    string      `json:"content"`
	ToolCalls  []ToolCall  `json:"tool_calls,omitempty"`
	ToolCallID string      `json:"tool_call_id,omitempty"`
}

type ToolCall struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Arguments string `json:"arguments"`
}

type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"` // JSON Schema
}

// Request é o payload unificado de chat completion.
type Request struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Tools       []Tool    `json:"tools,omitempty"`
	System      string    `json:"system,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Temperature float64   `json:"temperature,omitempty"`
	Stream      bool      `json:"stream"`
}

// Provider é a interface que cada adapter implementa.
type Provider interface {
	// Name retorna o identificador do provider ("anthropic", "openai", "ollama").
	Name() string

	// Stream envia a request e emite eventos no canal.
	// O caller deve consumir o canal até ele fechar.
	// Cancelamento via ctx.Done().
	Stream(ctx context.Context, req Request, out chan<- Event) error

	// SupportsTools indica se o provider/modelo suporta tool calling.
	SupportsTools() bool
}

// Registry mantém os providers disponíveis.
type Registry struct {
	providers map[string]Provider
}

func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

func (r *Registry) Register(p Provider) {
	r.providers[p.Name()] = p
}

func (r *Registry) Get(name string) (Provider, bool) {
	p, ok := r.providers[name]
	return p, ok
}

func (r *Registry) List() []string {
	names := make([]string, 0, len(r.providers))
	for k := range r.providers {
		names = append(names, k)
	}
	return names
}
