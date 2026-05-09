package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/pauloedsr/orbit/backend/db"
	"github.com/pauloedsr/orbit/backend/events"
	"github.com/pauloedsr/orbit/backend/interaction"
	"github.com/pauloedsr/orbit/backend/providers"
	"github.com/pauloedsr/orbit/backend/tools"
)

// askModeTools — only read-only filesystem tools.
var askModeTools = map[string]bool{
	"read_file": true, "tail_file": true, "search_files": true,
	"grep_files": true, "grep_files_lines": true, "diff_file": true,
}

// planPlanningTools — read + shell queries + write for creating the plan file + interaction.
var planPlanningTools = map[string]bool{
	"read_file": true, "tail_file": true, "search_files": true,
	"grep_files": true, "grep_files_lines": true, "diff_file": true,
	"write_file": true, "run_shell": true, "run_shell_script": true,
	"ask_user_text": true, "ask_user_choice": true,
}

const planSystemPrompt = `Você é Orbit, operando em MODO PLAN.

FASE DE PLANEJAMENTO:
- Utilize as ferramentas de leitura e shell (somente leitura/consulta) para compreender completamente o contexto do que o usuário precisa.
- Crie ou atualize o arquivo de plano em .orbit/plans/<nome-descritivo>.md com seções claras: Objetivo, Contexto, Tarefas, Riscos.
- Apresente um resumo executivo (ou mais detalhes quando necessário) ao usuário.
- Solicite que o usuário clique em "Iniciar Implementação" para confirmar o início da execução.
- NÃO faça modificações destrutivas ou alterações de código antes da confirmação.

FASE DE IMPLEMENTAÇÃO (após confirmação do usuário):
- Siga o plano criado fielmente.
- Use todas as ferramentas disponíveis, incluindo subagentes para delegar tarefas.
- Atualize o arquivo de plano marcando cada etapa concluída.`

// Service manages the chat streaming loop and per-conversation cancellation.
type Service struct {
	emitter events.Emitter
	db      *db.Database
	reg     *tools.Registry
	ia      *interaction.Service

	streamCancels   map[string]context.CancelFunc
	streamCancelsMu sync.Mutex
}

func New(emitter events.Emitter, database *db.Database, reg *tools.Registry, ia *interaction.Service) *Service {
	return &Service{
		emitter:       emitter,
		db:            database,
		reg:           reg,
		ia:            ia,
		streamCancels: make(map[string]context.CancelFunc),
	}
}

func (s *Service) SetEmitter(emitter events.Emitter) { s.emitter = emitter }

