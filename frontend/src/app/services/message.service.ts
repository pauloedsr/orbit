import { Injectable, signal, computed } from '@angular/core';
import { WailsService } from './wails.service';
import { TabService } from './tab.service';
import { Message } from '../models/types';

@Injectable({ providedIn: 'root' })
export class MessageService {
  messagesByConv = signal<Map<string, Message[]>>(new Map());
  isLoading = signal(false);
  error = signal<string | null>(null);

  messages = computed<Message[]>(() => {
    const id = this.tabService.activeConversationId();
    return id ? (this.messagesByConv().get(id) ?? []) : [];
  });

  constructor(private wails: WailsService, private tabService: TabService) {
    this.tabService.registerMessageLoader((id) => this.loadMessages(id));
  }

  async loadMessages(id: string) {
    const isActive = this.tabService.activeConversationId() === id;
    if (isActive) this.isLoading.set(true);
    try {
      const msgs = await this.wails.getMessages(id);
      this.messagesByConv.update(m => new Map(m).set(id, msgs.map(msg => this.formatMessage(msg))));
    } finally {
      if (this.tabService.activeConversationId() === id) this.isLoading.set(false);
    }
  }

  pushToConv(convId: string, msg: Message) {
    this.messagesByConv.update(m => {
      const existing = m.get(convId) ?? [];
      return new Map(m).set(convId, [...existing, msg]);
    });
  }

  evictConv(convId: string) {
    this.messagesByConv.update(m => { const n = new Map(m); n.delete(convId); return n; });
  }

  formatMessage(msg: Message): Message {
    const displayMsg = { ...msg };

    if (displayMsg.toolCalls) {
      try {
        const tools = JSON.parse(displayMsg.toolCalls);
        const toolsText = tools.map((t: any) =>
          `\n\n⚙️ Chamando ferramenta: \`${t.name}\`\nParâmetros: ${t.arguments}`
        ).join('');
        displayMsg.content = (displayMsg.content || '') + toolsText;
      } catch (e) {
        console.error('Erro ao parsear toolCalls', e);
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
