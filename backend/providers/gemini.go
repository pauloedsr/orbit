package providers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func init() {
	Register(Factory{
		Name:        "gemini",
		Description: "Google Gemini native API with thought signature support",
		Detect: MatchAny(
			MatchEndpoint("generativelanguage.googleapis.com"),
			MatchModelPrefix("gemini-"),
		),
		Build: func(cfg Config) Provider {
			return NewGeminiProvider(cfg.APIKey)
		},
	})
}

// GeminiProvider implementa Provider para a API nativa do Google Gemini.
// Suporta thought signatures (necessárias para modelos com thinking habilitado).
type GeminiProvider struct {
	apiKey string
	client *http.Client
}

func NewGeminiProvider(apiKey string) *GeminiProvider {
	return &GeminiProvider{
		apiKey: apiKey,
		client: &http.Client{
			Transport: &http.Transport{DisableKeepAlives: true},
		},
	}
}

func (p *GeminiProvider) Name() string               { return "gemini" }
func (p *GeminiProvider) Capabilities() []Capability { return []Capability{CapTools, CapThinking} }

// ---------------------------------------------------------------------------
// Structs de request para a API nativa Gemini
// ---------------------------------------------------------------------------

type geminiRequest struct {
	Contents          []geminiContent  `json:"contents"`
	Tools             []geminiTool     `json:"tools,omitempty"`
	SystemInstruction *geminiContent   `json:"systemInstruction,omitempty"`
	GenerationConfig  *geminiGenConfig `json:"generationConfig,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"` // "user" ou "model"
	Parts []geminiPart `json:"parts"`
}

// geminiPart representa uma part do Gemini. Os campos não são mutuamente exclusivos:
// o Gemini pode retornar thoughtSignature junto com functionCall na mesma part.
type geminiPart struct {
	Text             string                  `json:"text,omitempty"`
	Thought          bool                    `json:"thought,omitempty"`
	// ThoughtSignature pode aparecer em qualquer part — inclusive junto com functionCall.
	ThoughtSignature string                  `json:"thoughtSignature,omitempty"`
	FunctionCall     *geminiFunctionCall     `json:"functionCall,omitempty"`
	FunctionResponse *geminiFunctionResponse `json:"functionResponse,omitempty"`
}

type geminiFunctionCall struct {
	Name string         `json:"name"`
	Args map[string]any `json:"args"`
	ID   string         `json:"id,omitempty"` // Gemini gera um ID por chamada
}

type geminiFunctionResponse struct {
	Name     string         `json:"name"`
	Response map[string]any `json:"response"`
}

type geminiTool struct {
	FunctionDeclarations []geminiFunctionDecl `json:"functionDeclarations"`
}

type geminiFunctionDecl struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

type geminiGenConfig struct {
	Temperature     float64 `json:"temperature,omitempty"`
	TopP            float64 `json:"topP,omitempty"`
	MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
}

// ---------------------------------------------------------------------------
// Structs de resposta SSE do Gemini
// ---------------------------------------------------------------------------

