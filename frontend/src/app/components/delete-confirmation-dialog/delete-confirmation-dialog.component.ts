import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-delete-confirmation-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (chat.deleteConfirmation()) {
      <div class="overlay" (click)="onOverlayClick()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <span class="icon danger">🗑️</span>
            <span class="title">Excluir Conversa</span>
          </div>

          <div class="delete-content">
            <p class="warning-text">Tem certeza que deseja excluir a conversa?</p>
            <div class="conversation-preview">
              <span class="preview-label">Conversa:</span>
              <span class="preview-title">{{ chat.deleteConfirmation()!.title }}</span>
            </div>
            <p class="danger-notice">⚠️ Esta ação não pode ser desfeita.</p>
          </div>

          <div class="actions">
            <button class="btn-cancel" (click)="cancel()">
              Cancelar
            </button>
            <button class="btn-delete" (click)="confirm()">
              Excluir
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

    .icon.danger {
      color: var(--error);
    }

    .title {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 0.95em;
    }

    .delete-content {
      margin-bottom: 20px;
    }

    .warning-text {
      color: var(--text-secondary);
      margin-bottom: 12px;
      line-height: 1.55;
      font-size: 0.9em;
    }

    .conversation-preview {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      margin-bottom: 12px;
    }

    .preview-label {
      font-size: 0.8em;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .preview-title {
      color: var(--text-primary);
      font-weight: 500;
      font-size: 0.95em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .danger-notice {
      font-size: 0.85em;
      color: var(--error);
      margin: 0;
      line-height: 1.5;
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

    .btn-cancel {
      background: var(--bg-hover);
      color: var(--text-secondary);
      border: 1px solid var(--border-default);
    }

    .btn-cancel:hover {
      background: var(--bg-active);
      color: var(--text-primary);
    }

    .btn-delete {
      background: var(--error);
      color: #0e0e10;
      font-weight: 600;
    }

    .btn-delete:hover {
      opacity: 0.9;
    }
  `]
})
export class DeleteConfirmationDialogComponent {
  constructor(public chat: ChatService) { }

  cancel() {
    this.chat.deleteConfirmation.set(null);
  }

  async confirm() {
    const confirmation = this.chat.deleteConfirmation();
    if (confirmation) {
      this.chat.deleteConfirmation.set(null);
      await this.chat.deleteConversation(confirmation.id);
    }
  }

  onOverlayClick() {
    this.cancel();
  }
}
