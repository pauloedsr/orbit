package shell

import (
	"github.com/pauloedsr/orbit/backend/providers"
	"github.com/pauloedsr/orbit/backend/tools"
)

// Register adiciona todas as ferramentas de shell ao registry.
func Register(r *tools.Registry) {
	r.Register(providers.Tool{
		Name:        "run_shell",
		Description: "Executa um comando no shell do sistema (PowerShell no Windows, Bash no Linux/Mac). Suporta batch via 'items': [{\"command\":\"...\"}].",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"command": map[string]any{
					"type":        "string",
					"description": "Comando a executar",
				},
			},
			"required": []string{"command"},
		},
	}, RunShell)

	r.Register(providers.Tool{
		Name:        "run_shell_script",
		Description: "Executa um script shell multi-linha. No Windows usa PowerShell (.ps1), no Linux/Mac usa Bash (.sh). Suporta batch via 'items': [{\"script\":\"...\"}].",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"script": map[string]any{
					"type":        "string",
					"description": "Conteúdo completo do script a executar",
				},
			},
			"required": []string{"script"},
		},
	}, RunShellScript)
}
