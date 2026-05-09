import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';
import { WailsService } from '../../services/wails.service';
import { ModelDef } from '../../models/types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close()">
      <div class="panel" (click)="$event.stopPropagation()">

        <div class="panel-header">
          <span class="panel-title">Settings</span>
          <div class="panel-tabs">
            <button class="tab-btn" [class.active]="activeTab() === 'provider'" (click)="activeTab.set('provider')">Provider</button>
            <button class="tab-btn" [class.active]="activeTab() === 'models'" (click)="activeTab.set('models')">Modelos</button>
          </div>
          <button class="btn-close" (click)="close()">✕</button>
        </div>

        <div class="panel-body">

          <!-- Tab: Provider -->
          @if (activeTab() === 'provider') {
            <section class="section">
              <h3 class="section-title mono">LLM Provider</h3>

              <div class="field">
                <label>Endpoint</label>
                <input type="url" [(ngModel)]="endpoint" placeholder="https://api.openai.com/v1" spellcheck="false" />
                <span class="hint">Base URL compatível com OpenAI (sem barra final)</span>
              </div>

              <div class="field">
                <label>API Key</label>
                <input [type]="showKey ? 'text' : 'password'" [(ngModel)]="apiKey" placeholder="sk-..." spellcheck="false" autocomplete="off" />
                <button class="btn-toggle-key" (click)="showKey = !showKey">{{ showKey ? 'Ocultar' : 'Mostrar' }}</button>
              </div>

              <div class="field">
                <label>Modelo padrão (fallback)</label>
                <input type="text" [(ngModel)]="model" placeholder="gpt-4o" spellcheck="false" />
                <span class="hint">Usado quando a conversa não tem modelo selecionado</span>
              </div>
            </section>
          }

          <!-- Tab: Modelos -->
          @if (activeTab() === 'models') {
            <section class="section">
              <h3 class="section-title mono">Modelos cadastrados</h3>

              <!-- Lista -->
              @if (chat.models().length > 0) {
                <div class="model-list">
                  @for (m of chat.models(); track m.id) {
                    @if (editingId() === m.id) {
                      <div class="model-form editing">
                        <div class="form-row">
                          <div class="field-sm">
                            <label>ID (API)</label>
                            <input type="text" [(ngModel)]="form.id" placeholder="gpt-4o" spellcheck="false" [disabled]="true" />
                          </div>
                          <div class="field-sm">
                            <label>Nome amigável</label>
                            <input type="text" [(ngModel)]="form.friendlyName" placeholder="GPT-4o" spellcheck="false" />
                          </div>
                          <div class="field-sm">
                            <label>Contexto (k tokens)</label>
                            <input type="number" [(ngModel)]="form.contextWindow" placeholder="128" />
                          </div>
                        </div>
                        <div class="form-row">
                          <div class="field-sm">
                            <label>Temperature</label>
                            <input type="number" [(ngModel)]="form.temperature" placeholder="padrão do modelo" step="0.01" min="0" max="2" />
                          </div>
                          <div class="field-sm">
                            <label>Top P</label>
                            <input type="number" [(ngModel)]="form.topP" placeholder="padrão do modelo" step="0.01" min="0" max="1" />
                          </div>
                          <div class="field-sm">
                            <label>Max Tokens</label>
                            <input type="number" [(ngModel)]="form.maxTokens" placeholder="padrão do modelo" />
                          </div>
                        </div>
                        <div class="form-actions">
                          <button class="btn-sm btn-primary" (click)="saveEdit()" [disabled]="!form.friendlyName.trim()">Salvar</button>
                          <button class="btn-sm btn-ghost" (click)="cancelEdit()">Cancelar</button>
                        </div>
                      </div>
                    } @else {
                      <div class="model-row">
                        <div class="model-row-info">
                          <span class="model-row-name">{{ m.friendlyName }}</span>
                          <span class="model-row-id mono">{{ m.id }}</span>
                          <div class="model-row-params">
                            @if (m.contextWindow) { <span class="param-chip">{{ m.contextWindow }}k</span> }
                            @if (m.temperature !== null) { <span class="param-chip">t={{ m.temperature }}</span> }
                            @if (m.topP !== null) { <span class="param-chip">p={{ m.topP }}</span> }
                            @if (m.maxTokens !== null) { <span class="param-chip">max={{ m.maxTokens }}</span> }
                          </div>
                        </div>
                        <div class="model-row-actions">
                          <button class="btn-icon" (click)="startEdit(m)" title="Editar">
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                              <path d="M8.5 1.5L11.5 4.5L5 11H2V8L8.5 1.5Z"/>
                            </svg>
                          </button>
                          <button class="btn-icon danger" (click)="deleteModel(m.id)" title="Excluir">
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                              <polyline points="1,3 12,3"/>
                              <path d="M4,3V2a1,1 0 0 1,1-1h3a1,1 0 0 1,1,1v1"/>
                              <rect x="2" y="3" width="9" height="9" rx="1"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    }
                  }
                </div>
              } @else {
                <p class="empty-hint">Nenhum modelo cadastrado ainda.</p>
              }

              <!-- Formulário de novo modelo -->
              @if (addingNew()) {
                <div class="model-form">
                  <div class="form-row">
                    <div class="field-sm">
                      <label>ID (API) *</label>
                      <input type="text" [(ngModel)]="form.id" placeholder="gpt-4o" spellcheck="false" />
                    </div>
                    <div class="field-sm">
                      <label>Nome amigável *</label>
                      <input type="text" [(ngModel)]="form.friendlyName" placeholder="GPT-4o" spellcheck="false" />
                    </div>
                    <div class="field-sm">
                      <label>Contexto (k tokens)</label>
                      <input type="number" [(ngModel)]="form.contextWindow" placeholder="128" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="field-sm">
                      <label>Temperature</label>
                      <input type="number" [(ngModel)]="form.temperature" placeholder="padrão do modelo" step="0.01" min="0" max="2" />
                    </div>
                    <div class="field-sm">
                      <label>Top P</label>
                      <input type="number" [(ngModel)]="form.topP" placeholder="padrão do modelo" step="0.01" min="0" max="1" />
                    </div>
                    <div class="field-sm">
                      <label>Max Tokens</label>
                      <input type="number" [(ngModel)]="form.maxTokens" placeholder="padrão do modelo" />
                    </div>
                  </div>
                  <div class="form-actions">
                    <button class="btn-sm btn-primary" (click)="saveNew()" [disabled]="!form.id.trim() || !form.friendlyName.trim()">Adicionar</button>
                    <button class="btn-sm btn-ghost" (click)="cancelAdd()">Cancelar</button>
                  </div>
                </div>
              } @else {
                <button class="btn-add-model" (click)="startAdd()">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                  </svg>
                  Adicionar modelo
                </button>
              }
            </section>
          }

        </div>

        @if (activeTab() === 'provider') {
          <div class="panel-footer">
            @if (saved) { <span class="saved-msg mono">✓ Salvo</span> }
            <button class="btn-cancel" (click)="close()">Cancelar</button>
            <button class="btn-save" (click)="save()" [disabled]="saving">{{ saving ? 'Salvando...' : 'Salvar' }}</button>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .panel {
      width: 580px;
      max-height: 80vh;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 48px rgba(0,0,0,0.5);
    }

    .panel-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .panel-title {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: -0.01em;
      margin-right: 4px;
    }

    .panel-tabs {
      display: flex;
      gap: 2px;
      flex: 1;
    }

    .tab-btn {
      padding: 4px 12px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      font-family: var(--font-sans);
      font-size: 12px;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .tab-btn.active {
      background: var(--bg-active);
      color: var(--text-primary);
    }

    .tab-btn:hover:not(.active) {
      background: var(--bg-hover);
      color: var(--text-secondary);
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
      flex-shrink: 0;
    }

    .btn-close:hover { background: var(--bg-hover); color: var(--text-primary); }

    .panel-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
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
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    input {
      padding: 8px 10px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      transition: border-color var(--transition-fast);
    }

    input:focus { outline: none; border-color: var(--accent); }
    input::placeholder { color: var(--text-tertiary); font-family: var(--font-sans); }
    input:disabled { opacity: 0.5; cursor: not-allowed; }

    .hint { font-size: 11px; color: var(--text-tertiary); }

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

    .btn-toggle-key:hover { background: var(--bg-hover); color: var(--text-secondary); }

    /* Model list */
    .model-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 12px;
    }

    .model-row {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      gap: 8px;
      transition: background var(--transition-fast);
    }

    .model-row:hover { background: var(--bg-hover); }

    .model-row-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      min-width: 0;
    }

    .model-row-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      flex-shrink: 0;
    }

    .model-row-id {
      font-size: 11px;
      color: var(--text-tertiary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .model-row-params {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .param-chip {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--text-tertiary);
      background: var(--bg-tertiary);
      padding: 1px 5px;
      border-radius: 3px;
    }

    .model-row-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .btn-icon {
      width: 26px;
      height: 26px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
    }

    .btn-icon:hover { background: var(--bg-hover); color: var(--text-secondary); }
    .btn-icon.danger:hover { background: rgba(239,68,68,0.12); color: var(--error); }

    /* Model form */
    .model-form {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 12px;
      margin-bottom: 10px;
    }

    .model-form.editing { margin-bottom: 2px; }

    .form-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 8px;
    }

    .field-sm {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .btn-sm {
      padding: 5px 12px;
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: 12px;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .btn-primary {
      background: var(--accent);
      border: none;
      color: var(--text-inverse);
      font-weight: 600;
    }

    .btn-primary:hover:not(:disabled) { opacity: 0.85; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

    .btn-ghost {
      background: transparent;
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
    }

    .btn-ghost:hover { background: var(--bg-hover); }

    .btn-add-model {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-tertiary);
      font-family: var(--font-sans);
      font-size: 12px;
      cursor: pointer;
      transition: all var(--transition-fast);
      width: 100%;
    }

    .btn-add-model:hover { border-color: var(--accent); color: var(--accent); }

    .empty-hint {
      font-size: 12px;
      color: var(--text-tertiary);
      margin-bottom: 12px;
    }

    /* Footer */
    .panel-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .saved-msg { font-size: 12px; color: var(--success); margin-right: auto; }

    .btn-cancel {
      padding: 7px 14px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 13px;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .btn-cancel:hover { background: var(--bg-hover); color: var(--text-primary); }

    .btn-save {
      padding: 7px 18px;
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

    .btn-save:hover:not(:disabled) { opacity: 0.85; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class SettingsComponent implements OnInit {
  activeTab = signal<'provider' | 'models'>('provider');

  // Provider tab
  endpoint = '';
  apiKey = '';
  model = '';
  showKey = false;
  saving = false;
  saved = false;

  // Models tab
  addingNew = signal(false);
  editingId = signal<string | null>(null);
  form: { id: string; friendlyName: string; contextWindow: number | null; temperature: number | null; topP: number | null; maxTokens: number | null } = this.emptyForm();

  constructor(public chat: ChatService, private wails: WailsService) {}

  async ngOnInit() {
    const s = this.chat.settings();
    this.endpoint = s.llmEndpoint;
    this.apiKey = s.llmApiKey;
    this.model = s.llmModel;
  }

  close() { this.chat.showSettings.set(false); }

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

  // Models CRUD

  startAdd() {
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.addingNew.set(true);
  }

  cancelAdd() { this.addingNew.set(false); }

  async saveNew() {
    if (!this.form.id.trim() || !this.form.friendlyName.trim()) return;
    const m = this.toModelDef();
    try {
      const created = await this.wails.createModel(m);
      this.chat.models.update(ms => [...ms, created]);
      this.addingNew.set(false);
    } catch (err) {
      console.error('Erro ao criar modelo:', err);
    }
  }

  startEdit(m: ModelDef) {
    this.addingNew.set(false);
    this.form = {
      id: m.id,
      friendlyName: m.friendlyName,
      contextWindow: m.contextWindow || null,
      temperature: m.temperature,
      topP: m.topP,
      maxTokens: m.maxTokens,
    };
    this.editingId.set(m.id);
  }

  cancelEdit() { this.editingId.set(null); }

  async saveEdit() {
    if (!this.form.friendlyName.trim()) return;
    const m = this.toModelDef();
    try {
      await this.wails.updateModel(m);
      this.chat.models.update(ms => ms.map(x => x.id === m.id ? m : x));
      this.editingId.set(null);
    } catch (err) {
      console.error('Erro ao atualizar modelo:', err);
    }
  }

  async deleteModel(id: string) {
    try {
      await this.wails.deleteModel(id);
      this.chat.models.update(ms => ms.filter(m => m.id !== id));
    } catch (err) {
      console.error('Erro ao excluir modelo:', err);
    }
  }

  private emptyForm() {
    return { id: '', friendlyName: '', contextWindow: null as number | null, temperature: null as number | null, topP: null as number | null, maxTokens: null as number | null };
  }

  private toModelDef(): ModelDef {
    return {
      id: this.form.id.trim(),
      friendlyName: this.form.friendlyName.trim(),
      contextWindow: this.form.contextWindow ?? 0,
      temperature: this.form.temperature,
      topP: this.form.topP,
      maxTokens: this.form.maxTokens,
    };
  }
}
