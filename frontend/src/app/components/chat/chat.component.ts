import { Component, ElementRef, ViewChild, AfterViewChecked, signal, computed, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { WailsService } from '../../services/wails.service';
import { ConversationService } from '../../services/conversation.service';
import { MessageService } from '../../services/message.service';
import { StreamService } from '../../services/stream.service';
import { TabService } from '../../services/tab.service';
import { SettingsService } from '../../services/settings.service';
import { UiStateService } from '../../services/ui-state.service';
import { TabBarComponent } from '../tab-bar/tab-bar.component';
import { MentionAutocompleteComponent } from '../mention-autocomplete/mention-autocomplete.component';
import { debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownComponent, TabBarComponent, MentionAutocompleteComponent],
  template: `
    <div class="chat-container">
      <!-- Header -->
      <div class="chat-header wails-drag">
        @if (convService.activeConversation(); as conv) {
          <div class="header-info wails-no-drag">
            <span class="header-title">{{ conv.title }}</span>
            <div class="model-selector" (click)="toggleModelPicker($event)">
              <span class="header-model mono">{{ settings.friendlyModelName(conv.model) }}</span>
              <svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <polyline points="2,3.5 5,6.5 8,3.5"/>
              </svg>
              @if (showModelPicker()) {
                <div class="model-picker" (click)="$event.stopPropagation()">
                  @if (settings.models().length === 0) {
                    <div class="model-empty">Nenhum modelo cadastrado.<br>Adicione em Settings → Modelos.</div>
                  }
                  @for (m of settings.models(); track m.id) {
                    <button
                      class="model-option"
                      [class.selected]="m.id === conv.model"
                      (click)="selectModel(conv.id, m.id)"
                    >
                      <span class="model-opt-name">{{ m.friendlyName }}</span>
                      @if (m.contextWindow) {
                        <span class="model-opt-ctx mono">{{ m.contextWindow }}k</span>
                      }
                    </button>
                  }
                </div>
              }
            </div>
            @if (conv.contextWindowUsage > 0) {
              <div class="ctx-arc" [title]="ctxTitle()">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="var(--bg-tertiary)" stroke-width="2.5"/>
                  <circle cx="10" cy="10" r="8" fill="none"
                    [attr.stroke]="ctxColor()"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-dasharray="50.27"
                    [attr.stroke-dashoffset]="ctxOffset()"
                    transform="rotate(-90 10 10)"/>
                </svg>
              </div>
            }
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
            [title]="ui.sidebarVisible() ? 'Ocultar painel' : 'Mostrar painel'"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1.5" y="1.5" width="12" height="12" rx="2"/>
              <line x1="9.5" y1="1.5" x2="9.5" y2="13.5"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Tab bar -->
      @if (tabService.openTabs().length > 0) {
        <app-tab-bar />
      }

      <!-- Messages -->
      <div class="messages-area" #messagesArea>
        @if (!tabService.activeConversationId()) {
          <div class="welcome">
            <div class="welcome-icon"><img src="assets/icon.png" alt="Orbit" /></div>
            <h2>Orbit</h2>
            <p>CLI power, rich interface.</p>
            <p class="hint mono">Ctrl+N para nova conversa</p>
          </div>
        } @else if (messageService.isLoading()) {
          <div class="loading">Carregando...</div>
        } @else {
          @for (msg of messageService.messages(); track msg.id) {
            <div class="message" [class]="'message-' + msg.role">
              <div class="message-role mono">
                {{ msg.role === 'user' ? '›' : '◉' }}
                {{ msg.role }}
              </div>
              @if (msg.role === 'assistant' && messageThinking(msg); as think) {
                <details class="thinking-block">
                  <summary>💭 Raciocínio</summary>
                  <div class="thinking-content">{{ think }}</div>
                </details>
              }
              <markdown class="message-content" [data]="msg.content" />
            </div>
          }
          @if (messageService.error()) {
            <div class="message-error">
              <span class="mono">⚠</span> {{ messageService.error() }}
            </div>
          }

          @if (streamService.isStreamingFor(tabService.activeConversationId()!)) {
            <div class="message message-assistant">
              <div class="message-role mono">◉ assistant</div>
              @if (streamService.streamingThinkingFor(tabService.activeConversationId()!); as think) {
                <details class="thinking-block" open>
                  <summary>💭 Raciocínio</summary>
                  <div class="thinking-content">{{ think }}</div>
                </details>
              }
              @if (streamService.streamingContentFor(tabService.activeConversationId()!)) {
                <markdown class="message-content" [data]="streamService.streamingContentFor(tabService.activeConversationId()!)" />
              }
              @for (tc of streamService.streamingToolCallsFor(tabService.activeConversationId()!); track tc.index) {
                <div class="tool-call" [class.tool-call--executing]="tc.status === 'executing'" [class.tool-call--done]="tc.status === 'done'">
                  <div class="tool-call-header">
                    <span class="tool-call-icon">
                      @switch (tc.status) {
                        @case ('streaming') { <span class="spin">⟳</span> }
                        @case ('executing') { <span class="spin">⚙</span> }
                        @case ('done')      { ✅ }
                      }
                    </span>
                    <span class="tool-call-name mono">{{ tc.name || '...' }}</span>
                    <span class="tool-call-status mono">
                      @switch (tc.status) {
                        @case ('streaming') { recebendo args }
                        @case ('executing') { executando }
                        @case ('done')      { concluído }
                      }
                    </span>
                  </div>
                  @if (tc.arguments) {
                    <pre class="tool-call-args">{{ tc.arguments }}</pre>
                  }
                  @if (tc.result) {
                    <details class="tool-call-result">
                      <summary>Retorno</summary>
                      <pre>{{ tc.result }}</pre>
                    </details>
                  }
                </div>
              }
              @if (!streamService.streamingContentFor(tabService.activeConversationId()!)
                   && !streamService.streamingThinkingFor(tabService.activeConversationId()!)
                   && streamService.streamingToolCallsFor(tabService.activeConversationId()!).length === 0) {
                <div class="message-content"><span class="cursor-blink">▊</span></div>
              }
            </div>
          }
        }
      </div>

      <!-- Input -->
      @if (tabService.activeConversationId()) {
        <div class="input-area">
          <div class="input-wrapper">
             <app-mention-autocomplete
              [items]="mentionItems"
              (itemSelected)="onMentionItemSelected($event)"
            />
            <textarea
              #inputField
              class="chat-input"
              [(ngModel)]="inputText"
              (keydown)="onKeydown($event)"
              (input)="onInput()"
              placeholder="Mensagem... (use @ para mencionar arquivos)"
              rows="1"
              [disabled]="streamService.isStreamingFor(tabService.activeConversationId()!)"
            ></textarea>
            @if (streamService.isStreamingFor(tabService.activeConversationId()!)) {
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
              [class]="'mode-' + convService.currentMode()"
              (click)="cycleMode()"
              title="Shift+Tab para alternar modo"
            >{{ convService.currentMode().toUpperCase() }}</button>
            @if (currentModelHasThinking()) {
              <button
                class="think-toggle"
                [class.active]="convService.activeConversation()?.thinkingEnabled"
                (click)="toggleThinking()"
                [title]="convService.activeConversation()?.thinkingEnabled ? 'Thinking ligado' : 'Thinking desligado'"
              >💭 {{ convService.activeConversation()?.thinkingEnabled ? 'on' : 'off' }}</button>
            }
            @if (convService.currentMode() === 'plan' && convService.activeConversation()?.planPhase === 'planning' && messageService.messages().length > 0) {
              <button class="btn-implement" (click)="startPlanImplementation()">
                ▶ Iniciar Implementação
              </button>
            }
            @if (convService.currentMode() === 'plan' && convService.activeConversation()?.planPhase === 'implementing') {
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
      overflow: visible;
      position: relative;
      z-index: 10;
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      /* sem overflow:hidden aqui — o dropdown do model picker precisa escapar */
    }

    .header-title {
      font-weight: 600;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 220px;
    }

    .model-selector {
      position: relative;
      display: flex;
      align-items: center;
      gap: 3px;
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 4px;
      transition: background var(--transition-fast);
      flex-shrink: 0;
    }

    .model-selector:hover {
      background: var(--bg-hover);
    }

    .header-model {
      font-size: 11px;
      opacity: 0.6;
    }

    .model-picker {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 200px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      z-index: 200;
      padding: 4px;
    }

    .model-empty {
      padding: 10px 12px;
      font-size: 12px;
      color: var(--text-tertiary);
      line-height: 1.5;
    }

    .model-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
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
      gap: 8px;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .model-option:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .model-option.selected {
      color: var(--accent);
    }

    .model-opt-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .model-opt-ctx {
      font-size: 10px;
      color: var(--text-tertiary);
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
      position: relative;
    }

    .input-wrapper {
        position: relative;
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

    .ctx-arc {
      display: flex;
      align-items: center;
      cursor: default;
      opacity: 0.8;
      transition: opacity 0.2s;
      flex-shrink: 0;
    }
    .ctx-arc:hover { opacity: 1; }
    .ctx-arc circle:last-child {
      transition: stroke-dashoffset 0.6s ease, stroke 0.4s ease;
    }

    .thinking-block {
      margin: 4px 0 8px;
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border-left: 2px solid var(--border-default);
      border-radius: 3px;
      font-size: 12px;
      color: var(--text-tertiary);
    }
    .thinking-block summary {
      cursor: pointer;
      user-select: none;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      padding: 2px 0;
    }
    .thinking-block .thinking-content {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dashed var(--border-subtle);
      white-space: pre-wrap;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.5;
    }

    .tool-call {
      margin: 6px 0;
      padding: 8px 10px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-left: 2px solid var(--accent-dim);
      border-radius: 4px;
      font-size: 12px;
    }
    .tool-call--executing { border-left-color: var(--warning); }
    .tool-call--done      { border-left-color: var(--success); }
    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tool-call-icon { font-size: 12px; }
    .tool-call-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
    }
    .tool-call-status {
      font-size: 10px;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-left: auto;
    }
    .tool-call-args {
      margin: 6px 0 0;
      padding: 6px 8px;
      background: var(--bg-tertiary);
      border-radius: 3px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 160px;
      overflow-y: auto;
    }
    .tool-call-result {
      margin-top: 6px;
    }
    .tool-call-result summary {
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-tertiary);
    }
    .tool-call-result pre {
      margin-top: 6px;
      padding: 6px 8px;
      background: var(--bg-tertiary);
      border-radius: 3px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin {
      display: inline-block;
      animation: spin 1.2s linear infinite;
      color: var(--accent);
    }

    .think-toggle {
      padding: 3px 8px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      font-family: var(--font-sans);
      font-size: 11px;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .think-toggle:hover { background: var(--bg-hover); color: var(--text-secondary); }
    .think-toggle.active {
      background: var(--bg-active);
      border-color: var(--accent);
      color: var(--accent);
    }
  `]
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('messagesArea') private messagesArea!: ElementRef;
  @ViewChild('inputField') private inputField!: ElementRef;
  @ViewChild(MentionAutocompleteComponent) private mentionAutocomplete!: MentionAutocompleteComponent;

  inputText = '';
  isConnected = signal(false);
  showModelPicker = signal(false);

  // Lógica de Menção
  isMentioning = signal(false);
  mentionQuery = signal('');
  mentionItems = signal<string[]>([]);
  private mentionQuery$ = new Subject<string | null>();
  private mentionTriggerIndex = -1;


  private readonly CTX_CIRCUMFERENCE = 2 * Math.PI * 8;

  ctxOffset = computed(() => {
    const pct = this.convService.activeConversation()?.contextWindowUsage ?? 0;
    return this.CTX_CIRCUMFERENCE * (1 - pct / 100);
  });

  ctxColor = computed(() => {
    const pct = this.convService.activeConversation()?.contextWindowUsage ?? 0;
    if (pct >= 90) return 'var(--error)';
    if (pct >= 70) return 'var(--warning)';
    return 'var(--success)';
  });

  ctxTitle = computed(() => {
    const pct = this.convService.activeConversation()?.contextWindowUsage ?? 0;
    return `${Math.round(pct)}% da janela de contexto usada`;
  });

  private shouldScroll = false;

  constructor(
    public convService: ConversationService,
    public messageService: MessageService,
    public streamService: StreamService,
    public tabService: TabService,
    public settings: SettingsService,
    public ui: UiStateService,
    private wails: WailsService,
  ) {
    this.checkConnection();

    this.mentionQuery$.pipe(debounceTime(200)).subscribe(async query => {
        if (query === null) {
            this.mentionItems.set([]);
            return;
        }
        try {
            const files = await (window as any).go.main.App.SearchFiles({ pattern: query });
            this.mentionItems.set(files || []);
        } catch (error) {
            console.error('Error searching files for mention:', error);
            this.mentionItems.set([]);
        }
    });

    effect(() => {
      this.messageService.messages();
      const activeId = this.tabService.activeConversationId();
      if (activeId) {
        this.streamService.streamingContentFor(activeId);
      }
      this.shouldScroll = true;
    });
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && event.shiftKey) {
      const convId = this.tabService.activeConversationId();
      if (convId) {
        event.preventDefault();
        this.convService.cycleMode(convId);
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
    // Esconde o autocompletar ao enviar
    this.isMentioning.set(false);
    this.mentionItems.set([]);

    const convId = this.tabService.activeConversationId();
    if (!this.inputText.trim() || !convId || this.streamService.isStreamingFor(convId)) return;

    const content = this.inputText;
    this.inputText = '';
    this.shouldScroll = true;

    await this.streamService.sendMessage(content);
    if (this.tabService.activeConversationId()) {
      await this.messageService.loadMessages(this.tabService.activeConversationId()!);
    }
    this.shouldScroll = true;

    setTimeout(() => this.inputField?.nativeElement?.focus(), 50);
  }

  cycleMode() {
    const convId = this.tabService.activeConversationId();
    if (convId) this.convService.cycleMode(convId);
  }

  async startPlanImplementation() {
    const convId = this.tabService.activeConversationId();
    if (!convId) return;
    await this.convService.startPlanImplementation(convId);
    await this.streamService.sendMessage('Iniciando implementação conforme o plano.');
  }

  toggleSidebar() {
    this.ui.sidebarVisible.set(!this.ui.sidebarVisible());
  }

  toggleModelPicker(event: MouseEvent) {
    event.stopPropagation();
    this.showModelPicker.set(!this.showModelPicker());
  }

  async selectModel(convId: string, modelId: string) {
    this.showModelPicker.set(false);
    await this.convService.setConversationModel(convId, modelId);
  }

  currentModelHasThinking(): boolean {
    const conv = this.convService.activeConversation();
    if (!conv) return false;
    const m = this.settings.models().find(x => x.id === conv.model);
    return !!(m && m.thinkingField && m.thinkingField.trim().length > 0);
  }

  async toggleThinking() {
    const conv = this.convService.activeConversation();
    if (!conv) return;
    const next = !conv.thinkingEnabled;
    await (window as any).go.main.App.SetConversationThinkingEnabled(conv.id, next);
    this.convService.conversations.update(cs =>
      cs.map(c => c.id === conv.id ? { ...c, thinkingEnabled: next } : c)
    );
  }

  messageThinking(msg: any): string | null {
    if (!msg?.metadata) return null;
    try {
      const parsed = JSON.parse(msg.metadata);
      const v = parsed?.['reasoning.content'];
      return typeof v === 'string' && v.length > 0 ? v : null;
    } catch {
      return null;
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showModelPicker.set(false);
  }

  stop() {
    const convId = this.tabService.activeConversationId();
    if (convId) this.streamService.stopStream(convId);
  }

  onKeydown(event: KeyboardEvent) {
    if (this.isMentioning() && this.mentionItems().length > 0) {
      // Passa o evento para o componente de autocompletar
      this.mentionAutocomplete.handleKeyDown(event);
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key)) {
        event.preventDefault(); // Impede o comportamento padrão (ex: enviar formulário)
      }
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  onInput(): void {
    const text = this.inputText;
    const cursorPosition = this.inputField.nativeElement.selectionStart;

    const atIndex = text.lastIndexOf('@', cursorPosition - 1);

    if (atIndex !== -1) {
        const charBefore = text[atIndex - 1];
        if (charBefore && !/\s/.test(charBefore)) {
            // É um email ou algo do tipo, não um gatilho de menção
            this.isMentioning.set(false);
            this.mentionQuery$.next(null);
            return;
        }

        const query = text.substring(atIndex + 1, cursorPosition);
        this.isMentioning.set(true);
        this.mentionTriggerIndex = atIndex;
        this.mentionQuery.set(query);
        this.mentionQuery$.next(query ? `**/*${query}*` : '**/*'); // Usa glob para buscar
    } else {
        this.isMentioning.set(false);
        this.mentionQuery$.next(null);
    }
  }

  onMentionItemSelected(selectedItem: string): void {
    const text = this.inputText;
    const start = this.mentionTriggerIndex;
    const end = this.mentionTriggerIndex + this.mentionQuery().length + 1;

    // Adiciona um espaço após o item selecionado, se não for o final da string
    const suffix = text.substring(end).length > 0 ? text.substring(end) : ' ';
    this.inputText = text.substring(0, start) + `@'${selectedItem}'` + suffix;

    this.isMentioning.set(false);
    this.mentionItems.set([]);

    // Reposiciona o cursor
    setTimeout(() => {
        const newCursorPos = start + selectedItem.length + 3; // +2 for quotes, +1 for space
        this.inputField.nativeElement.focus();
        this.inputField.nativeElement.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  private scrollToBottom() {
    try {
      const el = this.messagesArea?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { }
  }
}
