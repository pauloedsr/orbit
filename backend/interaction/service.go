package interaction

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pauloedsr/orbit/backend/events"
	"github.com/pauloedsr/orbit/backend/tools/shell"
)

var confirmableTools = map[string]bool{
	"write_file":       true,
	"edit_file":        true,
	"edit_file_lines":  true,
	"append_file":      true,
	"move_file":        true,
	"run_shell":        true,
	"run_shell_script": true,
}

// Service manages blocking frontend interactions (ask / confirm).
type Service struct {
	emitter events.Emitter
	appCtx  context.Context

	pending   map[string]chan string
	pendingMu sync.Mutex

	allowlist   map[string]struct{}
	allowlistMu sync.RWMutex
}

func New(emitter events.Emitter) *Service {
	return &Service{
		emitter:   emitter,
		pending:   make(map[string]chan string),
		allowlist: make(map[string]struct{}),
	}
}

func (s *Service) SetEmitter(emitter events.Emitter) { s.emitter = emitter }
func (s *Service) SetContext(ctx context.Context)    { s.appCtx = ctx }

// SubmitResponse is called by App.SubmitToolResponse (Wails binding).
func (s *Service) SubmitResponse(requestID, response string) {
	s.pendingMu.Lock()
	ch, ok := s.pending[requestID]
	s.pendingMu.Unlock()
	if ok {
		select {
		case ch <- response:
		default:
		}
	}
}

// HandleAskText is the handler for the ask_user_text tool.
func (s *Service) HandleAskText(args map[string]any) string {
	question, _ := args["question"].(string)
	return s.requestInteraction("tool:ask", map[string]any{
		"type":     "text",
		"question": question,
	})
}

// HandleAskChoice is the handler for the ask_user_choice tool.
func (s *Service) HandleAskChoice(args map[string]any) string {
	question, _ := args["question"].(string)
	rawChoices, _ := args["choices"].([]any)
	choices := make([]string, 0, len(rawChoices))
	for _, c := range rawChoices {
		if str, ok := c.(string); ok {
			choices = append(choices, str)
		}
	}
	return s.requestInteraction("tool:ask", map[string]any{
		"type":     "choice",
		"question": question,
		"choices":  choices,
	})
}

// CheckConfirm blocks until the user allows/denies the tool call.
// Returns "" if permitted, or a denial message.
func (s *Service) CheckConfirm(name string, args map[string]any) string {
	if !confirmableTools[name] {
		return ""
	}

	fp := s.fingerprint(name, args)
	s.allowlistMu.RLock()
	_, allowed := s.allowlist[fp]
	s.allowlistMu.RUnlock()
	if allowed {
		return ""
	}

	details := toolDetails(name, args)
	decision := s.requestInteraction("tool:confirm", map[string]any{
		"toolName": name,
		"details":  details,
	})

	switch decision {
	case "deny":
		return fmt.Sprintf("Ação negada pelo usuário: %s", name)
	case "always":
		s.allowlistMu.Lock()
		s.allowlist[fp] = struct{}{}
		s.allowlistMu.Unlock()
	}
	return ""
}

func (s *Service) requestInteraction(event string, payload map[string]any) string {
	id := uuid.NewString()
	ch := make(chan string, 1)

	s.pendingMu.Lock()
	s.pending[id] = ch
	s.pendingMu.Unlock()

	defer func() {
		s.pendingMu.Lock()
		delete(s.pending, id)
		s.pendingMu.Unlock()
	}()

	payload["id"] = id
	s.emitter.Emit(event, payload)

	select {
	case resp := <-ch:
		return resp
	case <-time.After(5 * time.Minute):
		return "Timeout: sem resposta do usuário."
	case <-s.appCtx.Done():
		return "Cancelado."
	}
}

func (s *Service) fingerprint(name string, args map[string]any) string {
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
