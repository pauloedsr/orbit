import { Injectable, signal } from '@angular/core';
import { WailsService } from './wails.service';
import { SubAgentSession, SubAgentIteration } from '../models/types';

@Injectable({ providedIn: 'root' })
export class SubAgentService {
  activeSubAgents = signal<Map<string, SubAgentSession>>(new Map());
  subAgentPanelState = signal<'hidden' | 'visible' | 'fading'>('hidden');
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private wails: WailsService) {
    this.wails.onEvent('subagent:start', (data: any) => {
      this.activeSubAgents.update(m => new Map(m).set(data.id, {
        id: data.id,
        prompt: data.prompt,
        model: data.model,
        iterations: [],
        completed: false,
        success: false,
      }));
      if (this.fadeTimer) {
        clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
      }
      this.subAgentPanelState.set('visible');
    });

    this.wails.onEvent('subagent:iteration', (data: any) => {
      this.activeSubAgents.update(m => {
        const s = m.get(data.agentId);
        if (!s) return m;
        const newIter: SubAgentIteration = {
          iteration: data.iteration,
          phase: data.phase,
          tools: data.tools ?? [],
        };
        const existing = s.iterations.find(i => i.iteration === data.iteration);
        const iterations = existing
          ? s.iterations.map(i => i.iteration === data.iteration ? newIter : i)
          : [...s.iterations, newIter];
        return new Map(m).set(data.agentId, { ...s, iterations });
      });
    });

    this.wails.onEvent('subagent:done', (data: any) => {
      this.activeSubAgents.update(m => {
        const s = m.get(data.agentId);
        if (!s) return m;
        return new Map(m).set(data.agentId, { ...s, completed: true, success: data.success });
      });
      const allDone = [...this.activeSubAgents().values()].every(s => s.completed);
      if (allDone) {
        this.fadeTimer = setTimeout(() => {
          this.subAgentPanelState.set('fading');
          setTimeout(() => {
            this.subAgentPanelState.set('hidden');
            this.activeSubAgents.set(new Map());
            this.fadeTimer = null;
          }, 600);
        }, 15_000);
      }
    });
  }
}
