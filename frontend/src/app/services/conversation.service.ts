import { Injectable, signal, computed } from '@angular/core';
import { WailsService } from './wails.service';
import { SettingsService } from './settings.service';
import { TabService } from './tab.service';
import { MessageService } from './message.service';
import { Conversation, ConversationMode, ChatContextUsagePayload } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ConversationService {
  conversations = signal<Conversation[]>([]);

  activeConversation = computed(() => {
    const id = this.tabService.activeConversationId();
    return this.conversations().find(c => c.id === id) ?? null;
  });

  currentMode = computed(() => this.activeConversation()?.mode ?? 'edit');

  constructor(
    private wails: WailsService,
    private settings: SettingsService,
    private tabService: TabService,
    private messageService: MessageService,
  ) {
    this.wails.onEvent('chat:context_usage', (data: ChatContextUsagePayload) => {
      this.conversations.update(cs =>
        cs.map(c => c.id === data.conversationId ? { ...c, contextWindowUsage: data.percentage } : c)
      );
    });

    this.init();
  }

  private async init() {
    const convs = await this.wails.listConversations();
    this.conversations.set(convs);
  }

  async loadConversations() {
    const convs = await this.wails.listConversations();
    this.conversations.set(convs);
  }

  async createConversation(title?: string): Promise<Conversation> {
    const modelId = this.settings.settings().defaultModel || 'gpt-4o';
    const modelDef = this.settings.models().find(m => m.id === modelId);
    const providerId = modelDef?.providerId ?? this.settings.settings().defaultProvider ?? '';
    const conv = await this.wails.createConversation(
      title || 'Nova conversa',
      modelId,
      providerId || 'openai-compat',
    );
    this.conversations.update(c => [conv, ...c]);
    await this.tabService.openTab(conv.id);
    return conv;
  }

  async selectConversation(id: string) {
    await this.tabService.openTab(id);
  }

  async deleteConversation(id: string) {
    await this.wails.deleteConversation(id);
    this.conversations.update(c => c.filter(x => x.id !== id));
    this.messageService.evictConv(id);
    await this.tabService.forceCloseTab(id);
  }

  async updateConversationTitle(id: string, newTitle: string) {
    if (!newTitle.trim()) return;
    await this.wails.updateConversation(id, newTitle);
    this.conversations.update(c =>
      c.map(conv => conv.id === id ? { ...conv, title: newTitle } : conv)
    );
  }

  async toggleConversationPinned(id: string) {
    const conv = this.conversations().find(c => c.id === id);
    if (!conv) return;
    const newPinnedState = !conv.pinned;
    await this.wails.setConversationPinned(id, newPinnedState);
    this.conversations.update(c =>
      c.map(conversation =>
        conversation.id === id ? { ...conversation, pinned: newPinnedState } : conversation
      ).sort((a, b) => {
        if (a.pinned === b.pinned) {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        return a.pinned ? -1 : 1;
      })
    );
  }

  async setConversationModel(convId: string, modelId: string) {
    await this.wails.setConversationModel(convId, modelId);
    this.conversations.update(cs =>
      cs.map(c => c.id === convId ? { ...c, model: modelId } : c)
    );
  }

  async cycleMode(convId: string) {
    const conv = this.conversations().find(c => c.id === convId);
    if (!conv) return;
    const modes: ConversationMode[] = ['ask', 'edit', 'plan'];
    const nextMode = modes[(modes.indexOf(conv.mode) + 1) % modes.length];
    await this.wails.setConversationMode(convId, nextMode);
    this.conversations.update(cs =>
      cs.map(c => c.id === convId ? { ...c, mode: nextMode, planPhase: 'planning' as const } : c)
    );
  }

  async startPlanImplementation(convId: string) {
    await this.wails.startPlanImplementation(convId);
    this.conversations.update(cs =>
      cs.map(c => c.id === convId ? { ...c, planPhase: 'implementing' as const } : c)
    );
  }
}
