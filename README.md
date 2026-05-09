# 🚀 Orbit: Seu Assistente de IA Pessoal e Gateway de Agentes

**Orbit** é um executável simples e poderoso que traz o poder dos agentes de Inteligência Artificial diretamente para o seu desktop. Construído como uma aplicação nativa rápida e com uma interface rica, o Orbit atua como um gateway LLM local focado em automação, planejamento e execução segura de tarefas de desenvolvimento e sistema.

> ⚠️ **Status do Projeto**: O Orbit está em fase inicial de desenvolvimento (Alpha). Estamos construindo a base para um ecossistema de agentes robusto e de alto desempenho. Junte-se à comunidade para moldar o futuro do projeto!

> 🤖 **Aviso amigável**: Este README foi gerado com a ajuda de uma IA e pode conter alguns equívocos kkkk. PRs são sempre bem-vindos para corrigir qualquer alucinação!

## 🌟 O que é o Orbit?

Diferente de interfaces de chat convencionais, o Orbit foi desenhado para **agir**. Ele dota modelos de linguagem (como Gemini, Claude, OpenAI ou modelos locais) de ferramentas reais para interagir com o seu sistema de arquivos e terminal.
Tudo isso é entregue em um **único binário executável**, combinando a velocidade do Go com uma UI moderna em Angular, sem a necessidade de configurações complexas de ambiente.

## ✨ Principais Funcionalidades

- **🧠 Agentes e Sub-agentes**: Capacidade de delegar tarefas complexas para sub-agentes iterativos que raciocinam e executam ciclos completos de ferramentas até atingir um objetivo.
- **🛠️ Arsenal de Ferramentas Integrado**:
  - **Filesystem**: Leitura inteligente (intervalos, paginação), edição com suporte a diffs (git-style), busca complexa via glob e grep contextual, gerenciamento de diretórios e mais.
  - **Shell**: Execução de comandos de terminal e scripts shell (Bash, PowerShell) com suporte a timeout e controle estrito de ambiente.
- **🛡️ Segurança em Primeiro Lugar (Human-in-the-Loop)**: A IA não tem permissão para quebrar o seu sistema. Qualquer ação destrutiva (como escrever arquivos, editar código ou rodar scripts) exige a **sua confirmação explícita** através da interface gráfica antes da execução.
- **🎯 Modos de Conversa Focados**:
  - **Ask Mode**: Focado em exploração (ferramentas em modo apenas leitura).
  - **Plan Mode**: O agente primeiro estuda o contexto, elabora um plano detalhado (salvo em `.orbit/plans/`) e aguarda sua aprovação antes de iniciar a fase de implementação e modificação.
- **🔌 Multi-Provider Nativo**: Suporte otimizado ao Google Gemini (incluindo _thought signatures_ para modelos com _thinking_), Anthropic, OpenAI e compatibilidade com provedores locais (Ollama, vLLM).

## 🏗️ Arquitetura

O Orbit une a robustez do backend em Go com a reatividade do Angular (Standalone Components + Signals), utilizando um banco de dados SQLite em modo WAL para persistência ultrarrápida.

```text
┌─────────────────────────────────────────────────┐
│                   Orbit Desktop                  │
│  ┌──────────┐    IPC (bindings     ┌──────────┐ │
│  │ Angular  │◄═══ + events)  ═════►│   Go     │ │
│  │ Frontend │                      │ Backend  │ │
│  └──────────┘                      └────┬─────┘ │
│                                         │       │
│                              ┌──────────┴──────┐│
│                              │  SQLite (WAL)   ││
│                              │  orbit.db       ││
│                              └─────────────────┘│
└─────────────────────────────────────────────────┘
         ▲                            │
         │ (Futuro) Clients externos  ▼
    POST /v1/chat/completions    Providers
    (OpenAI-compatible)          ├── Gemini (nativo)
                                 ├── Anthropic
                                 ├── OpenAI
                                 └── Ollama/vLLM
```

## Stack

| Camada   | Tech                                        |
| -------- | ------------------------------------------- |
| Shell    | Wails v2 (Go + WebView nativo)              |
| Frontend | Angular 18 (standalone components, signals) |
| Backend  | Go 1.23                                     |
| DB       | SQLite via `modernc.org/sqlite` (pure Go)   |
| Config   | TOML (`~/.config/orbit/config.toml`)        |

## Estrutura

```
orbit/
├── main.go                         # Entry point Wails
├── app.go                          # Bindings Go ↔ Angular (DTOs, IPC)
├── wails.json                      # Config Wails
├── go.mod
│
├── backend/
│   ├── config/config.go            # TOML config + defaults
│   ├── db/db.go                    # SQLite: migrations, CRUD
│   └── providers/
│       ├── provider.go             # Interface Provider + Registry
│       └── mock.go                 # Mock para dev sem API key
│
└── frontend/
    ├── angular.json
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.html
        ├── main.ts
        ├── styles.css              # Design tokens (dark IDE theme)
        └── app/
            ├── app.component.ts    # Shell layout + keyboard shortcuts
            ├── models/types.ts     # TypeScript DTOs
            ├── services/
            │   ├── wails.service.ts # Ponte IPC (Go bindings + events)
            │   └── chat.service.ts  # State management (signals)
            └── components/
                ├── sidebar/sidebar.component.ts
                └── chat/chat.component.ts
```

## Setup

### Pré-requisitos

- Go 1.23+
- Node.js 20+
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Linux: `sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev`

### Instalação

```bash
# Clone e entre no diretório
cd orbit

# Instala dependências Go
go mod tidy

# Instala dependências Angular
cd frontend && npm install && cd ..

# Dev mode (hot reload Angular + Go)
wails dev

# Build produção
wails build
```

### Verificação IPC

Ao abrir o app, o header mostra `IPC OK` (verde) se a ponte Go ↔ Angular está funcionando,
ou `mock` (vermelho) se rodando em `ng serve` puro sem Wails.

## Config

Arquivo gerado automaticamente em `~/.config/orbit/config.toml`:

```toml
default_model = "claude-sonnet-4-20250514"
default_provider = "anthropic"
theme = "dark"

[gateway]
port = 8090
enabled = false

[providers.anthropic]
api_key = ""
base_url = ""

[providers.openai]
api_key = ""
base_url = ""
```

## Banco de Dados

SQLite em `~/.config/orbit/data/orbit.db` com WAL mode.

Tabelas: `conversations`, `messages`, `settings`, `mcp_servers`.

## Keyboard Shortcuts

| Atalho        | Ação            |
| ------------- | --------------- |
| `Ctrl+N`      | Nova conversa   |
| `Enter`       | Enviar mensagem |
| `Shift+Enter` | Nova linha      |

## Próximos passos

- [ ] **Fase 2**: Provider Anthropic real (streaming SSE)
- [ ] **Fase 2**: Provider OpenAI-compatible
- [ ] **Fase 2**: Gateway HTTP local (`orbit serve`)
- [ ] **Fase 3**: MCP host (spawn, JSON-RPC, lifecycle)
- [ ] **Fase 3**: Tool calling loop (ciclos autônomos de raciocínio e execução)
- [ ] **Fase 4**: Delegação de tarefas via Sub-agentes com limites de iteração
- [ ] **Fase 4**: UI aprimorada para exibir diffs de arquivos em tempo real (Human-in-the-loop)
- [ ] **Fase 5**: Otimização de requisições com Prompt Caching (Anthropic, Gemini)
- [ ] **Fase 5**: Integração avançada com provedores locais (Ollama, vLLM)
