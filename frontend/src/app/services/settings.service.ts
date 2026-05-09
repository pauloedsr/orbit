import { Injectable, signal } from '@angular/core';
import { WailsService } from './wails.service';
import { ModelDef, Provider, Settings } from '../models/types';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  settings = signal<Settings>({ defaultModel: '', defaultProvider: '', theme: 'dark' });
  models = signal<ModelDef[]>([]);
  providers = signal<Provider[]>([]);

  constructor(private wails: WailsService) {
    this.init();
  }

  private async init() {
    const s = await this.wails.getSettings();
    this.settings.set(s);
    try {
      const models = await this.wails.listModels();
      this.models.set(models ?? []);
    } catch { }
    try {
      const providers = await this.wails.listProviders();
      this.providers.set(providers ?? []);
    } catch { }
  }

  async updateSetting(key: string, value: string) {
    await this.wails.updateSetting(key, value);
  }

  // Models CRUD
  async createModel(m: ModelDef): Promise<ModelDef> {
    const created = await this.wails.createModel(m);
    this.models.update(ms => [...ms, created]);
    return created;
  }

  async updateModel(m: ModelDef): Promise<void> {
    await this.wails.updateModel(m);
    this.models.update(ms => ms.map(x => x.id === m.id ? m : x));
  }

  async deleteModel(id: string): Promise<void> {
    await this.wails.deleteModel(id);
    this.models.update(ms => ms.filter(m => m.id !== id));
  }

  // Providers CRUD
  async createProvider(p: Provider): Promise<Provider> {
    const created = await this.wails.createProvider(p);
    this.providers.update(ps => [...ps, created]);
    return created;
  }

  async updateProvider(p: Provider): Promise<void> {
    await this.wails.updateProvider(p);
    this.providers.update(ps => ps.map(x => x.id === p.id ? p : x));
  }

  async deleteProvider(id: string): Promise<void> {
    await this.wails.deleteProvider(id);
    this.providers.update(ps => ps.filter(p => p.id !== id));
  }

  friendlyModelName(modelId: string): string {
    return this.models().find(m => m.id === modelId)?.friendlyName ?? modelId;
  }

  friendlyProviderName(providerId: string): string {
    return this.providers().find(p => p.id === providerId)?.name ?? providerId;
  }
}
