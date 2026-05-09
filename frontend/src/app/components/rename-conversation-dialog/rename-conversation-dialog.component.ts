import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiStateService } from '../../services/ui-state.service';
import { ConversationService } from '../../services/conversation.service';

@Component({
  selector: 'app-rename-conversation-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (ui.renameConversation()) {
      <div class="overlay" (click)="onOverlayClick()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <span class="icon">✏️</span>
            <span class="title">Renomear Conversa</span>
          </div>

          <div class="rename-content">
            <p class="instruction-text">Digite o novo nome para a conversa:</p>
            <input
              type="text"
              class="rename-input"
              [(ngModel)]="newTitle"
              placeholder="Novo nome da conversa..."
              (keydown)="onKeydown($event)"
              autofocus
            />
          </div>

          <div class="actions">
            <button class="btn-cancel" (click)="cancel()">
              Cancelar
            </button>
            <button class="btn-save" (click)="confirm()" [disabled]="!newTitle.trim() || isLoading()">
              {{ isLoading() ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
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
      cursor: pointer;
    }

    .dialog {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 24px;
      width: 420px;
      max-width: calc(100vw - 48px);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
      cursor: default;
      animation: slideIn 200ms ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }

    .icon {
      font-size: 1.4em;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .title {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 0.95em;
    }

    .rename-content {
      margin-bottom: 20px;
    }

    .instruction-text {
      color: var(--text-secondary);
      margin-bottom: 10px;
      font-size: 0.9em;
      line-height: 1.5;
    }

    .rename-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 0.9em;
      outline: none;
      transition: border-color var(--transition-fast);
      box-sizing: border-box;
    }

    .rename-input:focus {
      border-color: var(--accent);
      background: var(--bg-secondary);
    }

    .rename-input::placeholder {
      color: var(--text-tertiary);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }

    button {
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      border: none;
      font-family: var(--font-sans);
      font-size: 0.88em;
      font-weight: 500;
      cursor: pointer;
      transition: opacity var(--transition-fast), transform 80ms;
    }

    button:active {
      transform: scale(0.97);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-cancel {
      background: var(--bg-hover);
      color: var(--text-secondary);
      border: 1px solid var(--border-default);
    }

    .btn-cancel:hover:not(:disabled) {
      background: var(--bg-active);
      color: var(--text-primary);
    }

    .btn-save {
      background: var(--accent);
      color: var(--text-inverse);
      font-weight: 600;
    }

    .btn-save:hover:not(:disabled) {
      opacity: 0.9;
    }
  `]
})
export class RenameConversationDialogComponent {
  newTitle = '';
  isLoading = signal(false);

  constructor(public ui: UiStateService, public convService: ConversationService) { }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && this.newTitle.trim() && !this.isLoading()) {
      event.preventDefault();
      this.confirm();
    }
    if (event.key === 'Escape') {
      this.cancel();
    }
  }

  cancel() {
    this.ui.renameConversation.set(null);
    this.newTitle = '';
  }

  async confirm() {
    const renameData = this.ui.renameConversation();
    if (!renameData || !this.newTitle.trim()) return;

    this.isLoading.set(true);
    try {
      await this.convService.updateConversationTitle(renameData.id, this.newTitle.trim());
      this.ui.renameConversation.set(null);
      this.newTitle = '';
    } catch (err) {
      console.error('Erro ao renomear:', err);
      alert('Erro ao renomear a conversa');
    } finally {
      this.isLoading.set(false);
    }
  }

  onOverlayClick() {
    if (!this.isLoading()) {
      this.cancel();
    }
  }
}
