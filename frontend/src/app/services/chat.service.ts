import { Injectable, signal, computed } from '@angular/core';
import { WailsService } from './wails.service';
import {
  Conversation, ConversationMode, Message, ModelDef, Provider, Settings, ToolInteraction, SubAgentSession, SubAgentIteration,
  ChatThinkingPayload, ChatChunkPayload, ChatMessagePayload, ChatStoppedPayload, ChatContextUsagePayload,
} from '../models/types';

@Injectable({ providedIn: 'root' })
export class ChatService {
  conversations = signal<Conversation[]>([]);
  models = signal<ModelDef[]>([]);
  activeConversationId = signal<string | null>(null);
  openTabs = signal<string[]>([]);
  messagesByConv = signal<Map<string, Message[]>>(new Map());
  tabLocked = signal<Map<string, boolean>>(new Map());
  sidebarVisible = signal<boolean>(true);
  isLoading = signal(false);
  private _streamingStates = signal<Map<string, { content: string }>>(new Map());
  showSettings = signal(false);
  error = signal<string | null>(null);
  providers = signal<Provider[]>([]);
  settings = signal<Settings>({ defaultModel: '', defaultProvider: '', theme: 'dark' });
  pendingInteraction = signal<ToolInteraction | null>(null);
  deleteConfirmation = signal<{ id: string; title: string } | null>(null);
  renameConversation = signal<{ id: string; currentTitle: string } | null>(null);
  activeSubAgents = signal<Map<string, SubAgentSession>>(new Map());
  subAgentPanelState = signal<'hidden' | 'visible' | 'fading'>('hidden');
  private subAgentFadeTimer: ReturnType<typeof setTimeout> | null = null;

  messages = computed<Message[]>(() => {
    const id = this.activeConversationId();
    return id ? (this.messagesByConv().get(id) ?? []) : [];
  });

  activeConversation = computed(() => {
    const id = this.activeConversationId();
    return this.conversations().find(c => c.id === id) ?? null;
  });

  currentMode = computed(() => this.activeConversation()?.mode ?? 'edit');

  isStreamingFor(id: string): boolean {
    return this._streamingStates().has(id);
  }

  streamingContentFor(id: string): string {
    return this._streamingStates().get(id)?.content ?? '';
  }

  constructor(private wails: WailsService) {
    this.init();
  }

  private pushToConv(convId: string, msg: Message) {
    this.messagesByConv.update(m => {
      const existing = m.get(convId) ?? [];
      return new Map(m).set(convId, [...existing, msg]);
    });
  }

  private async loadMessages(id: string) {
    const isActive = this.activeConversationId() === id;
    if (isActive) this.isLoading.set(true);
    try {
      const msgs = await this.wails.getMessages(id);
      this.messagesByConv.update(m => new Map(m).set(id, msgs.map(msg => this.formatMessage(msg))));
    } finally {
      if (this.activeConversationId() === id) this.isLoading.set(false);
    }
  }

