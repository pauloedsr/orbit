import { Component, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabService } from '../../services/tab.service';
import { ConversationService } from '../../services/conversation.service';
import { StreamService } from '../../services/stream.service';
import { UiStateService } from '../../services/ui-state.service';

interface ContextMenu {
  id: string;
  x: number;
  y: number;
}

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tab-bar" (click)="closeContextMenu()">
      @for (tabId of tabService.openTabs(); track tabId) {
        @if (convFor(tabId); as conv) {
          <div
            class="tab"
            [class.active]="tabId === tabService.activeConversationId()"
            [class.locked]="tabService.tabLocked().get(tabId)"
            (click)="activate(tabId, $event)"
            (contextmenu)="onContextMenu($event, tabId)"
            (dblclick)="rename(tabId, conv.title)"
            title="{{ conv.title }}"
          >
            @if (streamService.isStreamingFor(tabId)) {
              <span class="tab-streaming-dot"></span>
            } @else if (tabService.tabLocked().get(tabId)) {
              <span class="tab-lock-icon">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <rect x="2" y="4.5" width="6" height="4.5" rx="1"/>
                  <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5"/>
                </svg>
              </span>
            }
            <span class="tab-title">{{ conv.title }}</span>
            @if (!tabService.tabLocked().get(tabId)) {
              <button
                class="tab-close"
                (click)="close(tabId, $event)"
                title="Fechar aba"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <line x1="1" y1="1" x2="8" y2="8"/>
                  <line x1="8" y1="1" x2="1" y2="8"/>
                </svg>
              </button>
            } @else {
              <span class="tab-close-placeholder"></span>
            }
          </div>
        }
      }
    </div>

    @if (contextMenu()) {
      <div
        class="context-menu"
        [style.left.px]="contextMenu()!.x"
        [style.top.px]="contextMenu()!.y"
        (click)="$event.stopPropagation()"
      >
        @if (convFor(contextMenu()!.id); as conv) {
          <button class="ctx-item" (click)="rename(contextMenu()!.id, conv.title); closeContextMenu()">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M8 1.5L10.5 4 4.5 10H2V7.5L8 1.5Z"/>
            </svg>
            Renomear
          </button>
          <button class="ctx-item" (click)="tabService.toggleTabLock(contextMenu()!.id); closeContextMenu()">
            @if (tabService.tabLocked().get(contextMenu()!.id)) {
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <rect x="2" y="5.5" width="8" height="5.5" rx="1.5"/>
                <path d="M4 5.5V3.5a2 2 0 0 1 4 0v2"/>
                <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor"/>
              </svg>
              Desbloquear
            } @else {
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <rect x="2" y="5.5" width="8" height="5.5" rx="1.5"/>
                <path d="M4 5.5V3.5a2 2 0 0 1 4 0v2"/>
              </svg>
              Bloquear
            }
          </button>
          <div class="ctx-divider"></div>
          <button class="ctx-item danger" [disabled]="!!tabService.tabLocked().get(contextMenu()!.id)" (click)="close(contextMenu()!.id); closeContextMenu()">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="2" y1="2" x2="10" y2="10"/>
              <line x1="10" y1="2" x2="2" y2="10"/>
            </svg>
            Fechar
          </button>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      position: relative;
    }

    .tab-bar {
      display: flex;
      align-items: stretch;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-subtle);
      overflow-x: auto;
      scrollbar-width: none;
      min-height: 34px;
    }

    .tab-bar::-webkit-scrollbar {
      display: none;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 0 10px;
      min-width: 100px;
      max-width: 180px;
      height: 34px;
      cursor: pointer;
      border-right: 1px solid var(--border-subtle);
      color: var(--text-tertiary);
      font-size: 12px;
      font-family: var(--font-sans);
      transition: background var(--transition-fast), color var(--transition-fast);
      user-select: none;
      position: relative;
      flex-shrink: 0;
    }

    .tab:hover {
      background: var(--bg-hover);
      color: var(--text-secondary);
    }

    .tab.active {
      background: var(--bg-primary);
      color: var(--text-primary);
      box-shadow: inset 0 -2px 0 var(--accent);
    }

    .tab.locked {
      opacity: 0.85;
    }

    .tab-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    .tab-streaming-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
      animation: pulse 1.2s ease-in-out infinite;
    }

    .tab-lock-icon {
      display: flex;
      align-items: center;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .tab-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      border-radius: 3px;
      flex-shrink: 0;
      padding: 0;
      opacity: 0;
      transition: opacity var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
    }

    .tab:hover .tab-close,
    .tab.active .tab-close {
      opacity: 1;
    }

    .tab-close:hover {
      background: var(--bg-hover);
      color: var(--error);
    }

    .tab-close-placeholder {
      width: 16px;
      flex-shrink: 0;
    }

    /* Context menu */
    .context-menu {
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      min-width: 160px;
      z-index: 1000;
      padding: 4px;
    }

    .ctx-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 10px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 12px;
      text-align: left;
      cursor: pointer;
      border-radius: 4px;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .ctx-item:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .ctx-item:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .ctx-item.danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.12);
      color: var(--error);
    }

    .ctx-divider {
      height: 1px;
      background: var(--border-subtle);
      margin: 3px 0;
    }
  `]
})
export class TabBarComponent {
  contextMenu = signal<ContextMenu | null>(null);

  constructor(
    public tabService: TabService,
    public convService: ConversationService,
    public streamService: StreamService,
    public ui: UiStateService,
    private el: ElementRef,
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.el.nativeElement.contains(event.target)) {
      this.contextMenu.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.contextMenu.set(null);
  }

  convFor(id: string) {
    return this.convService.conversations().find(c => c.id === id) ?? null;
  }

  activate(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.tabService.setActiveTab(id);
    this.contextMenu.set(null);
  }

  close(id: string, event?: MouseEvent) {
    event?.stopPropagation();
    this.tabService.closeTab(id);
  }

  rename(id: string, currentTitle: string) {
    this.ui.renameConversation.set({ id, currentTitle });
  }

  onContextMenu(event: MouseEvent, id: string) {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.set({ id, x: event.clientX, y: event.clientY });
  }

  closeContextMenu() {
    this.contextMenu.set(null);
  }
}
