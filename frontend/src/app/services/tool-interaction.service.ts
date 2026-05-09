import { Injectable, signal } from '@angular/core';
import { WailsService } from './wails.service';
import { ToolInteraction } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ToolInteractionService {
  pendingInteraction = signal<ToolInteraction | null>(null);

  constructor(private wails: WailsService) {
    this.wails.onEvent('tool:ask', (data: any) => {
      this.pendingInteraction.set({
        id: data.id,
        type: data.type === 'choice' ? 'ask_choice' : 'ask_text',
        question: data.question,
        choices: data.choices,
      });
    });

    this.wails.onEvent('tool:confirm', (data: any) => {
      this.pendingInteraction.set({
        id: data.id,
        type: 'confirm',
        toolName: data.toolName,
        details: data.details,
      });
    });
  }

  async submitInteraction(id: string, response: string) {
    this.pendingInteraction.set(null);
    await this.wails.submitToolResponse(id, response);
  }
}
