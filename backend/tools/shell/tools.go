package shell

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// RunShell executa um comando no shell nativo.
func RunShell(args map[string]any) string {
	command, _ := args["command"].(string)

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", command)
	} else {
		cmd = exec.Command("bash", "-c", command)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Sprintf("Erro: %v\nSaída:\n%s", err, string(out))
	}
	return string(out)
}

// RunShellScript executa um script shell a partir de uma string multi-linha.
// No Windows usa PowerShell (.ps1), no Linux/Mac usa Bash (.sh).
func RunShellScript(args map[string]any) string {
	script, _ := args["script"].(string)

	var (
		ext  string
		argv []string
	)
	if runtime.GOOS == "windows" {
		ext = "*.ps1"
		argv = []string{"powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"}
	} else {
		ext = "*.sh"
		argv = []string{"bash"}
	}

	tmp, err := os.CreateTemp("", ext)
	if err != nil {
		return fmt.Sprintf("Erro ao criar arquivo temporário: %v", err)
	}
	defer os.Remove(tmp.Name())

	if _, err := tmp.WriteString(script); err != nil {
		tmp.Close()
		return fmt.Sprintf("Erro ao escrever script: %v", err)
	}
	tmp.Close()

	scriptPath := tmp.Name()
	// Converte para path absoluto com separador correto
	scriptPath, _ = filepath.Abs(scriptPath)

	argv = append(argv, scriptPath)
	cmd := exec.Command(argv[0], argv[1:]...)

	// Inclui as 3 primeiras linhas do script no log para auditoria
	preview := scriptPreview(script)
	_ = preview // usado futuramente pelo interceptor de confirm

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Sprintf("Erro: %v\nSaída:\n%s", err, string(out))
	}
	return string(out)
}

// ScriptPreview retorna as primeiras 3 linhas de um script (para auditoria/confirm).
func ScriptPreview(script string) string {
	lines := strings.SplitN(script, "\n", 4)
	if len(lines) > 3 {
		lines = lines[:3]
	}
	return strings.Join(lines, "\n")
}

func scriptPreview(script string) string {
	return ScriptPreview(script)
}
