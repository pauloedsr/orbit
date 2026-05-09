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

// OpenAIProvider implementa Provider para qualquer API compatível com OpenAI:
// OpenAI, Ollama, LM Studio, LiteLLM, LocalAI, etc.
type OpenAIProvider struct {
	name    string
	baseURL string
	apiKey  string
	client  *http.Client
}

func init() {
	RegisterFallback(Factory{
		Name:        "openai-compat",
		Description: "OpenAI-compatible API (OpenAI, Ollama, LM Studio, LiteLLM, LocalAI, ...)",
		Detect:      MatchAlways(),
		Build: func(cfg Config) Provider {
			return NewOpenAIProvider("openai-compat", cfg.Endpoint, cfg.APIKey)
		},
	})
}

func NewOpenAIProvider(name, baseURL, apiKey string) *OpenAIProvider {
	return &OpenAIProvider{
		name:    name,
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		client: &http.Client{
			Transport: &http.Transport{DisableKeepAlives: true},
		},
	}
}

func (p *OpenAIProvider) Name() string              { return p.name }
func (p *OpenAIProvider) Capabilities() []Capability { return []Capability{CapTools} }

type oaiTool struct {
	Type     string      `json:"type"`
	Function oaiFunction `json:"function"`
}

type oaiFunction struct {
	Name        string      `json:"name,omitempty"`
	Description string      `json:"description,omitempty"`
	Parameters  any `json:"parameters,omitempty"`
}

type oaiToolCall struct {
	Index    *int             `json:"index,omitempty"`
	ID       string           `json:"id,omitempty"`
	Type     string           `json:"type,omitempty"`
	Function *oaiFunctionCall `json:"function,omitempty"`
}

type oaiFunctionCall struct {
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
}

type oaiMessage struct {
	Role       string        `json:"role"`
	Content    *string       `json:"content"` // pointer para serializar null quando vazio
	ToolCalls  []oaiToolCall `json:"tool_calls,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
}

type oaiRequest struct {
	Model       string       `json:"model"`
	Messages    []oaiMessage `json:"messages"`
	Tools       []oaiTool    `json:"tools,omitempty"`
	Stream      bool         `json:"stream"`
	Temperature float64      `json:"temperature,omitempty"`
	TopP        float64      `json:"top_p,omitempty"`
	MaxTokens   int          `json:"max_tokens,omitempty"`
}

type oaiChunk struct {
	Choices []struct {
		Delta struct {
			Content   string        `json:"content"`
			ToolCalls []oaiToolCall `json:"tool_calls,omitempty"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage,omitempty"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *OpenAIProvider) Stream(ctx context.Context, req Request, out chan<- Event) error {
	defer close(out)

	msgs := make([]oaiMessage, 0, len(req.Messages)+1)
	if req.System != "" {
		sys := req.System
		msgs = append(msgs, oaiMessage{Role: "system", Content: &sys})
	}
	for _, m := range req.Messages {
		var tcs []oaiToolCall
		if len(m.ToolCalls) > 0 {
			for _, tc := range m.ToolCalls {
				tcs = append(tcs, oaiToolCall{
					ID:   tc.ID,
					Type: "function",
					Function: &oaiFunctionCall{Name: tc.Name, Arguments: tc.Arguments},
				})
			}
		}
		var content *string
		if m.Content != "" {
			content = &m.Content
		}
		msgs = append(msgs, oaiMessage{
			Role:       m.Role,
			Content:    content,
			ToolCalls:  tcs,
			ToolCallID: m.ToolCallID,
		})
	}

	var oaiTools []oaiTool
	if len(req.Tools) > 0 {
		for _, t := range req.Tools {
			oaiTools = append(oaiTools, oaiTool{
				Type: "function",
				Function: oaiFunction{
					Name:        t.Name,
					Description: t.Description,
					Parameters:  t.Parameters,
				},
			})
		}
	}

	body, err := json.Marshal(oaiRequest{
		Model:       req.Model,
		Messages:    msgs,
		Tools:       oaiTools,
		Stream:      true,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		MaxTokens:   req.MaxTokens,
	})
	if err != nil {
		out <- Event{Type: EventError, Error: err}
		return err
	}

	fmt.Printf("[Orbit] → POST %s\n%s\n", p.baseURL, string(body))

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.baseURL, bytes.NewReader(body))
	if err != nil {
		out <- Event{Type: EventError, Error: err}
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	if p.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	}

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
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk oaiChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil {
			err := fmt.Errorf("provider: %s", chunk.Error.Message)
			out <- Event{Type: EventError, Error: err}
			return err
		}
		if chunk.Usage != nil && chunk.Usage.TotalTokens > 0 {
			totalTokens = chunk.Usage.TotalTokens
		}
		if len(chunk.Choices) > 0 {
			delta := chunk.Choices[0].Delta
			if text := delta.Content; text != "" {
				out <- Event{Type: EventTextDelta, Text: text}
			}
			for _, tc := range delta.ToolCalls {
				idx := 0
				if tc.Index != nil {
					idx = *tc.Index
				}
				if tc.Function != nil && tc.Function.Name != "" {
					out <- Event{
						Type: EventToolCallStart,
						ToolCall: &ToolCallEvent{
							Index: idx,
							ID:    tc.ID,
							Name:  tc.Function.Name,
						},
					}
				}
				if tc.Function != nil && tc.Function.Arguments != "" {
					out <- Event{
						Type: EventToolCallDelta,
						ToolCall: &ToolCallEvent{
							Index:    idx,
							ArgDelta: tc.Function.Arguments,
						},
					}
				}
			}
		}
	}

	var meta map[string]any
	if totalTokens > 0 {
		meta = map[string]any{"usage.total_tokens": totalTokens}
	}
	out <- Event{Type: EventDone, Metadata: meta}
	return scanner.Err()
}