  private async init() {
    this.wails.onEvent('chat:thinking', (data: ChatThinkingPayload) => {
      this._streamingStates.update(m => new Map(m).set(data.conversationId, { content: '' }));
    });

    this.wails.onEvent('chat:chunk', (data: ChatChunkPayload) => {
      this._streamingStates.update(m => {
        const prev = m.get(data.conversationId)?.content ?? '';
        return new Map(m).set(data.conversationId, { content: prev + data.text });
      });
    });

    this.wails.onEvent('chat:message', (data: ChatMessagePayload) => {
      const msg = this.formatMessage(data.message);
      this.pushToConv(msg.conversationId, msg);
      this._streamingStates.update(m => { const n = new Map(m); n.delete(data.conversationId); return n; });
    });

    this.wails.onEvent('chat:stopped', (data: ChatStoppedPayload) => {
      if (data.message) {
        const msg = this.formatMessage(data.message);
        this.pushToConv(msg.conversationId, msg);
      }
      this._streamingStates.update(m => { const n = new Map(m); n.delete(data.conversationId); return n; });
    });

    this.wails.onEvent('chat:context_usage', (data: ChatContextUsagePayload) => {
      this.conversations.update(cs =>
        cs.map(c => c.id === data.conversationId ? { ...c, contextWindowUsage: data.percentage } : c)
      );
    });

    this.wails.onEvent('tool:ask', (data: any) => {
      this.pendingInteraction.set({
        id: data.id,
        type: data.type === 'choice' ? 'ask_choice' : 'ask_text',
        question: data.question,
        choices: data.choices,
      });
    });

    this.wails.onEvent('tool:confirm', (data: any) => {
      this.pendingInteraction.set({
        id: data.id,
        type: 'confirm',
        toolName: data.toolName,
        details: data.details,
      });
    });

    this.wails.onEvent('subagent:start', (data: any) => {
      this.activeSubAgents.update(m => new Map(m).set(data.id, {
        id: data.id,
        prompt: data.prompt,
        model: data.model,
        iterations: [],
        completed: false,
        success: false,
      }));
      if (this.subAgentFadeTimer) {
        clearTimeout(this.subAgentFadeTimer);
        this.subAgentFadeTimer = null;
      }
      this.subAgentPanelState.set('visible');
    });

    this.wails.onEvent('subagent:iteration', (data: any) => {
      this.activeSubAgents.update(m => {
        const s = m.get(data.agentId);
        if (!s) return m;
        const newIter: SubAgentIteration = {
          iteration: data.iteration,
          phase: data.phase,
          tools: data.tools ?? [],
        };
        const existing = s.iterations.find(i => i.iteration === data.iteration);
        const iterations = existing
          ? s.iterations.map(i => i.iteration === data.iteration ? newIter : i)
          : [...s.iterations, newIter];
        return new Map(m).set(data.agentId, { ...s, iterations });
      });
    });

    this.wails.onEvent('subagent:done', (data: any) => {
      this.activeSubAgents.update(m => {
        const s = m.get(data.agentId);
        if (!s) return m;
        return new Map(m).set(data.agentId, { ...s, completed: true, success: data.success });
      });
      const allDone = [...this.activeSubAgents().values()].every(s => s.completed);
      if (allDone) {
        this.subAgentFadeTimer = setTimeout(() => {
          this.subAgentPanelState.set('fading');
          setTimeout(() => {
            this.subAgentPanelState.set('hidden');
            this.activeSubAgents.set(new Map());
            this.subAgentFadeTimer = null;
          }, 600);
        }, 15_000);
      }
    });

    const [convs, settings] = await Promise.all([
      this.wails.listConversations(),
      this.wails.getSettings(),
    ]);
    this.conversations.set(convs);
    this.settings.set(settings);
    // Separado para não quebrar o init se o backend ainda não tiver o método
    try {
      const models = await this.wails.listModels();
      this.models.set(models ?? []);
    } catch { }
    try {
      const providers = await this.wails.listProviders();
      this.providers.set(providers ?? []);
    } catch { }
  }

  async loadConversations() {
    const convs = await this.wails.listConversations();
    this.conversations.set(convs);
  }

  async openTab(id: string) {
    if (!this.openTabs().includes(id)) {
      this.openTabs.update(tabs => [...tabs, id]);
    }
    this.activeConversationId.set(id);
    if (!this.messagesByConv().has(id)) {
      await this.loadMessages(id);
    }
  }

  async closeTab(id: string) {
    if (this.tabLocked().get(id)) return;
    const tabs = this.openTabs();
    const idx = tabs.indexOf(id);
    if (idx === -1) return;

    const newTabs = tabs.filter(t => t !== id);
    this.openTabs.set(newTabs);
    this.messagesByConv.update(m => { const n = new Map(m); n.delete(id); return n; });
    this.tabLocked.update(m => { const n = new Map(m); n.delete(id); return n; });

    if (this.activeConversationId() === id) {
      const nextId = newTabs[idx] ?? newTabs[idx - 1] ?? null;
      this.activeConversationId.set(nextId);
      if (nextId && !this.messagesByConv().has(nextId)) {
        await this.loadMessages(nextId);
      }
    }
  }

  setActiveTab(id: string) {
    this.activeConversationId.set(id);
  }

  toggleTabLock(id: string) {
    this.tabLocked.update(m => {
      const n = new Map(m);
      n.set(id, !n.get(id));
      return n;
    });
  }

  async selectConversation(id: string) {
    await this.openTab(id);
  }

