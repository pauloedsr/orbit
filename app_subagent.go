package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/pauloedsr/orbit/backend/providers"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// handleSubAgent é o handler registrado no registry para a tool run_subagent.
func (a *App) handleSubAgent(args map[string]any) string {
	prompt, _ := args["prompt"].(string)
	if prompt == "" {
		return "Erro: campo 'prompt' é obrigatório."
	}

	model, _ := args["model"].(string)
	if model == "" {
		model, _ = a.db.GetSetting("llm_model")
	}

	maxIter := 10
	if n, ok := args["max_iterations"].(float64); ok && n > 0 {
		maxIter = int(n)
	}

	return a.runSubAgent(prompt, model, maxIter)
}

// runSubAgent executa um loop completo de raciocínio + ferramentas, emitindo
// eventos ao frontend para exibição em tempo real no painel de sub-agentes.
func (a *App) runSubAgent(prompt, model string, maxIterations int) string {
	endpoint, _ := a.db.GetSetting("llm_endpoint")
	if endpoint == "" {
		return "Erro: LLM endpoint não configurado."
	}
	apiKey, _ := a.db.GetSetting("llm_api_key")
	p := providers.NewOpenAIProvider("openai-compat", endpoint, apiKey)

	agentID := uuid.NewString()
	runtime.EventsEmit(a.ctx, "subagent:start", map[string]any{
		"id":     agentID,
		"prompt": prompt,
		"model":  model,
	})

	emitIteration := func(iter int, phase string, tools []string) {
		runtime.EventsEmit(a.ctx, "subagent:iteration", map[string]any{
			"agentId":   agentID,
			"iteration": iter,
			"phase":     phase,
			"tools":     tools,
		})
	}

	emitDone := func(success bool) {
		runtime.EventsEmit(a.ctx, "subagent:done", map[string]any{
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
			Tools:    a.subAgentTools(),
			Stream:   true,
		}

		eventCh := make(chan providers.Event, 64)
		errCh := make(chan error, 1)
		go func() { errCh <- p.Stream(a.ctx, req, eventCh) }()

		var buf strings.Builder
		activeToolCalls := make(map[int]*providers.ToolCall)

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
			}
		}

		if err := <-errCh; err != nil {
			emitDone(false)
			return fmt.Sprintf("Erro no sub-agente (iteração %d): %v", iter+1, err)
		}

		// Sem tool calls — sub-agente finalizou
		if len(activeToolCalls) == 0 {
			emitDone(true)
			return buf.String()
		}

		// Coleta nomes das tools na ordem de índice
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
		})

		// Executa as ferramentas sem interceptor de confirmação
		for _, tc := range tcs {
			var tcArgs map[string]any
			if tc.Arguments != "" {
				json.Unmarshal([]byte(tc.Arguments), &tcArgs)
			}
			result := a.subAgentDispatch(tc.Name, tcArgs)
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

// subAgentTools retorna os schemas de tools disponíveis para sub-agentes,
// excluindo ferramentas interativas que exigem resposta do usuário.
func (a *App) subAgentTools() []providers.Tool {
	excluded := map[string]bool{
		"ask_user_text":   true,
		"ask_user_choice": true,
		"run_subagent":    true, // evita recursão infinita
	}
	all := a.tools.Definitions()
	result := make([]providers.Tool, 0, len(all))
	for _, t := range all {
		if !excluded[t.Name] {
			result = append(result, t)
		}
	}
	return result
}

// subAgentDispatch executa uma tool para o sub-agente sem interceptor de confirmação
// e retorna erro claro para ferramentas interativas se chamadas diretamente.
func (a *App) subAgentDispatch(name string, args map[string]any) string {
	switch name {
	case "ask_user_text", "ask_user_choice":
		return "Erro: ferramentas interativas não estão disponíveis em sub-agentes."
	case "run_subagent":
		return "Erro: sub-agentes não podem chamar run_subagent recursivamente."
	}
	return a.tools.Dispatch(name, args)
}
