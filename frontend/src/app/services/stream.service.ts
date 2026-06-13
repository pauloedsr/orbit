import { Injectable, signal } from '@angular/core';
import { WailsService } from './wails.service';
import { TabService } from './tab.service';
import { MessageService } from './message.service';
import {
  ChatThinkingPayload, ChatChunkPayload, ChatThinkingChunkPayload, ChatMessagePayload, ChatStoppedPayload, Message,
  ChatToolCallStartPayload, ChatToolCallDeltaPayload, ChatToolExecutingPayload, ChatToolResultPayload,
  StreamingToolCall,
} from '../models/types';

interface StreamState {
  content: string;
  thinking: string;
  toolCalls: Map<number, StreamingToolCall>;
  toolCallsById: Map<string, number>;
}

function emptyState(): StreamState {
  return { content: '', thinking: '', toolCalls: new Map(), toolCallsById: new Map() };
}

@Injectable({ providedIn: 'root' })
export class StreamService {
  private streamingStates = signal<Map<string, StreamState>>(new Map());

  constructor(
    private wails: WailsService,
    private tabService: TabService,
    private messageService: MessageService,
  ) {
    this.wails.onEvent('chat:thinking', (data: ChatThinkingPayload) => {
      this.streamingStates.update(m => new Map(m).set(data.conversationId, emptyState()));
    });

    this.wails.onEvent('chat:chunk', (data: ChatChunkPayload) => {
      this.mutate(data.conversationId, st => { st.content += data.text; });
    });

    this.wails.onEvent('chat:thinking_chunk', (data: ChatThinkingChunkPayload) => {
      this.mutate(data.conversationId, st => { st.thinking += data.text; });
    });

    this.wails.onEvent('chat:tool_call_start', (data: ChatToolCallStartPayload) => {
      this.mutate(data.conversationId, st => {
        st.toolCalls.set(data.index, {
          index: data.index,
          id: data.id,
          name: data.name,
          arguments: '',
          status: 'streaming',
        });
        if (data.id) st.toolCallsById.set(data.id, data.index);
      });
    });

    this.wails.onEvent('chat:tool_call_delta', (data: ChatToolCallDeltaPayload) => {
      this.mutate(data.conversationId, st => {
        const tc = st.toolCalls.get(data.index);
        if (tc) {
          tc.arguments += data.argDelta;
        } else {
          st.toolCalls.set(data.index, {
            index: data.index, id: '', name: '', arguments: data.argDelta, status: 'streaming',
          });
        }
      });
    });

    this.wails.onEvent('chat:tool_executing', (data: ChatToolExecutingPayload) => {
      this.mutate(data.conversationId, st => {
        const idx = st.toolCallsById.get(data.toolCallId);
        if (idx !== undefined) {
          const tc = st.toolCalls.get(idx);
          if (tc) tc.status = 'executing';
        }
      });
    });

    this.wails.onEvent('chat:tool_result', (data: ChatToolResultPayload) => {
      this.mutate(data.conversationId, st => {
        const idx = st.toolCallsById.get(data.toolCallId);
        if (idx !== undefined) {
          const tc = st.toolCalls.get(idx);
          if (tc) { tc.status = 'done'; tc.result = data.result; }
        }
      });
    });

    this.wails.onEvent('chat:message', (data: ChatMessagePayload) => {
      const msg = this.messageService.formatMessage(data.message);
      this.messageService.pushToConv(msg.conversationId, msg);
      this.clearStream(data.conversationId);
    });

    this.wails.onEvent('chat:stopped', (data: ChatStoppedPayload) => {
      if (data.message) {
        const msg = this.messageService.formatMessage(data.message);
        this.messageService.pushToConv(msg.conversationId, msg);
      }
      this.clearStream(data.conversationId);
    });
  }

  private mutate(convId: string, fn: (st: StreamState) => void) {
    this.streamingStates.update(m => {
      const prev = m.get(convId) ?? emptyState();
      const next: StreamState = {
        content: prev.content,
        thinking: prev.thinking,
        toolCalls: new Map(prev.toolCalls),
        toolCallsById: new Map(prev.toolCallsById),
      };
      fn(next);
      return new Map(m).set(convId, next);
    });
  }

  isStreamingFor(id: string): boolean {
    return this.streamingStates().has(id);
  }

  streamingContentFor(id: string): string {
    return this.streamingStates().get(id)?.content ?? '';
  }

  streamingThinkingFor(id: string): string {
    return this.streamingStates().get(id)?.thinking ?? '';
  }

  streamingToolCallsFor(id: string): StreamingToolCall[] {
    const st = this.streamingStates().get(id);
    if (!st) return [];
    return Array.from(st.toolCalls.values()).sort((a, b) => a.index - b.index);
  }

  async sendMessage(content: string) {
    const convId = this.tabService.activeConversationId();
    if (!convId || !content.trim()) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: convId,
      role: 'user',
      content: content.trim(),
      model: '',
      createdAt: new Date().toISOString(),
    };
    this.messageService.pushToConv(convId, userMsg);
    this.messageService.error.set(null);
    try {
      await this.wails.sendMessage(convId, content.trim());
    } catch (err: any) {
      this.clearStream(convId);
      this.messageService.error.set(typeof err === 'string' ? err : (err?.message ?? 'Erro desconhecido'));
    }
  }

  async stopStream(convId: string) {
    await this.wails.stopStream(convId);
  }

  private clearStream(convId: string) {
    this.streamingStates.update(m => { const n = new Map(m); n.delete(convId); return n; });
  }
}