  async setConversationModel(convId: string, modelId: string) {
    await this.wails.setConversationModel(convId, modelId);
    this.conversations.update(cs =>
      cs.map(c => c.id === convId ? { ...c, model: modelId } : c)
    );
  }

  friendlyModelName(modelId: string): string {
    return this.models().find(m => m.id === modelId)?.friendlyName ?? modelId;
  }

  async createConversation(title?: string) {
    const modelId = this.settings().defaultModel || 'gpt-4o';
    const modelDef = this.models().find(m => m.id === modelId);
    const providerId = modelDef?.providerId ?? this.settings().defaultProvider ?? '';
    const conv = await this.wails.createConversation(
      title || 'Nova conversa',
      modelId,
      providerId || 'openai-compat',
    );
    this.conversations.update(c => [conv, ...c]);
    await this.openTab(conv.id);
    return conv;
  }

  friendlyProviderName(providerId: string): string {
    return this.providers().find(p => p.id === providerId)?.name ?? providerId;
  }

  async sendMessage(content: string) {
    const convId = this.activeConversationId();
    if (!convId || !content.trim()) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: convId,
      role: 'user',
      content: content.trim(),
      model: '',
      createdAt: new Date().toISOString(),
    };
    this.pushToConv(convId, userMsg);

    this.error.set(null);
    try {
      await this.wails.sendMessage(convId, content.trim());
    } catch (err: any) {
      this._streamingStates.update(m => { const n = new Map(m); n.delete(convId); return n; });
      this.error.set(typeof err === 'string' ? err : (err?.message ?? 'Erro desconhecido'));
    }
  }

  async submitInteraction(id: string, response: string) {
    this.pendingInteraction.set(null);
    await this.wails.submitToolResponse(id, response);
  }

  async updateConversationTitle(id: string, newTitle: string) {
    if (!newTitle.trim()) return;
    try {
      await this.wails.updateConversation(id, newTitle);
      this.conversations.update(c =>
        c.map(conv => conv.id === id ? { ...conv, title: newTitle } : conv)
      );
    } catch (err: any) {
      console.error('Erro ao renomear conversa:', err);
      throw err;
    }
  }

  async toggleConversationPinned(id: string) {
    try {
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
    } catch (err: any) {
      console.error('Erro ao fixar/desafixar conversa:', err);
      throw err;
    }
  }

  async deleteConversation(id: string) {
    await this.wails.deleteConversation(id);
    this.conversations.update(c => c.filter(x => x.id !== id));

    // Force-close tab even if locked
    const tabs = this.openTabs();
    const idx = tabs.indexOf(id);
    if (idx !== -1) {
      const newTabs = tabs.filter(t => t !== id);
      this.openTabs.set(newTabs);
      this.messagesByConv.update(m => { const n = new Map(m); n.delete(id); return n; });
      this.tabLocked.update(m => { const n = new Map(m); n.delete(id); return n; });

      if (this.activeConversationId() === id) {
        const nextId = newTabs[idx] ?? newTabs[idx - 1] ?? null;
        this.activeConversationId.set(nextId);
        if (nextId && !this.messagesByConv().has(nextId)) {
          await this.loadMessages(nextId);
        }
      }
    } else if (this.activeConversationId() === id) {
      this.activeConversationId.set(null);
    }
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

  private formatMessage(msg: Message): Message {
    const displayMsg = { ...msg };

    if (displayMsg.toolCalls) {
      try {
        const tools = JSON.parse(displayMsg.toolCalls);
        const toolsText = tools.map((t: any) =>
          `\n\n⚙️ Chamando ferramenta: \`${t.name}\`\nParâmetros: ${t.arguments}`
        ).join('');
        displayMsg.content = (displayMsg.content || '') + toolsText;
      } catch (e) {
        console.error("Erro ao parsear toolCalls", e);
      }
    } else if (displayMsg.role === 'tool') {
      displayMsg.content = `<details style="margin-top: 8px; background: rgba(0, 0, 0, 0.1); padding: 8px; border-radius: 6px;">
  <summary style="cursor: pointer; font-weight: bold; opacity: 0.8;">✅ Retorno da ferramenta</summary>
  <pre style="margin-top: 10px; overflow-x: auto; font-size: 0.85em;"><code>${displayMsg.content}</code></pre>
</details>`;
    }

    return displayMsg;
  }
}
