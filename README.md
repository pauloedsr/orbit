# 🧪 Orbit (editado para teste)

CLI power, rich interface. Um gateway LLM local com interface desktop nativa.

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│                   Wails Shell                    │
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
         │ Clients externos           ▼
    POST /v1/chat/completions    Providers
    (OpenAI-compatible)          ├── Anthropic (nativo)
                                 ├── OpenAI
                                 └── Ollama/vLLM
```

## Stack

| Camada   | Tech                                          |
|----------|-----------------------------------------------|
| Shell    | Wails v2 (Go + WebView nativo)                |
| Frontend | Angular 18 (standalone components, signals)   |
| Backend  | Go 1.23                                       |
| DB       | SQLite via `modernc.org/sqlite` (pure Go)     |
| Config   | TOML (`~/.config/orbit/config.toml`)          |

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

| Atalho         | Ação              |
|----------------|-------------------|
| `Ctrl+N`       | Nova conversa     |
| `Enter`        | Enviar mensagem   |
| `Shift+Enter`  | Nova linha        |

## Próximos passos

- [ ] **Fase 2**: Provider Anthropic real (streaming SSE)
- [ ] **Fase 2**: Provider OpenAI-compatible
- [ ] **Fase 2**: Gateway HTTP local (`orbit serve`)
- [ ] **Fase 3**: MCP host (spawn, JSON-RPC, lifecycle)
- [ ] **Fase 3**: Tool calling loop
- [ ] **Fase 4**: Command palette (Ctrl+K)
- [ ] **Fase 4**: Slash commands
- [ ] **Fase 4**: Markdown rendering com syntax highlight
- [ ] **Fase 5**: System tray + build cross-platform
