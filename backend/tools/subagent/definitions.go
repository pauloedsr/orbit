package subagent

import "github.com/pauloedsr/orbit/backend/providers"

// Def é o schema da ferramenta de sub-agente.
var Def = providers.Tool{
	Name:        "run_subagent",
	Description: "Delega uma tarefa a um sub-agente que executa um ciclo completo de raciocínio + uso de ferramentas e retorna o resultado final. Ferramentas interativas (ask_user_*) não estão disponíveis em sub-agentes.",
	Parameters: map[string]any{
		"type": "object",
		"properties": map[string]any{
			"prompt": map[string]any{
				"type":        "string",
				"description": "Descrição completa da tarefa que o sub-agente deve executar",
			},
			"model": map[string]any{
				"type":        "string",
				"description": "Modelo LLM a usar (opcional — usa o modelo atual por padrão)",
			},
			"max_iterations": map[string]any{
				"type":        "integer",
				"description": "Número máximo de ciclos de raciocínio (padrão: 10)",
			},
		},
		"required": []string{"prompt"},
	},
}