type geminiChunk struct {
	Candidates []struct {
		Content struct {
			Parts []geminiPart `json:"parts"`
			Role  string       `json:"role"`
		} `json:"content"`
		FinishReason string `json:"finishReason,omitempty"`
	} `json:"candidates"`
	UsageMetadata *struct {
		TotalTokenCount int `json:"totalTokenCount"`
	} `json:"usageMetadata,omitempty"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------

func (p *GeminiProvider) Stream(ctx context.Context, req Request, out chan<- Event) error {
	defer close(out)

	gemReq, err := p.buildRequest(req)
	if err != nil {
		out <- Event{Type: EventError, Error: err}
		return err
	}

	body, err := json.Marshal(gemReq)
	if err != nil {
		out <- Event{Type: EventError, Error: err}
		return err
	}

	model := strings.TrimPrefix(req.Model, "models/")
	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:streamGenerateContent?key=%s&alt=sse",
		model, p.apiKey,
	)

	fmt.Printf("[Orbit] → POST %s (gemini)\n%s\n", url, string(body))

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		out <- Event{Type: EventError, Error: err}
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		out <- Event{Type: EventError, Error: err}
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		fmt.Printf("[Orbit] ← HTTP %d: %s\n", resp.StatusCode, string(errBody))
		err := fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(errBody)))
		out <- Event{Type: EventError, Error: err}
		return err
	}

	// toolSignatures armazena a thoughtSignature de cada tool call pelo índice.
	// O Gemini retorna a signature NA MESMA part que o functionCall.
	var toolSignatures []string
	toolCallIndex := 0
	var totalTokens int

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			if line != "" && line != ": keep-alive" {
				fmt.Printf("[Orbit/Gemini] raw: %s\n", line)
			}
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		fmt.Printf("[Orbit/Gemini] ← %s\n", data)

		var chunk geminiChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			fmt.Printf("[Orbit/Gemini] parse error: %v\n", err)
			continue
		}
		if chunk.Error != nil {
			err := fmt.Errorf("provider HTTP %d: %s", chunk.Error.Code, chunk.Error.Message)
			out <- Event{Type: EventError, Error: err}
			return err
		}

		if chunk.UsageMetadata != nil && chunk.UsageMetadata.TotalTokenCount > 0 {
			totalTokens = chunk.UsageMetadata.TotalTokenCount
		}

		for _, cand := range chunk.Candidates {
			for _, part := range cand.Content.Parts {
				// Os campos não são mutuamente exclusivos: thoughtSignature pode
				// aparecer junto com functionCall na mesma part.
				if part.Text != "" {
					out <- Event{Type: EventTextDelta, Text: part.Text}
				}

				if part.FunctionCall != nil {
					argsJSON, _ := json.Marshal(part.FunctionCall.Args)
					// Usa o ID Gemini se disponível; cai no nome como fallback.
					callID := part.FunctionCall.ID
					if callID == "" {
						callID = part.FunctionCall.Name
					}
					out <- Event{
						Type: EventToolCallStart,
						ToolCall: &ToolCallEvent{
							Index: toolCallIndex,
							ID:    callID,
							Name:  part.FunctionCall.Name,
						},
					}
					out <- Event{
						Type: EventToolCallDelta,
						ToolCall: &ToolCallEvent{
							Index:    toolCallIndex,
							ArgDelta: string(argsJSON),
						},
					}
					// Captura a signature associada a este tool call (mesma part).
					toolSignatures = append(toolSignatures, part.ThoughtSignature)
					fmt.Printf("[Orbit/Gemini] functionCall %q idx=%d signature=%v\n",
						part.FunctionCall.Name, toolCallIndex, part.ThoughtSignature != "")
					toolCallIndex++
				} else if part.ThoughtSignature != "" {
					// Thought part dedicada (sem functionCall) — registra como signature avulsa.
					fmt.Printf("[Orbit/Gemini] thought-only signature capturada (thought=%v)\n", part.Thought)
					toolSignatures = append(toolSignatures, part.ThoughtSignature)
				}
			}
		}
	}

	fmt.Printf("[Orbit/Gemini] stream completo — %d tool call(s), signatures: %v, tokens: %d\n",
		toolCallIndex, toolSignatures, totalTokens)
	var meta map[string]any
	if len(toolSignatures) > 0 || totalTokens > 0 {
		meta = map[string]any{}
		if len(toolSignatures) > 0 {
			meta["gemini.tool_signatures"] = toolSignatures
		}
		if totalTokens > 0 {
			meta["usage.total_tokens"] = totalTokens
		}
	}
	out <- Event{Type: EventDone, Metadata: meta}
	return scanner.Err()
}

// ---------------------------------------------------------------------------
// Conversão Orbit → Gemini
// ---------------------------------------------------------------------------

func (p *GeminiProvider) buildRequest(req Request) (geminiRequest, error) {
	var gemReq geminiRequest

	// System instruction
	if req.System != "" {
		gemReq.SystemInstruction = &geminiContent{
			Parts: []geminiPart{{Text: req.System}},
		}
	}

	// Tools
	if len(req.Tools) > 0 {
		decls := make([]geminiFunctionDecl, 0, len(req.Tools))
		for _, t := range req.Tools {
			decls = append(decls, geminiFunctionDecl{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  t.Parameters,
			})
		}
		gemReq.Tools = []geminiTool{{FunctionDeclarations: decls}}
	}

	// Generation config
	if req.Temperature > 0 || req.TopP > 0 || req.MaxTokens > 0 {
		gemReq.GenerationConfig = &geminiGenConfig{
			Temperature:     req.Temperature,
			TopP:            req.TopP,
			MaxOutputTokens: req.MaxTokens,
		}
	}

	// Mensagens
	// Regras de mapeamento:
	//   system  → systemInstruction (já tratado acima)
	//   user    → content role="user", part text
	//   assistant sem tools → content role="model", part text
	//   assistant com tools → content role="model": thoughts (do Metadata) + text + functionCall
	//   tool (consecutivos) → agrupados num único content role="user" com functionResponse parts
	msgs := req.Messages
	i := 0
	for i < len(msgs) {
		m := msgs[i]

		switch m.Role {
		case "system":
			// Mensagens system inline são ignoradas (já está em SystemInstruction)
			i++

		case "user":
			gemReq.Contents = append(gemReq.Contents, geminiContent{
				Role:  "user",
				Parts: []geminiPart{{Text: m.Content}},
			})
			i++

		case "assistant":
			parts := p.buildModelParts(m)
			gemReq.Contents = append(gemReq.Contents, geminiContent{
				Role:  "model",
				Parts: parts,
			})
			i++

		case "tool":
			// Agrupa todas as mensagens "tool" consecutivas num único content "user"
			var funcResponses []geminiPart
			for i < len(msgs) && msgs[i].Role == "tool" {
				tm := msgs[i]
				funcResponses = append(funcResponses, geminiPart{
					FunctionResponse: &geminiFunctionResponse{
						Name:     tm.ToolCallID, // Gemini usa o nome da função como ID
						Response: map[string]any{"output": tm.Content},
					},
				})
				i++
			}
			gemReq.Contents = append(gemReq.Contents, geminiContent{
				Role:  "user",
				Parts: funcResponses,
			})

		default:
			i++
		}
	}

	return gemReq, nil
}

// buildModelParts constrói as parts de uma mensagem "assistant" para o Gemini.
// O Gemini retorna a thoughtSignature na mesma part que o functionCall,
// portanto reconstruímos da mesma forma.
func (p *GeminiProvider) buildModelParts(m Message) []geminiPart {
	var parts []geminiPart

	// Text part
	if m.Content != "" {
		parts = append(parts, geminiPart{Text: m.Content})
	}

	// FunctionCall parts — com thoughtSignature embutida, se disponível.
	sigs := extractToolSignatures(m.Metadata)
	for i, tc := range m.ToolCalls {
		var args map[string]any
		if tc.Arguments != "" {
			json.Unmarshal([]byte(tc.Arguments), &args) //nolint:errcheck
		}
		if args == nil {
			args = map[string]any{}
		}
		part := geminiPart{
			FunctionCall: &geminiFunctionCall{
				Name: tc.Name,
				Args: args,
			},
		}
		if i < len(sigs) && sigs[i] != "" {
			part.ThoughtSignature = sigs[i]
		}
		parts = append(parts, part)
	}

	return parts
}

// extractToolSignatures extrai a lista de thought signatures do Metadata da mensagem.
// O formato armazenado é: {"gemini.tool_signatures": ["sig0", "sig1", ...]}.
func extractToolSignatures(meta map[string]any) []string {
	if meta == nil {
		return nil
	}
	raw, ok := meta["gemini.tool_signatures"]
	if !ok {
		return nil
	}
	switch v := raw.(type) {
	case []string:
		return v
	case []any:
		result := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			} else {
				result = append(result, "") // mantém alinhamento por índice
			}
		}
		return result
	}
	return nil
}

// toSliceOfMaps converte []map[string]any ou []interface{} (após JSON round-trip)
// para []map[string]any.
