package main

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/pauloedsr/orbit/backend/tools/shell"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------------------------------------------------------------------------
// Ferramentas que exigem confirmação antes de executar.
// ---------------------------------------------------------------------------

var confirmableTools = map[string]bool{
	"write_file":       true,
	"edit_file":        true,
	"edit_file_lines":  true,
	"append_file":      true,
	"move_file":        true,
	"run_shell":        true,
	"run_shell_script": true,
}

// SubmitToolResponse é exposto ao frontend via Wails bindings.
// O frontend chama este método quando o usuário responde a um ask ou confirm.
func (a *App) SubmitToolResponse(requestID, response string) {
	a.pendingMu.Lock()
	ch, ok := a.pending[requestID]
	a.pendingMu.Unlock()
	if ok {
		select {
		case ch <- response:
		default:
		}
	}
}

// ---------------------------------------------------------------------------
// Handlers de Ask (registrados no registry via closures em NewApp)
// ---------------------------------------------------------------------------

func (a *App) handleAskText(args map[string]any) string {
	question, _ := args["question"].(string)
	return a.requestInteraction("tool:ask", map[string]any{
		"type":     "text",
		"question": question,
	})
}

func (a *App) handleAskChoice(args map[string]any) string {
	question, _ := args["question"].(string)
	rawChoices, _ := args["choices"].([]any)
	choices := make([]string, 0, len(rawChoices))
	for _, c := range rawChoices {
		if s, ok := c.(string); ok {
			choices = append(choices, s)
		}
	}
	return a.requestInteraction("tool:ask", map[string]any{
		"type":     "choice",
		"question": question,
		"choices":  choices,
	})
}

// ---------------------------------------------------------------------------
// Interceptor de Confirmação
// ---------------------------------------------------------------------------

// checkConfirm verifica se a tool precisa de confirmação e bloqueia até o usuário decidir.
// Retorna "" se permitido, ou mensagem de negação se negado.
func (a *App) checkConfirm(name string, args map[string]any) string {
	if !confirmableTools[name] {
		return ""
	}

	fp := a.fingerprint(name, args)
	a.allowlistMu.RLock()
	_, allowed := a.allowlist[fp]
	a.allowlistMu.RUnlock()
	if allowed {
		return ""
	}

	details := toolDetails(name, args)
	decision := a.requestInteraction("tool:confirm", map[string]any{
		"toolName": name,
		"details":  details,
	})

	switch decision {
	case "deny":
		return fmt.Sprintf("Ação negada pelo usuário: %s", name)
	case "always":
		a.allowlistMu.Lock()
		a.allowlist[fp] = struct{}{}
		a.allowlistMu.Unlock()
	}
	return "" // "allow" ou "always" → prossegue
}

// fingerprint gera uma chave única para a combinação tool+args para o allowlist.
func (a *App) fingerprint(name string, args map[string]any) string {
	switch name {
	case "run_shell":
		cmd, _ := args["command"].(string)
		return "run_shell:" + cmd
	case "run_shell_script":
		script, _ := args["script"].(string)
		return "run_shell_script:" + shell.ScriptPreview(script)
	default:
		path, _ := args["path"].(string)
		if from, _ := args["from"].(string); from != "" {
			path = from
		}
		return name + ":" + path
	}
}

// toolDetails formata os detalhes da tool para exibição no diálogo de confirmação.
func toolDetails(name string, args map[string]any) string {
	switch name {
	case "run_shell":
		cmd, _ := args["command"].(string)
		return fmt.Sprintf("Comando: %s", cmd)
	case "run_shell_script":
		script, _ := args["script"].(string)
		return fmt.Sprintf("Script (primeiras linhas):\n%s", shell.ScriptPreview(script))
	case "write_file":
		path, _ := args["path"].(string)
		return fmt.Sprintf("Arquivo: %s", path)
	case "edit_file":
		path, _ := args["path"].(string)
		return fmt.Sprintf("Arquivo: %s", path)
	case "edit_file_lines":
		path, _ := args["path"].(string)
		return fmt.Sprintf("Arquivo: %s", path)
	case "append_file":
		path, _ := args["path"].(string)
		return fmt.Sprintf("Arquivo: %s", path)
	case "move_file":
		from, _ := args["from"].(string)
		to, _ := args["to"].(string)
		return fmt.Sprintf("%s → %s", from, to)
	default:
		return name
	}
}

// ---------------------------------------------------------------------------
// Bloqueio genérico para interações com o frontend
// ---------------------------------------------------------------------------

// requestInteraction emite um evento ao frontend, bloqueia em um canal e
// retorna a resposta enviada via SubmitToolResponse. Timeout de 5 minutos.
func (a *App) requestInteraction(event string, payload map[string]any) string {
	id := uuid.NewString()
	ch := make(chan string, 1)

	a.pendingMu.Lock()
	a.pending[id] = ch
	a.pendingMu.Unlock()

	defer func() {
		a.pendingMu.Lock()
		delete(a.pending, id)
		a.pendingMu.Unlock()
	}()

	payload["id"] = id
	runtime.EventsEmit(a.ctx, event, payload)

	select {
	case resp := <-ch:
		return resp
	case <-time.After(5 * time.Minute):
		return "Timeout: sem resposta do usuário."
	case <-a.ctx.Done():
		return "Cancelado."
	}
}
