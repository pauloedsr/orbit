import { Injectable, signal, computed } from '@angular/core';
import { WailsService } from './wails.service';
import { Conversation, Message } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ChatService {
  // --- State via signals ---
  conversations = signal<Conversation[]>([]);
  activeConversationId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  isLoading = signal(false);
  isStreaming = signal(false);

  activeConversation = computed(() => {
    const id = this.activeConversationId();
    return this.conversations().find(c => c.id === id) ?? null;
  });

  constructor(private wails: WailsService) {
    this.init();
  }

  private async init() {
    // Registra listeners de eventos Wails
    this.wails.onEvent('chat:thinking', () => {
      this.isStreaming.set(true);
    });

    this.wails.onEvent('chat:message', (msg: Message) => {
      this.messages.update(msgs => [...msgs, msg]);
      this.isStreaming.set(false);
    });

    // Carrega conversas ao iniciar
    await this.loadConversations();
  }

  async loadConversations() {
    const convs = await this.wails.listConversations();
    this.conversations.set(convs);
  }

  async selectConversation(id: string) {
    this.activeConversationId.set(id);
    this.isLoading.set(true);
    try {
      const msgs = await this.wails.getMessages(id);
      this.messages.set(msgs);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createConversation(title?: string) {
    const conv = await this.wails.createConversation(
      title || 'Nova conversa',
      'claude-sonnet-4-20250514',
      'anthropic'
    );
    this.conversations.update(c => [conv, ...c]);
    await this.selectConversation(conv.id);
    return conv;
  }

  async sendMessage(content: string) {
    const convId = this.activeConversationId();
    if (!convId || !content.trim()) return;

    // Adiciona mensagem do user na UI imediatamente (optimistic)
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: convId,
      role: 'user',
      content: content.trim(),
      model: '',
      createdAt: new Date().toISOString(),
    };
    this.messages.update(msgs => [...msgs, userMsg]);

    // Envia ao backend (que persiste + chama o provider)
    try {
      await this.wails.sendMessage(convId, content.trim());
    } catch (err) {
      console.error('send failed:', err);
      this.isStreaming.set(false);
    }
  }

  async deleteConversation(id: string) {
    await this.wails.deleteConversation(id);
    this.conversations.update(c => c.filter(x => x.id !== id));
    if (this.activeConversationId() === id) {
      this.activeConversationId.set(null);
      this.messages.set([]);
    }
  }
}
