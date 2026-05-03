import { Injectable, signal, computed } from '@angular/core';
import { WailsService } from './wails.service';
import { Conversation, Message, Settings, ToolInteraction, SubAgentSession, SubAgentIteration } from '../models/types';

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
  pendingInteraction = signal<ToolInteraction | null>(null);
  deleteConfirmation = signal<{ id: string; title: string } | null>(null);
  renameConversation = signal<{ id: string; currentTitle: string } | null>(null);
  activeSubAgents = signal<Map<string, SubAgentSession>>(new Map());
  subAgentPanelState = signal<'hidden' | 'visible' | 'fading'>('hidden');
  private subAgentFadeTimer: ReturnType<typeof setTimeout> | null = null;

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
      this.messages.update(msgs => [...msgs, this.formatMessage(msg)]);
      this.isStreaming.set(false);
      this.streamingContent.set('');
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
      this.messages.set(msgs.map(m => this.formatMessage(m)));
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
    if (this.activeConversationId() === id) {
      this.activeConversationId.set(null);
      this.messages.set([]);
    }
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
