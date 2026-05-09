import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiStateService {
  sidebarVisible = signal<boolean>(true);
  showSettings = signal(false);
  deleteConfirmation = signal<{ id: string; title: string } | null>(null);
  renameConversation = signal<{ id: string; currentTitle: string } | null>(null);
}
