import { Injectable, NgZone } from '@angular/core';
import { Conversation, Message, Settings } from '../models/types';

/**
 * WailsService encapsula todas as chamadas ao backend Go.
 *
 * Em runtime Wails, as funções ficam em window.go.main.App.*
 * Em dev sem Wails (ng serve puro), usa mocks para não quebrar.
 *
 * NgZone.run() é necessário porque os callbacks do Wails rodam
 * fora da zone do Angular — sem isso, change detection não dispara.
 */
@Injectable({ providedIn: 'root' })
export class WailsService {
  private go: any;
  private runtime: any;

  constructor(private zone: NgZone) {
    // Wails injeta esses globals no window
    this.go = (window as any)?.go?.main?.App;
    this.runtime = (window as any)?.runtime;
  }

  get isWailsRuntime(): boolean {
    return !!this.go;
  }

  // ------------------------------------------
  // IPC Health Check
  // ------------------------------------------

  async ping(): Promise<string> {
    if (!this.go) return 'mock-pong (no wails runtime)';
    return this.go.Ping();
  }

  // ------------------------------------------
  // Conversations
  // ------------------------------------------

  async createConversation(title: string, model: string, provider: string): Promise<Conversation> {
    if (!this.go) return mockConversation(title);
    return this.go.CreateConversation(title, model, provider);
  }

  async listConversations(): Promise<Conversation[]> {
    if (!this.go) return [];
    return this.go.ListConversations() ?? [];
  }

  async deleteConversation(id: string): Promise<void> {
    if (!this.go) return;
    return this.go.DeleteConversation(id);
  }

  // ------------------------------------------
  // Messages
  // ------------------------------------------

  async getMessages(conversationId: string): Promise<Message[]> {
    if (!this.go) return [];
    return this.go.GetMessages(conversationId) ?? [];
  }

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    if (!this.go) return mockMessage(conversationId, content);
    return this.go.SendMessage(conversationId, content);
  }

  // ------------------------------------------
  // Settings
  // ------------------------------------------

  async getSettings(): Promise<Settings> {
    if (!this.go) return { defaultModel: 'mock', defaultProvider: 'mock', theme: 'dark', llmEndpoint: '', llmApiKey: '', llmModel: '' };
    return this.go.GetSettings();
  }

  async updateSetting(key: string, value: string): Promise<void> {
    if (!this.go) return;
    return this.go.UpdateSetting(key, value);
  }

  async submitToolResponse(requestId: string, response: string): Promise<void> {
    if (!this.go) return;
    return this.go.SubmitToolResponse(requestId, response);
  }

  // ------------------------------------------
  // Wails Events (streaming, tool status, etc.)
  // ------------------------------------------

  onEvent(eventName: string, callback: (data: any) => void): void {
    if (!this.runtime) return;
    this.runtime.EventsOn(eventName, (...args: any[]) => {
      this.zone.run(() => callback(args.length === 1 ? args[0] : args));
    });
  }

  offEvent(eventName: string): void {
    if (!this.runtime) return;
    this.runtime.EventsOff(eventName);
  }
}

// Mocks para dev sem Wails runtime
function mockConversation(title: string): Conversation {
  return {
    id: crypto.randomUUID(),
    title,
    model: 'mock-model',
    provider: 'mock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mockMessage(conversationId: string, content: string): Message {
  return {
    id: crypto.randomUUID(),
    conversationId,
    role: 'assistant',
    content: `Echo: ${content}`,
    model: 'mock',
    createdAt: new Date().toISOString(),
  };
}
