package providers

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// ReadFile lê o conteúdo de um arquivo.
func ReadFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	return string(data), err
}

// WriteFile escreve ou sobrescreve conteúdo em um arquivo.
func WriteFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
}

// EditFile faz um replace simples da primeira ocorrência de uma string.
// (Para um editor mais robusto, poderíamos usar diffs, mas replace atende bem LLMs).
func EditFile(path, oldText, newText string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	content := strings.Replace(string(data), oldText, newText, 1)
	return os.WriteFile(path, []byte(content), 0644)
}

// SearchFiles busca arquivos usando um padrão Glob (ex: *.go).
func SearchFiles(pattern string) ([]string, error) {
	return filepath.Glob(pattern)
}

// RunShell executa comandos no terminal nativo.
func RunShell(command string) (string, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		// Windows usa PowerShell por padrão
		cmd = exec.Command("powershell", "-NoProfile", "-Command", command)
	} else {
		// Linux/Mac usa bash
		cmd = exec.Command("bash", "-c", command)
	}

	out, err := cmd.CombinedOutput()
	// Retornamos out independente do erro, pois contém stdout e stderr combinados.
	return string(out), err
}

// GetSystemTools retorna as definições (schemas) destas ferramentas para o Provider.
func GetSystemTools() []Tool {
	return []Tool{
		{
			Name:        "read_file",
			Description: "Lê o conteúdo de um arquivo no disco.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"path": map[string]interface{}{"type": "string", "description": "Caminho do arquivo a ser lido"},
				},
				"required": []string{"path"},
			},
		},
		{
			Name:        "write_file",
			Description: "Cria ou sobrescreve um arquivo com conteúdo completo.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"path":    map[string]interface{}{"type": "string", "description": "Caminho do arquivo"},
					"content": map[string]interface{}{"type": "string", "description": "Conteúdo do arquivo"},
				},
				"required": []string{"path", "content"},
			},
		},
		{
			Name:        "edit_file",
			Description: "Edita um arquivo existente substituindo um texto por outro.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"path":     map[string]interface{}{"type": "string", "description": "Caminho do arquivo"},
					"old_text": map[string]interface{}{"type": "string", "description": "Texto exato a ser substituído"},
					"new_text": map[string]interface{}{"type": "string", "description": "Novo texto"},
				},
				"required": []string{"path", "old_text", "new_text"},
			},
		},
		{
			Name:        "search_files",
			Description: "Busca arquivos usando um padrão Glob (ex: *.go).",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"pattern": map[string]interface{}{"type": "string", "description": "Padrão de busca Glob"},
				},
				"required": []string{"pattern"},
			},
		},
		{
			Name:        "run_shell",
			Description: "Executa comandos no shell do sistema (PowerShell no Windows, Bash no Linux).",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"command": map[string]interface{}{
						"type":        "string",
						"description": "Comando para ser executado",
					},
				},
				"required": []string{"command"},
			},
		},
	}
}
