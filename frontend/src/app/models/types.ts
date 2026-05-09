// Espelha os DTOs definidos em app.go.
// Wails gera bindings automaticamente, mas manter tipos explícitos
// dá autocomplete e type safety no Angular.

export interface ModelDef {
  id: string;
  providerId: string;
  friendlyName: string;
  contextWindow: number;
  temperature:   number | null;
  topP:          number | null;
  maxTokens:     number | null;
}

export interface Provider {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
}

export type ConversationMode = 'ask' | 'edit' | 'plan';
export type PlanPhase = 'planning' | 'implementing';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  pinned: boolean;
  mode: ConversationMode;
  planPhase: PlanPhase;
  contextWindowUsage: number;
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

// Payloads dos eventos de streaming emitidos pelo backend
export interface ChatThinkingPayload      { conversationId: string }
export interface ChatChunkPayload         { conversationId: string; text: string }
export interface ChatMessagePayload       { conversationId: string; message: Message }
export interface ChatStoppedPayload       { conversationId: string; message: Message | null }
export interface ChatContextUsagePayload  { conversationId: string; percentage: number; totalTokens: number; contextWindow: number }
