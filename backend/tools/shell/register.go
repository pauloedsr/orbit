package shell

import (
	"github.com/pauloedsr/orbit/backend/providers"
	"github.com/pauloedsr/orbit/backend/tools"
)

// Register adiciona todas as ferramentas de shell ao registry.
func Register(r *tools.Registry) {
	r.Register(providers.Tool{
		Name:        "run_shell",
		Description: "Executa um comando no shell do sistema (PowerShell no Windows, Bash no Linux/Mac). Suporta timeout, workdir, stdin, env e shell explícito. Retorna stdout, stderr e exit_code em formato estruturado. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"command": map[string]any{
					"type":        "string",
					"description": "Comando a executar",
				},
				"shell": map[string]any{
					"type":        "string",
					"description": "Shell opcional: bash, sh, powershell, pwsh",
				},
				"workdir": map[string]any{
					"type":        "string",
					"description": "Diretório de trabalho opcional",
				},
				"timeout": map[string]any{
					"type":        "integer",
					"description": "Timeout em segundos (padrão: 30, máximo: 300)",
				},
				"stdin": map[string]any{
					"type":        "string",
					"description": "Conteúdo opcional a enviar para stdin",
				},
				"env": map[string]any{
					"type":        "object",
					"description": "Variáveis de ambiente extras",
				},
			},
			"required": []string{"command"},
		},
	}, RunShell)

	r.Register(providers.Tool{
		Name:        "run_shell_script",
		Description: "Executa um script shell multi-linha. No Windows usa PowerShell (.ps1), no Linux/Mac usa Bash (.sh). Suporta timeout, workdir, env e shell explícito. Retorna stdout, stderr e exit_code em formato estruturado. Suporta batch via 'items'.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"script": map[string]any{
					"type":        "string",
					"description": "Conteúdo completo do script a executar",
				},
				"shell": map[string]any{
					"type":        "string",
					"description": "Shell opcional: bash, sh, powershell, pwsh",
				},
				"workdir": map[string]any{
					"type":        "string",
					"description": "Diretório de trabalho opcional",
				},
				"timeout": map[string]any{
					"type":        "integer",
					"description": "Timeout em segundos (padrão: 30, máximo: 300)",
				},
				"env": map[string]any{
					"type":        "object",
					"description": "Variáveis de ambiente extras",
				},
			},
			"required": []string{"script"},
		},
	}, RunShellScript)
}