// Send executes the full chat loop for a conversation and returns the final assistant message.
func (s *Service) Send(ctx context.Context, conversationID, content string) (db.Message, error) {
	endpoint, _ := s.db.GetSetting("llm_endpoint")
	if endpoint == "" {
		return db.Message{}, fmt.Errorf("LLM endpoint não configurado — abra Settings e configure o endpoint")
	}
	apiKey, _ := s.db.GetSetting("llm_api_key")

	_, err := s.db.AddMessage(conversationID, "user", content, "", "", "", "")
	if err != nil {
		return db.Message{}, fmt.Errorf("save user msg: %w", err)
	}

	conv, err := s.db.GetConversation(conversationID)
	if err != nil {
		return db.Message{}, fmt.Errorf("get conversation: %w", err)
	}

	model := conv.Model
	if model == "" {
		model, _ = s.db.GetSetting("llm_model")
	}

	streamCtx, cancel := context.WithCancel(ctx)
	s.streamCancelsMu.Lock()
	s.streamCancels[conversationID] = cancel
	s.streamCancelsMu.Unlock()
	defer func() {
		cancel()
		s.streamCancelsMu.Lock()
		delete(s.streamCancels, conversationID)
		s.streamCancelsMu.Unlock()
	}()

	p := providers.Resolve(providers.Config{Endpoint: endpoint, APIKey: apiKey, Model: model})
	var finalMsg db.Message

	for {
		dbMsgs, err := s.db.GetMessages(conversationID)
		if err != nil {
			return db.Message{}, fmt.Errorf("get messages: %w", err)
		}

		s.emitter.Emit("chat:thinking", map[string]any{
			"conversationId": conversationID,
		})

		provMsgs := make([]providers.Message, 0, len(dbMsgs))
		for _, m := range dbMsgs {
			var tcs []providers.ToolCall
			if m.ToolCalls != "" {
				json.Unmarshal([]byte(m.ToolCalls), &tcs) //nolint:errcheck
			}
			var meta map[string]any
			if m.Metadata != "" {
				json.Unmarshal([]byte(m.Metadata), &meta) //nolint:errcheck
			}
			provMsgs = append(provMsgs, providers.Message{
				Role:       m.Role,
				Content:    m.Content,
				ToolCalls:  tcs,
				ToolCallID: m.ToolCallID,
				Metadata:   meta,
			})
		}

		req := providers.Request{
			Model:    model,
			Messages: provMsgs,
			Tools:    s.toolsForMode(conv.Mode, conv.PlanPhase),
			Stream:   true,
		}
		if modelDef, err := s.db.GetModel(model); err == nil {
			if modelDef.Temperature != nil {
				req.Temperature = *modelDef.Temperature
			}
			if modelDef.TopP != nil {
				req.TopP = *modelDef.TopP
			}
			if modelDef.MaxTokens != nil {
				req.MaxTokens = *modelDef.MaxTokens
			}
		}

		if conv.Mode == "plan" {
			req.Messages = append([]providers.Message{{Role: "system", Content: planSystemPrompt}}, req.Messages...)
		}

		eventCh := make(chan providers.Event, 64)
		errCh := make(chan error, 1)
		go func() { errCh <- p.Stream(streamCtx, req, eventCh) }()

		var buf strings.Builder
		activeToolCalls := make(map[int]*providers.ToolCall)
		var pendingMetadata map[string]any

		for evt := range eventCh {
			switch evt.Type {
			case providers.EventTextDelta:
				buf.WriteString(evt.Text)
				s.emitter.Emit("chat:chunk", map[string]any{
					"conversationId": conversationID,
					"text":           evt.Text,
				})
			case providers.EventToolCallStart:
				if activeToolCalls[evt.ToolCall.Index] == nil {
					activeToolCalls[evt.ToolCall.Index] = &providers.ToolCall{
						ID:   evt.ToolCall.ID,
						Name: evt.ToolCall.Name,
					}
					msg := fmt.Sprintf("\n\n⚙️ Chamando ferramenta: `%s`\nParâmetros: ", evt.ToolCall.Name)
					s.emitter.Emit("chat:chunk", map[string]any{
						"conversationId": conversationID,
						"text":           msg,
					})
				}
			case providers.EventToolCallDelta:
				if activeToolCalls[evt.ToolCall.Index] == nil {
					activeToolCalls[evt.ToolCall.Index] = &providers.ToolCall{}
				}
				activeToolCalls[evt.ToolCall.Index].Arguments += evt.ToolCall.ArgDelta
				s.emitter.Emit("chat:chunk", map[string]any{
					"conversationId": conversationID,
					"text":           evt.ToolCall.ArgDelta,
				})
			case providers.EventDone:
				pendingMetadata = evt.Metadata
			case providers.EventError:
			}
		}

		if err := <-errCh; err != nil {
			if errors.Is(err, context.Canceled) {
				if buf.Len() > 0 {
					partialMsg, _ := s.db.AddMessage(conversationID, "assistant", buf.String(), model, "", "", "")
					s.emitter.Emit("chat:stopped", map[string]any{
						"conversationId": conversationID,
						"message":        partialMsg,
					})
				} else {
					s.emitter.Emit("chat:stopped", map[string]any{
						"conversationId": conversationID,
						"message":        nil,
					})
				}
				return db.Message{}, nil
			}
			return db.Message{}, fmt.Errorf("stream: %w", err)
		}

		if len(activeToolCalls) > 0 {
			tcs := make([]providers.ToolCall, 0, len(activeToolCalls))
			for i := range len(activeToolCalls) {
				if tc, ok := activeToolCalls[i]; ok {
					tcs = append(tcs, *tc)
				}
			}
			tcsJSON, _ := json.Marshal(tcs)

			metaJSON := ""
			if len(pendingMetadata) > 0 {
				if b, err := json.Marshal(pendingMetadata); err == nil {
					metaJSON = string(b)
				}
			}
			fmt.Printf("[Orbit] salvando assistant msg com toolCalls, metadata=%s\n", metaJSON)

			msg, err := s.db.AddMessage(conversationID, "assistant", buf.String(), model, string(tcsJSON), "", metaJSON)
			if err != nil {
				return db.Message{}, fmt.Errorf("save assistant tool msg: %w", err)
			}
			s.emitter.Emit("chat:message", map[string]any{
				"conversationId": conversationID,
				"message":        msg,
			})

			for _, tc := range tcs {
				if tc.Name == "run_subagent" {
					var tcArgs map[string]any
					if tc.Arguments != "" {
						json.Unmarshal([]byte(tc.Arguments), &tcArgs) //nolint:errcheck
					}
					if tcArgs == nil {
						tcArgs = map[string]any{}
					}
					if _, hasModel := tcArgs["model"]; !hasModel {
						tcArgs["model"] = model
						if b, err := json.Marshal(tcArgs); err == nil {
							tc.Arguments = string(b)
						}
					}
				}
				result := s.executeToolCall(tc)
				toolMsg, err := s.db.AddMessage(conversationID, "tool", result, model, "", tc.ID, "")
				if err != nil {
					return db.Message{}, fmt.Errorf("save tool result msg: %w", err)
				}
				s.emitter.Emit("chat:message", map[string]any{
					"conversationId": conversationID,
					"message":        toolMsg,
				})
			}

			continue
		}

		msg, err := s.db.AddMessage(conversationID, "assistant", buf.String(), model, "", "", "")
		if err != nil {
			return db.Message{}, fmt.Errorf("save assistant msg: %w", err)
		}
		finalMsg = msg
		s.emitter.Emit("chat:message", map[string]any{
			"conversationId": conversationID,
			"message":        finalMsg,
		})

		if totalTokensRaw, ok := pendingMetadata["usage.total_tokens"]; ok {
			if totalTokens, ok := totalTokensRaw.(int); ok && totalTokens > 0 {
				if modelDef, err := s.db.GetModel(model); err == nil && modelDef.ContextWindow > 0 {
					pct := float64(totalTokens) / float64(modelDef.ContextWindow) * 100
					if pct > 100 {
						pct = 100
					}
					_ = s.db.UpdateConversationContextWindowUsage(conversationID, pct)
					s.emitter.Emit("chat:context_usage", map[string]any{
						"conversationId": conversationID,
						"percentage":     pct,
						"totalTokens":    totalTokens,
						"contextWindow":  modelDef.ContextWindow,
					})
				}
			}
		}

		break
	}

	return finalMsg, nil
}

