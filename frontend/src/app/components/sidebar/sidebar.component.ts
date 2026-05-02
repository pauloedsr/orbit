import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="sidebar">
      <div class="sidebar-header wails-drag">
        <div class="logo wails-no-drag">
          <span class="logo-icon">◉</span>
          <span class="logo-text">Orbit</span>
        </div>
        <button class="btn-new wails-no-drag" (click)="newChat()" title="Nova conversa (Ctrl+N)">
          +
        </button>
      </div>

      <div class="conversation-list">
        @for (conv of chat.conversations(); track conv.id) {
          <button
            class="conv-item"
            [class.active]="conv.id === chat.activeConversationId()"
            (click)="chat.selectConversation(conv.id)"
          >
            <span class="conv-title">{{ conv.title }}</span>
            <span class="conv-model mono">{{ shortModel(conv.model) }}</span>
          </button>
        } @empty {
          <div class="empty-state">
            <p>Nenhuma conversa</p>
            <p class="hint">Ctrl+N para começar</p>
          </div>
        }
      </div>

      <div class="sidebar-footer">
        <button class="btn-settings" title="Configurações" (click)="chat.showSettings.set(true)">
          ⚙ Settings
        </button>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: 260px;
      height: 100%;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.02em;
    }

    .logo-icon {
      color: var(--accent);
      font-size: 18px;
    }

    .btn-new {
      width: 28px;
      height: 28px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
    }

    .btn-new:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--border-strong);
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .conv-item {
      width: 100%;
      padding: 10px 12px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: all var(--transition-fast);
      font-family: var(--font-sans);
      font-size: 13px;
    }

    .conv-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .conv-item.active {
      background: var(--bg-active);
      color: var(--text-primary);
    }

    .conv-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conv-model {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .empty-state {
      padding: 24px 16px;
      text-align: center;
      color: var(--text-tertiary);
      font-size: 13px;
    }

    .hint {
      margin-top: 4px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border-subtle);
    }

    .btn-settings {
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      font-family: var(--font-sans);
      font-size: 12px;
      cursor: pointer;
      text-align: left;
      transition: all var(--transition-fast);
    }

    .btn-settings:hover {
      background: var(--bg-hover);
      color: var(--text-secondary);
    }
  `]
})
export class SidebarComponent {
  constructor(public chat: ChatService) {}

  async newChat() {
    await this.chat.createConversation();
  }

  shortModel(model: string): string {
    // claude-sonnet-4-20250514 → sonnet-4
    const match = model.match(/claude-(\w+-\d)/);
    return match ? match[1] : model.split('/').pop() || model;
  }
}
