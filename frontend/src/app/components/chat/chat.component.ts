import { Component, ElementRef, ViewChild, AfterViewChecked, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { ChatService } from '../../services/chat.service';
import { WailsService } from '../../services/wails.service';
import { TabBarComponent } from '../tab-bar/tab-bar.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownComponent, TabBarComponent],
  template: `
    <div class="chat-container">
      <!-- Header -->
      <div class="chat-header wails-drag">
        @if (chat.activeConversation(); as conv) {
          <div class="header-info wails-no-drag">
            <span class="header-title">{{ conv.title }}</span>
            <span class="header-model mono">{{ conv.model }}</span>
          </div>
        } @else {
          <div class="header-info wails-no-drag">
            <span class="header-title" style="color: var(--text-tertiary)">Orbit</span>
          </div>
        }
        <div class="header-actions wails-no-drag">
          <div class="header-status">
            <span class="status-dot" [class.connected]="isConnected()"></span>
            <span class="status-text mono">{{ isConnected() ? 'IPC OK' : 'mock' }}</span>
          </div>
          <button
            class="btn-toggle-sidebar"
            (click)="toggleSidebar()"
            [title]="chat.sidebarVisible() ? 'Ocultar painel' : 'Mostrar painel'"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1.5" y="1.5" width="12" height="12" rx="2"/>
              <line x1="9.5" y1="1.5" x2="9.5" y2="13.5"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Tab bar -->
      @if (chat.openTabs().length > 0) {
        <app-tab-bar />
      }

      <!-- Messages -->
      <div class="messages-area" #messagesArea>
        @if (!chat.activeConversationId()) {
          <div class="welcome">
            <div class="welcome-icon"><img src="assets/icon.png" alt="Orbit" /></div>
            <h2>Orbit</h2>
            <p>CLI power, rich interface.</p>
            <p class="hint mono">Ctrl+N para nova conversa</p>
          </div>
        } @else if (chat.isLoading()) {
          <div class="loading">Carregando...</div>
        } @else {
          @for (msg of chat.messages(); track msg.id) {
            <div class="message" [class]="'message-' + msg.role">
              <div class="message-role mono">
                {{ msg.role === 'user' ? '›' : '◉' }}
                {{ msg.role }}
              </div>
              <markdown class="message-content" [data]="msg.content" />
            </div>
          }

          @if (chat.error()) {
            <div class="message-error">
              <span class="mono">⚠</span> {{ chat.error() }}
            </div>
          }

          @if (chat.isStreamingFor(chat.activeConversationId()!)) {
            <div class="message message-assistant">
              <div class="message-role mono">◉ assistant</div>
              @if (chat.streamingContentFor(chat.activeConversationId()!)) {
                <markdown class="message-content" [data]="chat.streamingContentFor(chat.activeConversationId()!)" />
              } @else {
                <div class="message-content"><span class="cursor-blink">▊</span></div>
              }
            </div>
          }
        }
      </div>

      <!-- Input -->
      @if (chat.activeConversationId()) {
        <div class="input-area">
          <div class="input-row">
            <textarea
              #inputField
              class="chat-input"
              [(ngModel)]="inputText"
              (keydown)="onKeydown($event)"
              placeholder="Mensagem... (Enter para enviar, Shift+Enter para nova linha)"
              rows="1"
              [disabled]="chat.isStreamingFor(chat.activeConversationId()!)"
            ></textarea>
            @if (chat.isStreamingFor(chat.activeConversationId()!)) {
              <button class="btn-stop" (click)="stop()" title="Parar geração">■</button>
            } @else {
              <button
                class="btn-send"
                (click)="send()"
                [disabled]="!inputText.trim()"
              >↵</button>
            }
          </div>
          <div class="input-meta">
            <button
              class="mode-badge"
              [class]="'mode-' + chat.currentMode()"
              (click)="cycleMode()"
              title="Shift+Tab para alternar modo"
            >{{ chat.currentMode().toUpperCase() }}</button>
            @if (chat.currentMode() === 'plan' && chat.activeConversation()?.planPhase === 'planning' && chat.messages().length > 0) {
              <button class="btn-implement" (click)="startPlanImplementation()">
                ▶ Iniciar Implementação
              </button>
            }
            @if (chat.currentMode() === 'plan' && chat.activeConversation()?.planPhase === 'implementing') {
              <span class="plan-phase-badge">implementando</span>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .chat-container {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-primary);
    }

    .chat-header {
      padding: 0 16px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      flex-shrink: 0;
    }

    .header-info {
      display: flex;
      align-items: baseline;
      gap: 10px;
      overflow: hidden;
    }

    .header-title {
      font-weight: 600;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-model {
      font-size: 11px;
      color: var(--text-tertiary);
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      flex-shrink: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .header-status {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--error);
    }

    .status-dot.connected {
      background: var(--success);
    }

    .status-text {
      font-size: 10px;
    }

    .btn-toggle-sidebar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .btn-toggle-sidebar:hover {
      background: var(--bg-hover);
      color: var(--text-secondary);
    }

    /* Messages */
    .messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 16px 0;
    }

    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-tertiary);
      gap: 8px;
    }

    .welcome-icon {
      color: var(--accent);
      height: 60px;
      img {
        width: 50px;
        height: 50px;
      }
    }

    .welcome h2 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.03em;
    }

    .welcome .hint {
      margin-top: 12px;
      font-size: 12px;
      padding: 4px 10px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
    }

    .loading {
      padding: 40px;
      text-align: center;
      color: var(--text-tertiary);
      font-family: var(--font-mono);
      font-size: 12px;
    }

    .message {
      padding: 12px 24px;
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }

    .message-user {
      border-left: 2px solid var(--accent-dim);
    }

    .message-assistant {
      border-left: 2px solid var(--border-subtle);
    }

    .message-role {
      font-size: 11px;
      color: var(--text-tertiary);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .message-user .message-role {
      color: var(--accent-dim);
    }

    .message-content {
      font-size: 14px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message-error {
      max-width: 800px;
      margin: 8px auto;
      width: 100%;
      padding: 10px 24px;
      color: var(--error);
      font-size: 13px;
      border-left: 2px solid var(--error);
    }

    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    .cursor-blink {
      animation: blink 800ms infinite;
      color: var(--accent);
      font-size: 14px;
    }

    /* Input */
    .input-area {
      padding: 12px 20px 16px;
      border-top: 1px solid var(--border-subtle);
      max-width: 840px;
      margin: 0 auto;
      width: 100%;
    }

    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .input-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }

    .mode-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      border: 1px solid currentColor;
      cursor: pointer;
      background: transparent;
      transition: all var(--transition-fast);
    }

    .mode-ask {
      color: #5b9cf6;
      border-color: #5b9cf640;
    }
    .mode-ask:hover { background: #5b9cf615; }

    .mode-edit {
      color: var(--accent);
      border-color: var(--accent-dim);
    }
    .mode-edit:hover { background: var(--accent-dim); opacity: 0.8; }

    .mode-plan {
      color: #a78bfa;
      border-color: #a78bfa40;
    }
    .mode-plan:hover { background: #a78bfa15; }

    .btn-implement {
      font-size: 12px;
      padding: 3px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid #a78bfa60;
      background: transparent;
      color: #a78bfa;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .btn-implement:hover {
      background: #a78bfa20;
    }

    .plan-phase-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      color: #a78bfa;
      opacity: 0.7;
      letter-spacing: 0.05em;
    }

    .chat-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      resize: none;
      min-height: 42px;
      max-height: 200px;
      transition: border-color var(--transition-fast);
    }

    .chat-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .chat-input::placeholder {
      color: var(--text-tertiary);
    }

    .chat-input:disabled {
      opacity: 0.5;
    }

    .btn-send {
      width: 42px;
      height: 42px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .btn-send:hover:not(:disabled) {
      background: var(--accent);
      color: var(--text-inverse);
      border-color: var(--accent);
    }

    .btn-send:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .btn-stop {
      width: 42px;
      height: 42px;
      border: 1px solid var(--error);
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--error);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .btn-stop:hover {
      background: var(--error);
      color: #fff;
    }
  `]
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('messagesArea') private messagesArea!: ElementRef;
  @ViewChild('inputField') private inputField!: ElementRef;

  inputText = '';
  isConnected = signal(false);

  private shouldScroll = false;

  constructor(
    public chat: ChatService,
    private wails: WailsService
  ) {
    this.checkConnection();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && event.shiftKey) {
      const convId = this.chat.activeConversationId();
      if (convId) {
        event.preventDefault();
        this.chat.cycleMode(convId);
      }
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  async checkConnection() {
    try {
      const pong = await this.wails.ping();
      this.isConnected.set(!pong.includes('mock'));
    } catch {
      this.isConnected.set(false);
    }
  }

  async send() {
    const convId = this.chat.activeConversationId();
    if (!this.inputText.trim() || !convId || this.chat.isStreamingFor(convId)) return;

    const content = this.inputText;
    this.inputText = '';
    this.shouldScroll = true;

    await this.chat.sendMessage(content);
    this.shouldScroll = true;

    setTimeout(() => this.inputField?.nativeElement?.focus(), 50);
  }

  cycleMode() {
    const convId = this.chat.activeConversationId();
    if (convId) this.chat.cycleMode(convId);
  }

  async startPlanImplementation() {
    const convId = this.chat.activeConversationId();
    if (!convId) return;
    await this.chat.startPlanImplementation(convId);
    await this.chat.sendMessage('Iniciando implementação conforme o plano.');
  }

  toggleSidebar() {
    this.chat.sidebarVisible.set(!this.chat.sidebarVisible());
  }

  stop() {
    const convId = this.chat.activeConversationId();
    if (convId) this.wails.stopStream(convId);
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private scrollToBottom() {
    try {
      const el = this.messagesArea?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { }
  }
}
