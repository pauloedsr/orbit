import { Component, inject } from '@angular/core';
import { SubAgentService } from '../../services/sub-agent.service';
import { SubAgentSession } from '../../models/types';

@Component({
  selector: 'app-subagent-panel',
  standalone: true,
  imports: [],
  template: `
    <aside class="panel" [class.panel--fading]="subAgent.subAgentPanelState() === 'fading'">

      <div class="panel-header">
        <span class="panel-icon">⚙</span>
        <span class="panel-title">Sub-Agents</span>
        <span class="panel-count">{{ agentList().length }}</span>
      </div>

      <div class="panel-body">
        @for (session of agentList(); track session.id) {
          <div class="agent-card" [class.agent-card--done]="session.completed">

            <div class="agent-card-header">
              <p class="agent-prompt" [title]="session.prompt">{{ truncate(session.prompt, 72) }}</p>
              <div class="agent-meta">
                <span class="agent-model mono">{{ shortModel(session.model) }}</span>
                @if (!session.completed) {
                  <span class="status-spinner"></span>
                } @else if (session.success) {
                  <span class="status-done">✓</span>
                } @else {
                  <span class="status-fail">✗</span>
                }
              </div>
            </div>

            <div class="iterations">
              @for (iter of session.iterations; track iter.iteration) {
                <div class="iter-row" [class]="'iter-row--' + iter.phase">
                  <span class="iter-num mono">#{{ iter.iteration }}</span>
                  <span class="iter-phase">
                    @switch (iter.phase) {
                      @case ('thinking') {
                        <span class="phase-dot phase-dot--thinking"></span>
                        <span class="phase-label">thinking</span>
                      }
                      @case ('tool-calling') {
                        <span class="phase-dot phase-dot--tool"></span>
                        <span class="phase-label">tools</span>
                      }
                      @case ('done') {
                        <span class="phase-dot phase-dot--done"></span>
                        <span class="phase-label">done</span>
                      }
                    }
                  </span>
                  @if (iter.tools.length > 0) {
                    <div class="iter-tools">
                      @for (tool of iter.tools; track tool) {
                        <span class="tool-badge mono">{{ tool }}</span>
                      }
                    </div>
                  }
                </div>
              }
            </div>

          </div>
        }
      </div>

    </aside>
  `,
  styles: [`
    /* ---- Panel shell ---- */
    .panel {
      width: 280px;
      height: 100%;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
      animation: panel-slide-in 240ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }

    .panel--fading {
      animation: panel-fade-out 600ms ease forwards;
      pointer-events: none;
    }

    @keyframes panel-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }

    @keyframes panel-fade-out {
      from { opacity: 1; transform: translateX(0);   }
      to   { opacity: 0; transform: translateX(40px); }
    }

    /* ---- Header ---- */
    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .panel-icon {
      color: var(--accent);
      font-size: 13px;
    }

    .panel-title {
      flex: 1;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .panel-count {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-tertiary);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 1px 7px;
    }

    /* ---- Body ---- */
    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* ---- Agent card ---- */
    .agent-card {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
      transition: border-color var(--transition-default), opacity var(--transition-default);
    }

    .agent-card--done {
      border-color: var(--border-default);
      opacity: 0.8;
    }

    .agent-card-header {
      padding: 10px 12px 8px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .agent-prompt {
      font-size: 12px;
      color: var(--text-primary);
      line-height: 1.45;
      margin-bottom: 6px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .agent-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .agent-model {
      font-size: 10px;
      color: var(--text-tertiary);
      background: var(--bg-secondary);
      border-radius: 4px;
      padding: 1px 6px;
    }

    /* ---- Status indicators ---- */
    .status-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--border-default);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 700ms linear infinite;
      flex-shrink: 0;
    }

    .status-done { font-size: 12px; font-weight: 700; color: var(--success); }
    .status-fail { font-size: 12px; font-weight: 700; color: var(--error); }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ---- Iterations ---- */
    .iterations { padding: 4px 0; }

    .iter-row {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 6px;
      padding: 5px 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .iter-row:last-child { border-bottom: none; }

    .iter-num {
      font-size: 10px;
      color: var(--text-tertiary);
      min-width: 22px;
      padding-top: 2px;
      flex-shrink: 0;
    }

    .iter-phase {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .phase-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .phase-dot--thinking {
      background: var(--warning);
      animation: pulse 1.2s ease-in-out infinite;
    }

    .phase-dot--tool { background: var(--info); }
    .phase-dot--done { background: var(--success); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    .phase-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary);
    }

    .iter-row--thinking   .phase-label { color: var(--warning); }
    .iter-row--tool-calling .phase-label { color: var(--info); }
    .iter-row--done       .phase-label { color: var(--success); }

    /* ---- Tool badges ---- */
    .iter-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      width: 100%;
      padding-left: 28px;
    }

    .tool-badge {
      font-size: 9px;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 1px 5px;
      white-space: nowrap;
    }
  `]
})
export class SubAgentPanelComponent {
  subAgent = inject(SubAgentService);

  agentList(): SubAgentSession[] {
    return [...this.subAgent.activeSubAgents().values()];
  }

  truncate(text: string, maxLen: number): string {
    return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + '…';
  }

  shortModel(model: string): string {
    const parts = model.split('/');
    const name = parts[parts.length - 1];
    const m = name.match(/^([a-z]+-[a-z]+-[\d]+)/);
    return m ? m[1] : name.slice(0, 20);
  }
}
