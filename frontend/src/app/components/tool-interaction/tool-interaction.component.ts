import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-tool-interaction',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (chat.pendingInteraction()) {
      <div class="overlay">
        <div class="dialog">

          @switch (chat.pendingInteraction()!.type) {

            @case ('ask_text') {
              <div class="dialog-header">
                <span class="icon">❓</span>
                <span class="title">Pergunta do Agente</span>
              </div>
              <p class="question">{{ chat.pendingInteraction()!.question }}</p>
              <textarea
                class="text-input"
                [(ngModel)]="textValue"
                placeholder="Digite sua resposta..."
                rows="3"
                (keydown)="onTextKeydown($event)"
                autofocus
              ></textarea>
              <div class="actions">
                <button class="btn-primary" (click)="submitText()" [disabled]="!textValue.trim()">
                  Enviar
                </button>
              </div>
            }

            @case ('ask_choice') {
              <div class="dialog-header">
                <span class="icon">❓</span>
                <span class="title">Escolha uma opção</span>
              </div>
              <p class="question">{{ chat.pendingInteraction()!.question }}</p>
              <div class="choices">
                @for (choice of chat.pendingInteraction()!.choices; track choice) {
                  <label class="choice-item" [class.selected]="selectedChoice === choice">
                    <input
                      type="radio"
                      name="choice"
                      [value]="choice"
                      [(ngModel)]="selectedChoice"
                      (change)="customText = ''"
                    />
                    <span>{{ choice }}</span>
                  </label>
                }
              </div>
              <div class="custom-row">
                <span class="or-label">ou</span>
                <input
                  type="text"
                  class="custom-input"
                  [(ngModel)]="customText"
                  placeholder="Alternativa personalizada..."
                  (input)="selectedChoice = ''"
                />
              </div>
              <div class="actions">
                <button
                  class="btn-primary"
                  (click)="submitChoice()"
                  [disabled]="!selectedChoice && !customText.trim()"
                >
                  Confirmar
                </button>
              </div>
            }

            @case ('confirm') {
              <div class="dialog-header">
                <span class="icon warn">⚠️</span>
                <span class="title">Confirmar Ação</span>
              </div>
              <div class="confirm-meta">
                <span class="meta-label">Tool:</span>
                <code class="tool-name">{{ chat.pendingInteraction()!.toolName }}</code>
              </div>
              <pre class="details">{{ chat.pendingInteraction()!.details }}</pre>
              <div class="actions confirm-actions">
                <button class="btn-deny"   (click)="submitConfirm('deny')">Negar</button>
                <div class="allow-group">
                  <button class="btn-allow"  (click)="submitConfirm('allow')">Permitir</button>
                  <button class="btn-always" (click)="submitConfirm('always')">Sempre</button>
                </div>
              </div>
            }

          }

        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(3px);
    }

    .dialog {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 24px;
      width: 480px;
      max-width: calc(100vw - 48px);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .icon { font-size: 1.15em; }
    .icon.warn { color: var(--warning); }
    .title { font-weight: 600; color: var(--text-primary); }

    .question {
      color: var(--text-secondary);
      margin-bottom: 16px;
      line-height: 1.55;
    }

    .text-input {
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.9em;
      padding: 10px 12px;
      resize: vertical;
      outline: none;
      transition: border-color var(--transition-fast);
    }
    .text-input:focus { border-color: var(--accent); }

    .choices {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    .choice-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      cursor: pointer;
      color: var(--text-secondary);
      transition: border-color var(--transition-fast), background var(--transition-fast);
      user-select: none;
    }
    .choice-item:hover { background: var(--bg-hover); border-color: var(--border-default); }
    .choice-item.selected {
      border-color: var(--accent);
      background: var(--accent-glow);
      color: var(--text-primary);
    }
    .choice-item input[type="radio"] { accent-color: var(--accent); }

    .custom-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .or-label { color: var(--text-tertiary); font-size: 0.85em; white-space: nowrap; }
    .custom-input {
      flex: 1;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.9em;
      padding: 8px 12px;
      outline: none;
      transition: border-color var(--transition-fast);
    }
    .custom-input:focus { border-color: var(--accent); }

    .confirm-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .meta-label { color: var(--text-tertiary); font-size: 0.85em; }
    .tool-name {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 2px 8px;
      font-family: var(--font-mono);
      font-size: 0.85em;
      color: var(--accent);
    }

    .details {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 0.82em;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-all;
      margin-bottom: 20px;
      max-height: 140px;
      overflow-y: auto;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
    .confirm-actions {
      justify-content: space-between;
      align-items: center;
    }
    .allow-group { display: flex; gap: 8px; }

    button {
      padding: 8px 18px;
      border-radius: var(--radius-sm);
      border: none;
      font-family: var(--font-sans);
      font-size: 0.88em;
      font-weight: 500;
      cursor: pointer;
      transition: opacity var(--transition-fast), transform 80ms;
    }
    button:active { transform: scale(0.97); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }

    .btn-primary { background: var(--accent); color: var(--text-inverse); }
    .btn-primary:hover:not(:disabled) { background: var(--accent-dim); }

    .btn-allow  { background: var(--success); color: #0e0e10; }
    .btn-always { background: var(--info);    color: #0e0e10; }
    .btn-deny   { background: var(--error);   color: #0e0e10; }
  `]
})
export class ToolInteractionComponent {
  textValue = '';
  selectedChoice = '';
  customText = '';

  constructor(public chat: ChatService) {}

  onTextKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && this.textValue.trim()) {
      event.preventDefault();
      this.submitText();
    }
  }

  submitText() {
    const ia = this.chat.pendingInteraction();
    if (!ia || !this.textValue.trim()) return;
    this.chat.submitInteraction(ia.id, this.textValue.trim());
    this.textValue = '';
  }

  submitChoice() {
    const ia = this.chat.pendingInteraction();
    if (!ia) return;
    const answer = this.customText.trim() || this.selectedChoice;
    if (!answer) return;
    this.chat.submitInteraction(ia.id, answer);
    this.selectedChoice = '';
    this.customText = '';
  }

  submitConfirm(decision: 'allow' | 'always' | 'deny') {
    const ia = this.chat.pendingInteraction();
    if (!ia) return;
    this.chat.submitInteraction(ia.id, decision);
  }
}