// Stop cancels the active stream for the given conversation.
func (s *Service) Stop(conversationID string) {
	s.streamCancelsMu.Lock()
	defer s.streamCancelsMu.Unlock()
	if cancel, ok := s.streamCancels[conversationID]; ok {
		cancel()
	}
}

func (s *Service) toolsForMode(mode, planPhase string) []providers.Tool {
	all := s.reg.Definitions()
	switch mode {
	case "ask":
		return filterTools(all, askModeTools)
	case "plan":
		if planPhase == "implementing" {
			return all
		}
		return filterTools(all, planPlanningTools)
	default:
		return all
	}
}

func filterTools(all []providers.Tool, allowed map[string]bool) []providers.Tool {
	out := make([]providers.Tool, 0, len(allowed))
	for _, t := range all {
		if allowed[t.Name] {
			out = append(out, t)
		}
	}
	return out
}

func (s *Service) executeToolCall(tc providers.ToolCall) string {
	fmt.Printf("[Orbit] Tool: '%s' | Args: %s\n", tc.Name, tc.Arguments)
	var args map[string]any
	if tc.Arguments != "" {
		if err := json.Unmarshal([]byte(tc.Arguments), &args); err != nil {
			return fmt.Sprintf("Erro ao parsear argumentos JSON: %v", err)
		}
	}
	if denied := s.ia.CheckConfirm(tc.Name, args); denied != "" {
		return denied
	}
	return s.reg.Dispatch(tc.Name, args)
}
