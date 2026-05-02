import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';
import { WailsService } from '../../services/wails.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close()">
      <div class="panel" (click)="$event.stopPropagation()">

        <div class="panel-header">
          <span class="panel-title">Settings</span>
          <button class="btn-close" (click)="close()">✕</button>
        </div>

        <div class="panel-body">
          <section class="section">
            <h3 class="section-title mono">LLM Provider</h3>

            <div class="field">
              <label>Endpoint</label>
              <input
                type="url"
                [(ngModel)]="endpoint"
                placeholder="https://api.openai.com/v1"
                spellcheck="false"
              />
              <span class="hint">Base URL compatível com OpenAI (sem barra final)</span>
            </div>

            <div class="field">
              <label>API Key</label>
              <input
                [type]="showKey ? 'text' : 'password'"
                [(ngModel)]="apiKey"
                placeholder="sk-..."
                spellcheck="false"
                autocomplete="off"
              />
              <button class="btn-toggle-key" (click)="showKey = !showKey">
                {{ showKey ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>

            <div class="field">
              <label>Modelo</label>
              <input
                type="text"
                [(ngModel)]="model"
                placeholder="gpt-4o"
                spellcheck="false"
              />
              <span class="hint">Nome exato do modelo no endpoint configurado</span>
            </div>
          </section>
        </div>

        <div class="panel-footer">
          @if (saved) {
            <span class="saved-msg mono">✓ Salvo</span>
          }
          <button class="btn-cancel" (click)="close()">Cancelar</button>
          <button class="btn-save" (click)="save()" [disabled]="saving">
            {{ saving ? 'Salvando...' : 'Salvar' }}
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .panel {
      width: 480px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
    }

    .panel-header {
      padding: 18px 20px 16px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .panel-title {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
    }

    .btn-close {
      width: 28px;
      height: 28px;
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
    }

    .btn-close:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .panel-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-tertiary);
      margin-bottom: 14px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
      position: relative;
    }

    label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    input {
      padding: 9px 12px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 13px;
      transition: border-color var(--transition-fast);
    }

    input:focus {
      outline: none;
      border-color: var(--accent);
    }

    input::placeholder {
      color: var(--text-tertiary);
      font-family: var(--font-sans);
    }

    .hint {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .btn-toggle-key {
      align-self: flex-start;
      padding: 2px 8px;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      background: transparent;
      color: var(--text-tertiary);
      font-size: 11px;
      cursor: pointer;
      font-family: var(--font-sans);
      transition: all var(--transition-fast);
    }

    .btn-toggle-key:hover {
      background: var(--bg-hover);
      color: var(--text-secondary);
    }

    .panel-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .saved-msg {
      font-size: 12px;
      color: var(--success);
      margin-right: auto;
    }

    .btn-cancel {
      padding: 8px 16px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 13px;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .btn-cancel:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .btn-save {
      padding: 8px 20px;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: var(--text-inverse);
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .btn-save:hover:not(:disabled) {
      background: var(--accent-dim);
    }

    .btn-save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class SettingsComponent implements OnInit {
  endpoint = '';
  apiKey = '';
  model = '';
  showKey = false;
  saving = false;
  saved = false;

  constructor(private chat: ChatService, private wails: WailsService) {}

  async ngOnInit() {
    const s = this.chat.settings();
    this.endpoint = s.llmEndpoint;
    this.apiKey = s.llmApiKey;
    this.model = s.llmModel;
  }

  close() {
    this.chat.showSettings.set(false);
  }

  async save() {
    this.saving = true;
    this.saved = false;
    try {
      await Promise.all([
        this.wails.updateSetting('llm_endpoint', this.endpoint.trim()),
        this.wails.updateSetting('llm_api_key', this.apiKey.trim()),
        this.wails.updateSetting('llm_model', this.model.trim()),
      ]);
      this.chat.settings.update(s => ({
        ...s,
        llmEndpoint: this.endpoint.trim(),
        llmApiKey: this.apiKey.trim(),
        llmModel: this.model.trim(),
      }));
      this.saved = true;
      setTimeout(() => this.close(), 800);
    } finally {
      this.saving = false;
    }
  }
}
