import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TabService {
  activeConversationId = signal<string | null>(null);
  openTabs = signal<string[]>([]);
  tabLocked = signal<Map<string, boolean>>(new Map());

  private loadMessagesFn: ((id: string) => Promise<void>) | null = null;

  registerMessageLoader(fn: (id: string) => Promise<void>) {
    this.loadMessagesFn = fn;
  }

  async openTab(id: string) {
    if (!this.openTabs().includes(id)) {
      this.openTabs.update(tabs => [...tabs, id]);
    }
    this.activeConversationId.set(id);
    if (this.loadMessagesFn) {
      await this.loadMessagesFn(id);
    }
  }

  async closeTab(id: string) {
    if (this.tabLocked().get(id)) return;
    await this.forceCloseTab(id);
  }

  async forceCloseTab(id: string) {
    const tabs = this.openTabs();
    const idx = tabs.indexOf(id);
    if (idx === -1) return;

    const newTabs = tabs.filter(t => t !== id);
    this.openTabs.set(newTabs);
    this.tabLocked.update(m => { const n = new Map(m); n.delete(id); return n; });

    if (this.activeConversationId() === id) {
      const nextId = newTabs[idx] ?? newTabs[idx - 1] ?? null;
      this.activeConversationId.set(nextId);
      if (nextId && this.loadMessagesFn) {
        await this.loadMessagesFn(nextId);
      }
    }
  }

  setActiveTab(id: string) {
    this.activeConversationId.set(id);
  }

  toggleTabLock(id: string) {
    this.tabLocked.update(m => {
      const n = new Map(m);
      n.set(id, !n.get(id));
      return n;
    });
  }
}
