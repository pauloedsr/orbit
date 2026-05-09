import { Component, signal } from '@angular/core';
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
          <span class="logo-icon"><img src="assets/icon.png" alt="Orbit" /></span>
          <span class="logo-text">Orbit</span>
        </div>
        <button class="btn-new wails-no-drag" (click)="newChat()" title="Nova conversa (Ctrl+N)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.5 1.5L12.5 4.5L5.5 11.5H2.5V8.5L9.5 1.5Z"/>
            <line x1="1" y1="13" x2="13" y2="13"/>
          </svg>
        </button>
      </div>

      <div class="conversation-list">
        @for (conv of chat.conversations(); track conv.id) {
          <div class="conv-item-wrapper">
            <button
              class="conv-item"
              [class.active]="conv.id === chat.activeConversationId()"
              (click)="chat.selectConversation(conv.id)"
            >
              <div class="conv-title-row">
                <span class="conv-title">{{ conv.title }}</span>
                @if (chat.isStreamingFor(conv.id)) {
                  <span class="streaming-dot" title="Processando..."></span>
                } @else if (conv.pinned) {
                  <span class="pin-icon">📌</span>
                }
              </div>
              <span class="conv-model mono">{{ shortModel(conv.model) }}</span>
            </button>
            <div class="conv-menu-container">
              <button
                class="btn-menu"
                (click)="toggleMenu(conv.id)"
                title="Opções"
              >
                ⋮
              </button>
              @if (openMenuId() === conv.id) {
                <div class="dropdown-menu wails-no-drag">
                  <button class="dropdown-item" (click)="togglePin(conv.id, conv.pinned)">
                    {{ conv.pinned ? '📌 Desafixar' : '📍 Fixar' }}
                  </button>
                  <button class="dropdown-item" (click)="openRenameDialog(conv.id, conv.title)">
                    ✏️ Renomear
                  </button>
                  <button class="dropdown-item danger" (click)="confirmDelete(conv.id, conv.title)">
                    🗑️ Excluir
                  </button>
                </div>
              }
            </div>
          </div>
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
      width: 240px;
      height: 100%;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 0 12px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 7px;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: -0.02em;
    }

    .logo-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      img {
        width: 15px;
        height: 15px;
      }
    }

    .logo-text {
      color: var(--text-tertiary);
    }

    .btn-new {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
      padding: 0;
    }

    .btn-new:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
    }

    .conv-item-wrapper {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-bottom: 1px;
      position: relative;
    }

    .conv-item {
      flex: 1;
      padding: 8px 10px;
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
      font-size: 12px;
      min-width: 0;
    }

    .conv-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .conv-item.active {
      background: var(--bg-active);
      color: var(--text-primary);
    }

    .conv-title-row {
      display: flex;
      align-items: center;
      gap: 5px;
      overflow: hidden;
    }

    .conv-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .conv-model {
      font-size: 10px;
      color: var(--text-tertiary);
    }

    .pin-icon {
      font-size: 11px;
      flex-shrink: 0;
      opacity: 0.7;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    .streaming-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
      animation: pulse 1.2s ease-in-out infinite;
    }

    .conv-menu-container {
      position: relative;
      flex-shrink: 0;
    }

    .btn-menu {
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
      opacity: 0;
    }

    .conv-item-wrapper:hover .btn-menu {
      opacity: 1;
    }

    .btn-menu:hover {
      background: var(--bg-hover);
      color: var(--text-secondary);
      opacity: 1;
    }

    .dropdown-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      min-width: 150px;
      z-index: 100;
      padding: 4px;
    }

    .dropdown-item {
      width: 100%;
      padding: 7px 10px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 12px;
      text-align: left;
      cursor: pointer;
      transition: all var(--transition-fast);
      border-radius: 4px;
    }

    .dropdown-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .dropdown-item.danger:hover {
      background: rgba(239, 68, 68, 0.12);
      color: var(--error);
    }

    .empty-state {
      padding: 24px 12px;
      text-align: center;
      color: var(--text-tertiary);
      font-size: 12px;
    }

    .hint {
      margin-top: 4px;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-tertiary);
    }

    .sidebar-footer {
      padding: 10px 12px;
      border-top: 1px solid var(--border-subtle);
    }

    .btn-settings {
      width: 100%;
      padding: 7px 10px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      font-family: var(--font-sans);
      font-size: 11px;
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
  openMenuId = signal<string | null>(null);

  constructor(public chat: ChatService) { }

  async newChat() {
    await this.chat.createConversation();
  }

  toggleMenu(convId: string) {
    this.openMenuId.set(this.openMenuId() === convId ? null : convId);
  }

  confirmDelete(convId: string, title: string) {
    this.chat.deleteConfirmation.set({ id: convId, title });
    this.openMenuId.set(null);
  }

  openRenameDialog(convId: string, currentTitle: string) {
    this.chat.renameConversation.set({ id: convId, currentTitle });
    this.openMenuId.set(null);
  }

  async togglePin(convId: string, currentlyPinned: boolean) {
    try {
      await this.chat.toggleConversationPinned(convId);
    } catch (err) {
      console.error('Erro ao fixar/desafixar conversa:', err);
    }
    this.openMenuId.set(null);
  }

  async deleteConversation(convId: string) {
    try {
      await this.chat.deleteConversation(convId);
    } catch (err) {
      console.error('Erro ao excluir conversa:', err);
    }
  }

  shortModel(model: string): string {
    const match = model.match(/claude-(\w+-\d)/);
    return match ? match[1] : model.split('/').pop() || model;
  }
}
