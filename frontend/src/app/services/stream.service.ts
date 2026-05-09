import { Injectable, signal } from '@angular/core';
import { WailsService } from './wails.service';
import { TabService } from './tab.service';
import { MessageService } from './message.service';
import {
  ChatThinkingPayload, ChatChunkPayload, ChatMessagePayload, ChatStoppedPayload, Message,
} from '../models/types';

@Injectable({ providedIn: 'root' })
export class StreamService {
  private streamingStates = signal<Map<string, { content: string }>>(new Map());

  constructor(
    private wails: WailsService,
    private tabService: TabService,
    private messageService: MessageService,
  ) {
    this.wails.onEvent('chat:thinking', (data: ChatThinkingPayload) => {
      this.streamingStates.update(m => new Map(m).set(data.conversationId, { content: '' }));
    });

    this.wails.onEvent('chat:chunk', (data: ChatChunkPayload) => {
      this.streamingStates.update(m => {
        const prev = m.get(data.conversationId)?.content ?? '';
        return new Map(m).set(data.conversationId, { content: prev + data.text });
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

  isStreamingFor(id: string): boolean {
    return this.streamingStates().has(id);
  }

  streamingContentFor(id: string): string {
    return this.streamingStates().get(id)?.content ?? '';
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
