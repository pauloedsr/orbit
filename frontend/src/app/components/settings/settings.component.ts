import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { UiStateService } from '../../services/ui-state.service';
import { ModelDef, Provider } from '../../models/types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-screen">

      <!-- Header -->
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="btn-close" (click)="close()">✕</button>
      </div>

      <div class="settings-body">

        <!-- Sidebar -->
        <nav class="settings-sidebar">
          <button class="nav-item" [class.active]="activeTab() === 'providers'" (click)="activeTab.set('providers')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="4" cy="4" r="2"/><circle cx="10" cy="10" r="2"/>
              <path d="M6 4h2a2 2 0 0 1 2 2v2"/>
            </svg>
            Providers
          </button>
          <button class="nav-item" [class.active]="activeTab() === 'models'" (click)="activeTab.set('models')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <rect x="1" y="1" width="12" height="3" rx="1"/>
              <rect x="1" y="5.5" width="12" height="3" rx="1"/>
              <rect x="1" y="10" width="12" height="3" rx="1"/>
            </svg>
            Modelos
          </button>
          <button class="nav-item" [class.active]="activeTab() === 'general'" (click)="activeTab.set('general')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="7" cy="7" r="2"/>
              <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.93 2.93l1.41 1.41M9.66 9.66l1.41 1.41M2.93 11.07l1.41-1.41M9.66 4.34l1.41-1.41"/>
            </svg>
            Geral
          </button>
        </nav>

        <!-- Content -->
        <div class="settings-content">

          <!-- Providers -->
          @if (activeTab() === 'providers') {
            <section class="section">
              <h2 class="section-title mono">Providers</h2>
              <p class="section-desc">Configure endpoints e API keys para cada provider LLM.</p>

              @if (settings.providers().length > 0) {
                <div class="item-list">
                  @for (p of settings.providers(); track p.id) {
                    @if (providerEditingId() === p.id) {
                      <div class="item-form editing">
                        <div class="form-row">
                          <div class="field-sm">
                            <label>Nome *</label>
                            <input type="text" [(ngModel)]="providerForm.name" placeholder="OpenAI" spellcheck="false" />
                          </div>
                          <div class="field-sm">
                            <label>API URL *</label>
                            <input type="url" [(ngModel)]="providerForm.apiUrl" placeholder="https://api.openai.com/v1" spellcheck="false" />
                          </div>
                        </div>
                        <div class="field">
                          <label>API Key</label>
                          <div class="input-row">
                            <input [type]="providerShowKey() === p.id ? 'text' : 'password'"
                                   [(ngModel)]="providerForm.apiKey" placeholder="sk-..." spellcheck="false" autocomplete="off" />
                            <button class="btn-toggle-key" (click)="toggleProviderKey(p.id)">
                              {{ providerShowKey() === p.id ? 'Ocultar' : 'Mostrar' }}
                            </button>
                          </div>
                        </div>
                        <div class="form-actions">
                          <button class="btn-sm btn-primary" (click)="saveProviderEdit()" [disabled]="!providerForm.name.trim() || !providerForm.apiUrl.trim()">Salvar</button>
                          <button class="btn-sm btn-ghost" (click)="cancelProviderEdit()">Cancelar</button>
                        </div>
                      </div>
                    } @else {
                      <div class="item-row">
                        <div class="item-row-info">
                          <span class="item-row-name">{{ p.name }}</span>
                          <span class="item-row-id mono">{{ p.apiUrl }}</span>
                          <span class="param-chip">{{ p.apiKey ? 'API Key: ••••••' : 'sem API Key' }}</span>
                        </div>
                        <div class="item-row-actions">
                          <button class="btn-icon" (click)="startProviderEdit(p)" title="Editar">
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                              <path d="M8.5 1.5L11.5 4.5L5 11H2V8L8.5 1.5Z"/>
                            </svg>
                          </button>
                          <button class="btn-icon danger" (click)="deleteProvider(p.id)" title="Excluir">
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
                <p class="empty-hint">Nenhum provider cadastrado ainda.</p>
              }

              @if (providerAddingNew()) {
                <div class="item-form">
                  <div class="form-row">
                    <div class="field-sm">
                      <label>Nome *</label>
                      <input type="text" [(ngModel)]="providerForm.name" placeholder="OpenAI" spellcheck="false" />
                    </div>
                    <div class="field-sm">
                      <label>API URL *</label>
                      <input type="url" [(ngModel)]="providerForm.apiUrl" placeholder="https://api.openai.com/v1" spellcheck="false" />
                    </div>
                  </div>
                  <div class="field">
                    <label>API Key</label>
                    <div class="input-row">
                      <input [type]="providerShowKey() === '__new' ? 'text' : 'password'"
                             [(ngModel)]="providerForm.apiKey" placeholder="sk-..." spellcheck="false" autocomplete="off" />
                      <button class="btn-toggle-key" (click)="toggleProviderKey('__new')">
                        {{ providerShowKey() === '__new' ? 'Ocultar' : 'Mostrar' }}
                      </button>
                    </div>
                  </div>
                  <div class="form-actions">
                    <button class="btn-sm btn-primary" (click)="saveProviderNew()" [disabled]="!providerForm.name.trim() || !providerForm.apiUrl.trim()">Adicionar</button>
                    <button class="btn-sm btn-ghost" (click)="cancelProviderAdd()">Cancelar</button>
                  </div>
                </div>
              } @else {
                <button class="btn-add" (click)="startProviderAdd()">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                  </svg>
                  Adicionar provider
                </button>
              }
            </section>
          }

          <!-- Modelos -->
          @if (activeTab() === 'models') {
            <section class="section">
              <h2 class="section-title mono">Modelos cadastrados</h2>
              <p class="section-desc">Modelos de linguagem disponíveis para uso nas conversas.</p>

              @if (settings.models().length > 0) {
                <div class="item-list">
                  @for (m of settings.models(); track m.id) {
                    @if (editingId() === m.id) {
                      <div class="item-form editing">
                        <div class="form-row">
                          <div class="field-sm">
                            <label>Provider *</label>
                            <select [(ngModel)]="form.providerId">
                              <option value="" disabled>Selecione...</option>
                              @for (p of settings.providers(); track p.id) {
                                <option [value]="p.id">{{ p.name }}</option>
                              }
                            </select>
                          </div>
                          <div class="field-sm">
                            <label>ID (API)</label>
                            <input type="text" [(ngModel)]="form.id" placeholder="gpt-4o" spellcheck="false" />
                          </div>
                          <div class="field-sm">
                            <label>Nome amigável</label>
                            <input type="text" [(ngModel)]="form.friendlyName" placeholder="GPT-4o" spellcheck="false" />
                          </div>
                        </div>
                        <div class="form-row">
                          <div class="field-sm">
                            <label>Contexto (k tokens)</label>
                            <input type="number" [(ngModel)]="form.contextWindow" placeholder="128" />
                          </div>
                          <div class="field-sm">
                            <label>Temperature</label>
                            <input type="number" [(ngModel)]="form.temperature" placeholder="padrão do modelo" step="0.01" min="0" max="2" />
                          </div>
                          <div class="field-sm">
                            <label>Top P</label>
                            <input type="number" [(ngModel)]="form.topP" placeholder="padrão do modelo" step="0.01" min="0" max="1" />
                          </div>
                        </div>
                        <div class="form-row">
                          <div class="field-sm">
                            <label>Max Tokens</label>
                            <input type="number" [(ngModel)]="form.maxTokens" placeholder="padrão do modelo" />
                          </div>
                          <div class="field-sm field-wide">
                            <label>Campo JSON do thinking</label>
                            <input type="text" [(ngModel)]="form.thinkingField" placeholder="reasoning" spellcheck="false" />
                            <span class="hint">Vazio = modelo não suporta. Ex.: <code>reasoning</code> (Ollama /v1), <code>reasoning_content</code> (DeepSeek/SGLang), <code>thinking</code> (Ollama nativo).</span>
                          </div>
                        </div>
                        <div class="form-actions">
                          <button class="btn-sm btn-primary" (click)="saveEdit()" [disabled]="!form.friendlyName.trim()">Salvar</button>
                          <button class="btn-sm btn-ghost" (click)="cancelEdit()">Cancelar</button>
                        </div>
                      </div>
                    } @else {
                      <div class="item-row">
                        <div class="item-row-info">
                          <span class="item-row-name">{{ m.friendlyName }}</span>
                          <span class="item-row-id mono">{{ m.id }}</span>
                          <div class="item-row-params">
                            @if (m.contextWindow) { <span class="param-chip">{{ m.contextWindow }}k</span> }
                            @if (m.temperature !== null) { <span class="param-chip">t={{ m.temperature }}</span> }
                            @if (m.topP !== null) { <span class="param-chip">p={{ m.topP }}</span> }
                            @if (m.maxTokens !== null) { <span class="param-chip">max={{ m.maxTokens }}</span> }
                            @if (m.thinkingField) { <span class="param-chip">think:{{ m.thinkingField }}</span> }
                            @if (m.providerId) { <span class="param-chip provider-chip">{{ settings.friendlyProviderName(m.providerId) }}</span> }
                          </div>
                        </div>
                        <div class="item-row-actions">
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

              @if (addingNew()) {
                <div class="item-form">
                  <div class="form-row">
                    <div class="field-sm">
                      <label>Provider *</label>
                      <select [(ngModel)]="form.providerId">
                        <option value="" disabled>Selecione...</option>
                        @for (p of settings.providers(); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </div>
                    <div class="field-sm">
                      <label>ID (API) *</label>
                      <input type="text" [(ngModel)]="form.id" placeholder="gpt-4o" spellcheck="false" />
                    </div>
                    <div class="field-sm">
                      <label>Nome amigável *</label>
                      <input type="text" [(ngModel)]="form.friendlyName" placeholder="GPT-4o" spellcheck="false" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="field-sm">
                      <label>Contexto (k tokens)</label>
                      <input type="number" [(ngModel)]="form.contextWindow" placeholder="128" />
                    </div>
                    <div class="field-sm">
                      <label>Temperature</label>
                      <input type="number" [(ngModel)]="form.temperature" placeholder="padrão do modelo" step="0.01" min="0" max="2" />
                    </div>
                    <div class="field-sm">
                      <label>Top P</label>
                      <input type="number" [(ngModel)]="form.topP" placeholder="padrão do modelo" step="0.01" min="0" max="1" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="field-sm">
                      <label>Max Tokens</label>
                      <input type="number" [(ngModel)]="form.maxTokens" placeholder="padrão do modelo" />
                    </div>
                    <div class="field-sm field-wide">
                      <label>Campo JSON do thinking</label>
                      <input type="text" [(ngModel)]="form.thinkingField" placeholder="reasoning" spellcheck="false" />
                      <span class="hint">Vazio = modelo não suporta. Ex.: <code>reasoning</code> (Ollama /v1), <code>reasoning_content</code> (DeepSeek/SGLang), <code>thinking</code> (Ollama nativo).</span>
                    </div>
                  </div>
                  <div class="form-actions">
                    <button class="btn-sm btn-primary" (click)="saveNew()" [disabled]="!form.id.trim() || !form.friendlyName.trim()">Adicionar</button>
                    <button class="btn-sm btn-ghost" (click)="cancelAdd()">Cancelar</button>
                  </div>
                </div>
              } @else {
                <button class="btn-add" (click)="startAdd()">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
                  </svg>
                  Adicionar modelo
                </button>
              }
            </section>
          }

          <!-- Geral -->
          @if (activeTab() === 'general') {
            <section class="section">
              <h2 class="section-title mono">Geral</h2>
              <p class="section-desc">Configurações gerais do aplicativo.</p>

              <div class="field">
                <label>Modelo padrão (fallback)</label>
                <input type="text" [(ngModel)]="defaultModelValue" placeholder="gpt-4o" spellcheck="false" />
                <span class="hint">Usado quando a conversa não tem modelo selecionado</span>
              </div>

              <div class="form-actions">
                @if (savedGeneral) { <span class="saved-msg mono">✓ Salvo</span> }
                <button class="btn-sm btn-primary" (click)="saveGeneral()" [disabled]="savingGeneral">
                  {{ savingGeneral ? 'Salvando...' : 'Salvar' }}
                </button>
              </div>
            </section>
          }

        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-screen {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
      z-index: 100;
    }

    .settings-header {
      height: 48px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      padding: 0 20px;
      flex-shrink: 0;
    }

    .settings-title {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: -0.01em;
      flex: 1;
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

    .btn-close:hover { background: var(--bg-hover); color: var(--text-primary); }

    .settings-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .settings-sidebar {
      width: 200px;
      border-right: 1px solid var(--border-subtle);
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex-shrink: 0;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 10px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-family: var(--font-sans);
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: all var(--transition-fast);
    }

    .nav-item:hover:not(.active) { background: var(--bg-hover); color: var(--text-primary); }
    .nav-item.active { background: var(--bg-active); color: var(--text-primary); font-weight: 500; }

    .settings-content {
      flex: 1;
      padding: 32px 40px;
      overflow-y: auto;
      max-width: 680px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
      letter-spacing: -0.02em;
    }

    .section-desc {
      font-size: 13px;
      color: var(--text-tertiary);
      margin-bottom: 20px;
    }

    /* Fields */
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

    input, select {
      padding: 8px 10px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      transition: border-color var(--transition-fast);
    }

    select { font-family: var(--font-sans); cursor: pointer; }

    input:focus, select:focus { outline: none; border-color: var(--accent); }
    input::placeholder { color: var(--text-tertiary); font-family: var(--font-sans); }
    input:disabled { opacity: 0.5; cursor: not-allowed; }

    .hint { font-size: 11px; color: var(--text-tertiary); }

    .input-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .input-row input { flex: 1; }

    .btn-toggle-key {
      flex-shrink: 0;
      padding: 2px 8px;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      background: transparent;
      color: var(--text-tertiary);
      font-size: 11px;
      cursor: pointer;
      font-family: var(--font-sans);
      transition: all var(--transition-fast);
      white-space: nowrap;
    }

    .btn-toggle-key:hover { background: var(--bg-hover); color: var(--text-secondary); }

    /* Item list */
    .item-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 12px;
    }

    .item-row {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      gap: 8px;
      transition: background var(--transition-fast);
    }

    .item-row:hover { background: var(--bg-hover); }

    .item-row-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      min-width: 0;
    }

    .item-row-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      flex-shrink: 0;
    }

    .item-row-id {
      font-size: 11px;
      color: var(--text-tertiary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-row-params {
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

    .provider-chip {
      background: var(--bg-active);
      color: var(--text-secondary);
      font-family: var(--font-sans);
    }

    .item-row-actions {
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

    /* Item form */
    .item-form {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 12px;
      margin-bottom: 10px;
    }

    .item-form.editing { margin-bottom: 2px; }

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

    .field-wide { grid-column: span 2; }
    .field-wide code {
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 0 3px;
      background: var(--bg-tertiary);
      border-radius: 3px;
    }

    .form-actions {
      display: flex;
      align-items: center;
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

    .btn-add {
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

    .btn-add:hover { border-color: var(--accent); color: var(--accent); }

    .empty-hint {
      font-size: 12px;
      color: var(--text-tertiary);
      margin-bottom: 12px;
    }

    .saved-msg { font-size: 12px; color: var(--success); margin-right: auto; }
  `],
})
export class SettingsComponent implements OnInit {
  activeTab = signal<'providers' | 'models' | 'general'>('providers');

  // Provider CRUD
  providerAddingNew = signal(false);
  providerEditingId = signal<string | null>(null);
  providerShowKey = signal<string | null>(null);
  providerForm: { id: string; name: string; apiUrl: string; apiKey: string } = this.emptyProviderForm();

  // Model CRUD
  addingNew = signal(false);
  editingId = signal<string | null>(null);
  form: { id: string; providerId: string; friendlyName: string; contextWindow: number | null; temperature: number | null; topP: number | null; maxTokens: number | null; thinkingField: string } = this.emptyForm();

  // General
  defaultModelValue = '';
  savingGeneral = false;
  savedGeneral = false;

  constructor(public settings: SettingsService, public ui: UiStateService) { }

  async ngOnInit() {
    this.defaultModelValue = this.settings.settings().defaultModel;
  }

  close() { this.ui.showSettings.set(false); }

  // ---- General ----

  async saveGeneral() {
    this.savingGeneral = true;
    this.savedGeneral = false;
    try {
      await this.settings.updateSetting('default_model', this.defaultModelValue.trim());
      this.settings.settings.update(s => ({ ...s, defaultModel: this.defaultModelValue.trim() }));
      this.savedGeneral = true;
      setTimeout(() => { this.savedGeneral = false; }, 2000);
    } finally {
      this.savingGeneral = false;
    }
  }

  // ---- Provider CRUD ----

  startProviderAdd() {
    this.providerEditingId.set(null);
    this.providerForm = this.emptyProviderForm();
    this.providerAddingNew.set(true);
  }

  cancelProviderAdd() { this.providerAddingNew.set(false); }

  async saveProviderNew() {
    if (!this.providerForm.name.trim() || !this.providerForm.apiUrl.trim()) return;
    try {
      await this.settings.createProvider(this.toProviderDef());
      this.providerAddingNew.set(false);
    } catch (err) {
      console.error('Erro ao criar provider:', err);
    }
  }

  startProviderEdit(p: Provider) {
    this.providerAddingNew.set(false);
    this.providerForm = { id: p.id, name: p.name, apiUrl: p.apiUrl, apiKey: p.apiKey };
    this.providerEditingId.set(p.id);
  }

  cancelProviderEdit() { this.providerEditingId.set(null); }

  async saveProviderEdit() {
    if (!this.providerForm.name.trim() || !this.providerForm.apiUrl.trim()) return;
    try {
      await this.settings.updateProvider(this.toProviderDef());
      this.providerEditingId.set(null);
    } catch (err) {
      console.error('Erro ao atualizar provider:', err);
    }
  }

  async deleteProvider(id: string) {
    try {
      await this.settings.deleteProvider(id);
    } catch (err) {
      console.error('Erro ao excluir provider:', err);
    }
  }

  toggleProviderKey(id: string) {
    this.providerShowKey.set(this.providerShowKey() === id ? null : id);
  }

  private emptyProviderForm() {
    return { id: '', name: '', apiUrl: '', apiKey: '' };
  }

  private toProviderDef(): Provider {
    return {
      id: this.providerForm.id,
      name: this.providerForm.name.trim(),
      apiUrl: this.providerForm.apiUrl.trim(),
      apiKey: this.providerForm.apiKey,
    };
  }

  // ---- Model CRUD ----

  startAdd() {
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.addingNew.set(true);
  }

  cancelAdd() { this.addingNew.set(false); }

  async saveNew() {
    if (!this.form.id.trim() || !this.form.friendlyName.trim()) return;
    try {
      await this.settings.createModel(this.toModelDef());
      this.addingNew.set(false);
    } catch (err) {
      console.error('Erro ao criar modelo:', err);
    }
  }

  startEdit(m: ModelDef) {
    this.addingNew.set(false);
    this.form = {
      id: m.id,
      providerId: m.providerId,
      friendlyName: m.friendlyName,
      contextWindow: m.contextWindow || null,
      temperature: m.temperature,
      topP: m.topP,
      maxTokens: m.maxTokens,
      thinkingField: m.thinkingField ?? '',
    };
    this.editingId.set(m.id);
  }

  cancelEdit() { this.editingId.set(null); }

  async saveEdit() {
    if (!this.form.friendlyName.trim()) return;
    try {
      await this.settings.updateModel(this.toModelDef());
      this.editingId.set(null);
    } catch (err) {
      console.error('Erro ao atualizar modelo:', err);
    }
  }

  async deleteModel(id: string) {
    try {
      await this.settings.deleteModel(id);
    } catch (err) {
      console.error('Erro ao excluir modelo:', err);
    }
  }

  private emptyForm() {
    return {
      id: '', providerId: '', friendlyName: '',
      contextWindow: null as number | null, temperature: null as number | null,
      topP: null as number | null, maxTokens: null as number | null,
      thinkingField: '',
    };
  }

  private toModelDef(): ModelDef {
    return {
      id: this.form.id.trim(),
      providerId: this.form.providerId,
      friendlyName: this.form.friendlyName.trim(),
      contextWindow: this.form.contextWindow ?? 0,
      temperature: this.form.temperature,
      topP: this.form.topP,
      maxTokens: this.form.maxTokens,
      thinkingField: this.form.thinkingField.trim(),
    };
  }
}
