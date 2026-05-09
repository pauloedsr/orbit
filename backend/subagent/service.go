package subagent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/pauloedsr/orbit/backend/events"
	"github.com/pauloedsr/orbit/backend/providers"
	"github.com/pauloedsr/orbit/backend/tools"
)

type dbReader interface {
	GetSetting(key string) (string, error)
}

// Service executes sub-agent loops and emits progress events.
type Service struct {
	emitter events.Emitter
	reg     *tools.Registry
	db      dbReader
	appCtx  context.Context
}

func New(emitter events.Emitter, reg *tools.Registry, db dbReader) *Service {
	return &Service{emitter: emitter, reg: reg, db: db, appCtx: context.Background()}
}

func (s *Service) SetEmitter(emitter events.Emitter) { s.emitter = emitter }
func (s *Service) SetContext(ctx context.Context)    { s.appCtx = ctx }

// AsToolHandler returns a tools.Handler closure for registration in the Registry.
func (s *Service) AsToolHandler() tools.Handler {
	return func(args map[string]any) string {
		prompt, _ := args["prompt"].(string)
		if prompt == "" {
			return "Erro: campo 'prompt' é obrigatório."
		}

		model, _ := args["model"].(string)
		if model == "" {
			model, _ = s.db.GetSetting("llm_model")
		}

		maxIter := 10
		if n, ok := args["max_iterations"].(float64); ok && n > 0 {
			maxIter = int(n)
		}

		return s.Run(s.appCtx, prompt, model, maxIter)
	}
}

// Run executes the full reasoning+tool loop for a sub-agent.
func (s *Service) Run(ctx context.Context, prompt, model string, maxIterations int) string {
	endpoint, _ := s.db.GetSetting("llm_endpoint")
	if endpoint == "" {
		return "Erro: LLM endpoint não configurado."
	}
	apiKey, _ := s.db.GetSetting("llm_api_key")
	p := providers.Resolve(providers.Config{Endpoint: endpoint, APIKey: apiKey, Model: model})

	agentID := uuid.NewString()
	s.emitter.Emit("subagent:start", map[string]any{
		"id":     agentID,
		"prompt": prompt,
		"model":  model,
	})

	emitIteration := func(iter int, phase string, toolNames []string) {
		s.emitter.Emit("subagent:iteration", map[string]any{
			"agentId":   agentID,
			"iteration": iter,
			"phase":     phase,
			"tools":     toolNames,
		})
	}

	emitDone := func(success bool) {
		s.emitter.Emit("subagent:done", map[string]any{
			"agentId": agentID,
			"success": success,
		})
	}

	msgs := []providers.Message{{Role: "user", Content: prompt}}

	for iter := 0; iter < maxIterations; iter++ {
		emitIteration(iter+1, "thinking", []string{})

		req := providers.Request{
			Model:    model,
			Messages: msgs,
			Tools:    s.subAgentTools(),
			Stream:   true,
		}

		eventCh := make(chan providers.Event, 64)
		errCh := make(chan error, 1)
		go func() { errCh <- p.Stream(ctx, req, eventCh) }()

		var buf strings.Builder
		activeToolCalls := make(map[int]*providers.ToolCall)
		var pendingMetadata map[string]any

		for evt := range eventCh {
			switch evt.Type {
			case providers.EventTextDelta:
				buf.WriteString(evt.Text)
			case providers.EventToolCallStart:
				if activeToolCalls[evt.ToolCall.Index] == nil {
					activeToolCalls[evt.ToolCall.Index] = &providers.ToolCall{
						ID:   evt.ToolCall.ID,
						Name: evt.ToolCall.Name,
					}
				}
			case providers.EventToolCallDelta:
				if activeToolCalls[evt.ToolCall.Index] == nil {
					activeToolCalls[evt.ToolCall.Index] = &providers.ToolCall{}
				}
				activeToolCalls[evt.ToolCall.Index].Arguments += evt.ToolCall.ArgDelta
			case providers.EventDone:
				pendingMetadata = evt.Metadata
			}
		}

		if err := <-errCh; err != nil {
			emitDone(false)
			return fmt.Sprintf("Erro no sub-agente (iteração %d): %v", iter+1, err)
		}

		if len(activeToolCalls) == 0 {
			emitDone(true)
			return buf.String()
		}

		tcs := make([]providers.ToolCall, 0, len(activeToolCalls))
		toolNames := make([]string, 0, len(activeToolCalls))
		for i := 0; i < len(activeToolCalls); i++ {
			if tc, ok := activeToolCalls[i]; ok {
				tcs = append(tcs, *tc)
				toolNames = append(toolNames, tc.Name)
			}
		}

		emitIteration(iter+1, "tool-calling", toolNames)

		msgs = append(msgs, providers.Message{
			Role:      "assistant",
			Content:   buf.String(),
			ToolCalls: tcs,
			Metadata:  pendingMetadata,
		})

		for _, tc := range tcs {
			var tcArgs map[string]any
			if tc.Arguments != "" {
				json.Unmarshal([]byte(tc.Arguments), &tcArgs) //nolint:errcheck
			}
			result := s.subAgentDispatch(tc.Name, tcArgs)
			msgs = append(msgs, providers.Message{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
			})
		}

		emitIteration(iter+1, "done", toolNames)
	}

	emitDone(false)
	return fmt.Sprintf("Sub-agente atingiu o limite de %d iterações sem concluir.", maxIterations)
}

func (s *Service) subAgentTools() []providers.Tool {
	excluded := map[string]bool{
		"ask_user_text":   true,
		"ask_user_choice": true,
		"run_subagent":    true,
	}
	all := s.reg.Definitions()
	result := make([]providers.Tool, 0, len(all))
	for _, t := range all {
		if !excluded[t.Name] {
			result = append(result, t)
		}
	}
	return result
}

func (s *Service) subAgentDispatch(name string, args map[string]any) string {
	switch name {
	case "ask_user_text", "ask_user_choice":
		return "Erro: ferramentas interativas não estão disponíveis em sub-agentes."
	case "run_subagent":
		return "Erro: sub-agentes não podem chamar run_subagent recursivamente."
	}
	return s.reg.Dispatch(name, args)
}
