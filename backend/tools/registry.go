package tools

import (
	"fmt"
	"strings"

	"github.com/pauloedsr/orbit/backend/providers"
)

// Handler executa uma ferramenta dado um mapa de argumentos JSON.
type Handler func(args map[string]any) string

// Registry mantém ferramentas disponíveis e despacha chamadas.
type Registry struct {
	handlers map[string]Handler
	defs     []providers.Tool
}

// New cria um Registry vazio.
func New() *Registry {
	return &Registry{handlers: make(map[string]Handler)}
}

// Register adiciona uma ferramenta ao registry com seu schema e handler.
func (r *Registry) Register(def providers.Tool, h Handler) {
	r.handlers[def.Name] = h
	r.defs = append(r.defs, def)
}

// Dispatch executa a ferramenta pelo nome.
// Suporte a batch: se args["items"] for array, cada item é executado separadamente
// e os resultados são concatenados separados por "---".
func (r *Registry) Dispatch(name string, args map[string]any) string {
	h, ok := r.handlers[name]
	if !ok {
		return fmt.Sprintf("Ferramenta desconhecida: %s", name)
	}
	if items, ok := args["items"].([]any); ok {
		parts := make([]string, 0, len(items))
		for i, item := range items {
			itemArgs, _ := item.(map[string]any)
			parts = append(parts, fmt.Sprintf("[item %d]\n%s", i+1, h(itemArgs)))
		}
		return strings.Join(parts, "\n---\n")
	}
	return h(args)
}

// Definitions retorna todos os schemas das ferramentas registradas.
func (r *Registry) Definitions() []providers.Tool {
	return r.defs
}
