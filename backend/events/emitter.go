package events

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Emitter abstracts event emission for testability.
type Emitter interface {
	Emit(event string, data any)
}

// WailsEmitter emits events via the Wails runtime.
type WailsEmitter struct{ ctx context.Context }

func NewWailsEmitter(ctx context.Context) *WailsEmitter {
	return &WailsEmitter{ctx: ctx}
}

func (e *WailsEmitter) Emit(event string, data any) {
	runtime.EventsEmit(e.ctx, event, data)
}
