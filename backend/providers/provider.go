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
	Type     EventType
	Text     string // para TextDelta
	ToolCall *ToolCallEvent
	Error    error
	// Metadata: dados que o provider quer persistir junto à próxima mensagem
	// assistant. Populado tipicamente no EventDone. O core copia direto para
	// Message.Metadata sem inspecionar — chaves seguem a convenção "<provider>.<conceito>".
	Metadata map[string]any
}

type ToolCallEvent struct {
	Index    int
	ID       string
	Name     string
	ArgDelta string
}

// Capability declara uma capacidade suportada pelo provider.
type Capability string

const (
	CapTools    Capability = "tools"    // suporta function calling
	CapThinking Capability = "thinking" // emite passos de raciocínio internos
	CapCaching  Capability = "caching"  // suporta prompt caching
	CapVision   Capability = "vision"   // aceita inputs de imagem
)

// HasCapability verifica se um provider possui a capability informada.
func HasCapability(p Provider, c Capability) bool {
	for _, cap := range p.Capabilities() {
		if cap == c {
			return true
		}
	}
	return false
}

// Message é o formato intermediário próprio do Orbit.
// Superset de OpenAI e Anthropic — adapters convertem de/para.
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	// Metadata: bag opaco de dados específicos do provider que precisam
	// round-trip via DB. Convenção de chaves: "<provider>.<conceito>".
	// Exemplos:
	//   "gemini.thought_parts"     → []map[string]any com thoughtSignature
	//   "anthropic.cache_control"  → {"type": "ephemeral"}
	// O core nunca lê estas chaves. Cada provider lê apenas as suas.
	Metadata map[string]any `json:"metadata,omitempty"`
}

type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  any `json:"parameters"` // JSON Schema
}

// Request é o payload unificado de chat completion.
type Request struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Tools       []Tool    `json:"tools,omitempty"`
	System      string    `json:"system,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Temperature float64   `json:"temperature,omitempty"`
	TopP        float64   `json:"top_p,omitempty"`
	Stream      bool      `json:"stream"`
}

// Provider é a interface que cada adapter implementa.
type Provider interface {
	// Name retorna o identificador do provider ("gemini", "openai-compat", ...).
	Name() string

	// Stream envia a request e emite eventos no canal.
	// O caller deve consumir o canal até ele fechar.
	// Cancelamento via ctx.Done().
	Stream(ctx context.Context, req Request, out chan<- Event) error

	// Capabilities lista as capacidades suportadas por este provider.
	Capabilities() []Capability
}

// SupportsTools é um helper de retro-compatibilidade.
func SupportsTools(p Provider) bool { return HasCapability(p, CapTools) }

// Registry mantém os providers disponíveis por nome (uso interno/legado).
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
