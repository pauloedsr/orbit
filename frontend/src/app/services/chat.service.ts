import { Injectable, signal, computed } from '@angular/core';
import { WailsService } from './wails.service';
import { Conversation, Message, Settings } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ChatService {
  conversations = signal<Conversation[]>([]);
  activeConversationId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  isLoading = signal(false);
  isStreaming = signal(false);
  streamingContent = signal('');
  showSettings = signal(false);
  error = signal<string | null>(null);
  settings = signal<Settings>({ defaultModel: '', defaultProvider: '', theme: 'dark', llmEndpoint: '', llmApiKey: '', llmModel: '' });

  activeConversation = computed(() => {
    const id = this.activeConversationId();
    return this.conversations().find(c => c.id === id) ?? null;
  });

  constructor(private wails: WailsService) {
    this.init();
  }

  private async init() {
    this.wails.onEvent('chat:thinking', () => {
      this.isStreaming.set(true);
      this.streamingContent.set('');
    });

    this.wails.onEvent('chat:chunk', (text: string) => {
      this.streamingContent.update(c => c + text);
    });

    this.wails.onEvent('chat:message', (msg: Message) => {
      this.messages.update(msgs => [...msgs, msg]);
      this.isStreaming.set(false);
      this.streamingContent.set('');
    });

    const [convs, settings] = await Promise.all([
      this.wails.listConversations(),
      this.wails.getSettings(),
    ]);
    this.conversations.set(convs);
    this.settings.set(settings);
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
    const model = this.settings().llmModel || this.settings().defaultModel || 'gpt-4o';
    const conv = await this.wails.createConversation(
      title || 'Nova conversa',
      model,
      'openai-compat'
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

    this.error.set(null);
    try {
      await this.wails.sendMessage(convId, content.trim());
    } catch (err: any) {
      this.isStreaming.set(false);
      this.streamingContent.set('');
      this.error.set(typeof err === 'string' ? err : (err?.message ?? 'Erro desconhecido'));
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
