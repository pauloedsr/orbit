// Espelha os DTOs definidos em app.go.
// Wails gera bindings automaticamente, mas manter tipos explícitos
// dá autocomplete e type safety no Angular.

export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  model: string;
  toolCalls?: string;
  toolCallId?: string;
  createdAt: string;
}

export interface Settings {
  defaultModel: string;
  defaultProvider: string;
  theme: string;
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;
}

// Estado da UI — não persiste no backend
export interface ChatState {
  activeConversationId: string | null;
  isStreaming: boolean;
  streamBuffer: string;
}

// Interação bloqueante com o agente (ask / confirm)
export interface ToolInteraction {
  id: string;
  type: 'ask_text' | 'ask_choice' | 'confirm';
  question?: string;
  choices?: string[];
  toolName?: string;
  details?: string;
}

// Painel de sub-agentes em tempo real
export type SubAgentPhase = 'thinking' | 'tool-calling' | 'done';

export interface SubAgentIteration {
  iteration: number;
  phase: SubAgentPhase;
  tools: string[];
}

export interface SubAgentSession {
  id: string;
  prompt: string;
  model: string;
  iterations: SubAgentIteration[];
  completed: boolean;
  success: boolean;
}
