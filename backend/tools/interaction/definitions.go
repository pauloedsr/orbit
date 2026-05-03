package interaction

import "github.com/pauloedsr/orbit/backend/providers"

// AskTextDef é o schema da ferramenta de pergunta livre.
var AskTextDef = providers.Tool{
	Name:        "ask_user_text",
	Description: "Faz uma pergunta ao usuário e aguarda sua resposta em texto livre. Use quando precisar de informação não disponível no contexto.",
	Parameters: map[string]any{
		"type": "object",
		"properties": map[string]any{
			"question": map[string]any{
				"type":        "string",
				"description": "A pergunta a ser feita ao usuário",
			},
		},
		"required": []string{"question"},
	},
}

// AskChoiceDef é o schema da ferramenta de múltipla escolha.
var AskChoiceDef = providers.Tool{
	Name:        "ask_user_choice",
	Description: "Apresenta opções ao usuário e aguarda sua escolha. O usuário pode selecionar uma opção ou digitar uma resposta alternativa.",
	Parameters: map[string]any{
		"type": "object",
		"properties": map[string]any{
			"question": map[string]any{
				"type":        "string",
				"description": "A pergunta ou contexto da escolha",
			},
			"choices": map[string]any{
				"type":        "array",
				"items":       map[string]any{"type": "string"},
				"description": "Lista de opções para o usuário escolher",
			},
		},
		"required": []string{"question", "choices"},
	},
}
