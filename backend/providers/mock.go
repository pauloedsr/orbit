package providers

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// MockProvider simula streaming de resposta para desenvolvimento.
// Substituir por AnthropicProvider e OpenAIProvider na fase 2.
type MockProvider struct{}

func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

func (m *MockProvider) Name() string { return "mock" }

func (m *MockProvider) SupportsTools() bool { return false }

func (m *MockProvider) Stream(ctx context.Context, req Request, out chan<- Event) error {
	defer close(out)

	lastMsg := ""
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			lastMsg = req.Messages[i].Content
			break
		}
	}

	reply := fmt.Sprintf("Orbit mock reply to: \"%s\"\n\nThis is a **simulated** response. "+
		"When a real provider is connected, you'll see actual LLM output here with full streaming support.", lastMsg)

	// Simula streaming word-by-word
	words := strings.Fields(reply)
	for i, word := range words {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		suffix := " "
		if i == len(words)-1 {
			suffix = ""
		}
		out <- Event{Type: EventTextDelta, Text: word + suffix}
		time.Sleep(30 * time.Millisecond)
	}

	out <- Event{Type: EventDone}
	return nil
}
