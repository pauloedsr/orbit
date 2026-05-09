package shell

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	defaultTimeout = 30
	maxTimeout     = 300
)

// RunShell executa um comando no shell nativo.
func RunShell(args map[string]any) string {
	command, _ := args["command"].(string)
	if strings.TrimSpace(command) == "" {
		return "campo 'command' é obrigatório"
	}

	timeout := intArg(args, "timeout", defaultTimeout)
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	if timeout > maxTimeout {
		timeout = maxTimeout
	}

	shellName, shellArgs := resolveShell(strArg(args, "shell"))
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, shellName, append(shellArgs, command)...)
	if workdir := strArg(args, "workdir"); workdir != "" {
		cmd.Dir = workdir
	}
	if stdin := strArg(args, "stdin"); stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	if envMap, ok := args["env"].(map[string]any); ok && len(envMap) > 0 {
		cmd.Env = cmd.Environ()
		for k, v := range envMap {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%v", k, v))
		}
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Sprintf("timeout: comando excedeu %ds", timeout)
	}

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return fmt.Sprintf("erro ao executar comando: %v", err)
		}
	}

	return formatOutput(shellName, command, stdout.String(), stderr.String(), exitCode)
}

// RunShellScript executa um script shell a partir de uma string multi-linha.
// No Windows usa PowerShell (.ps1), no Linux/Mac usa Bash (.sh).
func RunShellScript(args map[string]any) string {
	script, _ := args["script"].(string)
	if strings.TrimSpace(script) == "" {
		return "campo 'script' é obrigatório"
	}

	shellName, _ := resolveShell(strArg(args, "shell"))
	ext := ".sh"
	if strings.Contains(shellName, "powershell") || strings.Contains(shellName, "pwsh") {
		ext = ".ps1"
	}

	tmp, err := os.CreateTemp("", "orbit-script-*"+ext)
	if err != nil {
		return fmt.Sprintf("Erro ao criar arquivo temporário: %v", err)
	}
	defer os.Remove(tmp.Name())

	if _, err := tmp.WriteString(script); err != nil {
		tmp.Close()
		return fmt.Sprintf("Erro ao escrever script: %v", err)
	}
	tmp.Close()

	if ext == ".sh" {
		_ = os.Chmod(tmp.Name(), 0700)
	}

	scriptPath, _ := filepath.Abs(tmp.Name())
	return RunShell(map[string]any{
		"command": fmt.Sprintf("%s", scriptPath),
		"shell":   strArg(args, "shell"),
		"workdir": strArg(args, "workdir"),
		"timeout": intArg(args, "timeout", defaultTimeout),
		"env":     args["env"],
	})
}

func resolveShell(preferred string) (string, []string) {
	s := strings.ToLower(strings.TrimSpace(preferred))
	switch s {
	case "bash":
		return "bash", []string{"-c"}
	case "sh":
		return "sh", []string{"-c"}
	case "powershell":
		return "powershell", []string{"-NoProfile", "-NonInteractive", "-Command"}
	case "pwsh":
		return "pwsh", []string{"-NoProfile", "-NonInteractive", "-Command"}
	}

	if runtime.GOOS == "windows" {
		if _, err := exec.LookPath("pwsh"); err == nil {
			return "pwsh", []string{"-NoProfile", "-NonInteractive", "-Command"}
		}
		return "powershell", []string{"-NoProfile", "-NonInteractive", "-Command"}
	}
	if _, err := exec.LookPath("bash"); err == nil {
		return "bash", []string{"-c"}
	}
	return "sh", []string{"-c"}
}

func formatOutput(shell, command, stdout, stderr string, exitCode int) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "shell:     %s\n", shell)
	fmt.Fprintf(&sb, "command:   %s\n", command)
	fmt.Fprintf(&sb, "exit_code: %d\n", exitCode)
	sb.WriteString("--- stdout ---\n")
	if stdout == "" {
		sb.WriteString("(vazio)\n")
	} else {
		sb.WriteString(stdout)
		if !strings.HasSuffix(stdout, "\n") {
			sb.WriteString("\n")
		}
	}
	sb.WriteString("--- stderr ---\n")
	if stderr == "" {
		sb.WriteString("(vazio)\n")
	} else {
		sb.WriteString(stderr)
		if !strings.HasSuffix(stderr, "\n") {
			sb.WriteString("\n")
		}
	}
	return sb.String()
}

// ScriptPreview returns the first 3 lines of a script for display purposes.
func ScriptPreview(script string) string {
	lines := strings.SplitN(strings.TrimSpace(script), "\n", 4)
	if len(lines) > 3 {
		lines = append(lines[:3], "...")
	}
	return strings.Join(lines, "\n")
}

func strArg(args map[string]any, key string) string {
	v, _ := args[key].(string)
	return v
}

func intArg(args map[string]any, key string, def int) int {
	v, ok := args[key]
	if !ok {
		return def
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return def
}
