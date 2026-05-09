package providers

// HOW TO ADD A NEW PROVIDER
// =========================
// 1. Crie backend/providers/<name>.go com:
//    - Struct <Name>Provider implementando a interface Provider
//    - func NewXProvider(...) *XProvider
//    - func (p *XProvider) Name() string
//    - func (p *XProvider) Capabilities() []Capability
//    - func (p *XProvider) Stream(ctx, req, out) error
//
// 2. No mesmo arquivo, adicione um init() com self-registration:
//
//    func init() {
//        Register(Factory{
//            Name:        "myprovider",
//            Description: "...",
//            Detect: MatchAny(
//                MatchEndpoint("api.myprovider.com"),
//                MatchModelPrefix("myp-"),
//            ),
//            Build: func(cfg Config) Provider {
//                return NewMyProvider(cfg.APIKey)
//            },
//        })
//    }
//
// 3. Para metadados específicos (caching, thinking, signatures, etc.) que
//    precisam round-trip via DB, use Message.Metadata com chaves prefixadas
//    pelo nome do provider:
//      "myprovider.cache_id" → valor
//
// 4. Para devolver metadados ao core ao final do stream, emita no EventDone:
//      out <- Event{Type: EventDone, Metadata: map[string]any{
//          "myprovider.something": value,
//      }}
//    O core copia automaticamente para Message.Metadata sem inspecionar.
//
// 5. Nenhuma mudança é necessária em app.go, app_subagent.go ou provider.go.
//
// CHECKLIST DE CAPABILITIES
// =========================
// - CapTools     → suporta function calling
// - CapThinking  → emite passos de raciocínio internos
// - CapCaching   → suporta prompt caching (Anthropic, etc.)
// - CapVision    → aceita inputs de imagem
//
// NOTA SOBRE DETECTORES
// =====================
// Resolve() escolhe o primeiro Factory cujo Detect retorna true, EXCETO
// factories registrados via MatchAlways(), que são tratados como fallback
// de última instância (independente da ordem de registro).
//
// PROVIDERS EXISTENTES
// ====================
// - gemini.go     → MatchEndpoint("generativelanguage.googleapis.com") | MatchModelPrefix("gemini-")
// - openai.go     → MatchAlways() — fallback para qualquer endpoint compatível com OpenAI
//
// PROVIDERS FUTUROS (exemplos)
// ============================
// - anthropic.go  → MatchEndpoint("api.anthropic.com") | MatchModelPrefix("claude-")
// - cohere.go     → MatchEndpoint("api.cohere.ai") | MatchModelPrefix("command-")

import "strings"

// Config contém os parâmetros de runtime passados para o provider.
type Config struct {
	Endpoint string
	APIKey   string
	Model    string
	// Extra: espaço para opções específicas do provider sem mudar a interface.
	// Exemplos: Config.Extra["aws_region"] para Bedrock, "org_id" para OpenAI.
	Extra map[string]string
}

// Factory descreve como detectar e instanciar um provider.
type Factory struct {
	Name        string
	Description string
	// Detect retorna true quando este provider deve ser usado para o config dado.
	Detect func(endpoint, model string) bool
	// Build instancia o provider com o config de runtime.
	Build func(cfg Config) Provider
	// alwaysMatcher é marcador interno para o padrão MatchAlways.
	alwaysMatcher bool
}

var factories []Factory

// Register adiciona um factory específico ao registro global.
// Deve ser chamado de init() nos arquivos de cada provider.
func Register(f Factory) {
	factories = append(factories, f)
}

// RegisterFallback adiciona um factory como fallback de última instância.
// Use para o provider genérico (ex: OpenAI-compat) que aceita qualquer endpoint.
func RegisterFallback(f Factory) {
	f.alwaysMatcher = true
	factories = append(factories, f)
}

// Resolve seleciona e instancia o provider adequado para o config dado.
// Factories registrados via RegisterFallback são avaliados por último,
// independente da ordem de registro.
func Resolve(cfg Config) Provider {
	var fallback *Factory
	for i := range factories {
		f := &factories[i]
		if f.alwaysMatcher {
			if fallback == nil {
				fallback = f
			}
			continue
		}
		if f.Detect(cfg.Endpoint, cfg.Model) {
			return f.Build(cfg)
		}
	}
	if fallback != nil {
		return fallback.Build(cfg)
	}
	// Não deve acontecer se openai.go registrou o fallback.
	panic("providers: nenhum provider registrado para endpoint=" + cfg.Endpoint + " model=" + cfg.Model)
}

// MatchEndpoint retorna um Detect que dá match quando o endpoint contém substr.
func MatchEndpoint(substr string) func(string, string) bool {
	return func(endpoint, _ string) bool {
		return strings.Contains(endpoint, substr)
	}
}

// MatchModelPrefix retorna um Detect que dá match quando o model começa com prefix.
func MatchModelPrefix(prefix string) func(string, string) bool {
	return func(_, model string) bool {
		return strings.HasPrefix(model, prefix)
	}
}

// MatchAny combina múltiplos Detect em OR lógico.
func MatchAny(fs ...func(string, string) bool) func(string, string) bool {
	return func(endpoint, model string) bool {
		for _, f := range fs {
			if f(endpoint, model) {
				return true
			}
		}
		return false
	}
}

// MatchAlways é usado como Detect do provider fallback (ex: OpenAI-compat).
// Factories com esta função são sempre avaliados por último pelo Resolve.
func MatchAlways() func(string, string) bool {
	return func(string, string) bool { return true }
}

