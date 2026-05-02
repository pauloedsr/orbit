package providers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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

func NewOpenAIProvider(name, baseURL, apiKey string) *OpenAIProvider {
	return &OpenAIProvider{
		name:    name,
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		client:  &http.Client{},
	}
}

func (p *OpenAIProvider) Name() string        { return p.name }
func (p *OpenAIProvider) SupportsTools() bool { return true }

type oaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type oaiRequest struct {
	Model    string       `json:"model"`
	Messages []oaiMessage `json:"messages"`
	Stream   bool         `json:"stream"`
}

type oaiChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *OpenAIProvider) Stream(ctx context.Context, req Request, out chan<- Event) error {
	defer close(out)

	msgs := make([]oaiMessage, 0, len(req.Messages)+1)
	if req.System != "" {
		msgs = append(msgs, oaiMessage{Role: "system", Content: req.System})
	}
	for _, m := range req.Messages {
		msgs = append(msgs, oaiMessage{Role: m.Role, Content: m.Content})
	}

	body, err := json.Marshal(oaiRequest{
		Model:    req.Model,
		Messages: msgs,
		Stream:   true,
	})
	if err != nil {
		out <- Event{Type: EventError, Error: err}
		return err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.baseURL, bytes.NewReader(body))
	// p.baseURL+"/chat/completions", bytes.NewReader(body))
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
		err := fmt.Errorf("provider HTTP %d", resp.StatusCode)
		out <- Event{Type: EventError, Error: err}
		return err
	}

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
		if len(chunk.Choices) > 0 {
			if text := chunk.Choices[0].Delta.Content; text != "" {
				out <- Event{Type: EventTextDelta, Text: text}
			}
		}
	}

	out <- Event{Type: EventDone}
	return scanner.Err()
}
