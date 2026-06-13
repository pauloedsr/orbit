# Plano de Melhorias para o Componente de Chat

Este plano detalha as etapas para implementar duas melhorias principais no componente de chat do frontend: auto-scroll para a mensagem mais recente e uma interface de usuário aprimorada para a exibição de chamadas de ferramentas (tool calls).

## Tarefa 1: Implementar Auto-Scroll no Chat

**Objetivo:** Fazer com que a visualização do chat role automaticamente para a mensagem mais recente sempre que uma nova mensagem for adicionada ou a conversa for carregada.

**Arquivos-alvo:**
- `frontend/src/app/components/chat/chat.component.ts`
- `frontend/src/app/components/chat/chat.component.html` (para adicionar uma referência de template)

**Passos de Implementação:**

1.  **Adicionar Referência de Template:** No arquivo `chat.component.html`, adicione uma referência de template ao contêiner de mensagens que precisa de rolagem.

    ```html
    <div class="messages-container" #scrollContainer>
      <!-- ... mensagens renderizadas aqui ... -->
    </div>
    ```

2.  **Acessar o Elemento no Componente:** Em `chat.component.ts`, use `@ViewChild` para obter acesso ao elemento `scrollContainer`.

    ```typescript
    import { Component, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';

    // ...

    export class ChatComponent implements AfterViewChecked {
      @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

      // ...
    }
    ```

3.  **Implementar a Lógica de Rolagem:** Use o hook de ciclo de vida `AfterViewChecked` para verificar se a visualização precisa ser rolada. Este hook é executado após cada verificação da view do componente. Para evitar rolagens desnecessárias, a rolagem só deve ocorrer quando uma nova mensagem for adicionada.

    ```typescript
    ngAfterViewChecked() {
      this.scrollToBottom();
    }

    private scrollToBottom(): void {
      try {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      } catch(err) { }
    }
    ```
    Uma alternativa é observar as mudanças no array de mensagens e acionar a rolagem a partir daí, o que pode ser mais performático.

## Tarefa 2: Melhorar a UI de Chamada de Ferramentas (Tool Call)

**Objetivo:** Substituir a exibição detalhada padrão dos parâmetros de uma chamada de ferramenta por um componente minimalista que oculta os detalhes por padrão e os exibe em um overlay ou modal quando solicitado.

**Arquivos-alvo:**
- `frontend/src/app/components/tool-interaction/tool-interaction.component.ts` (componente existente)
- `frontend/src/app/components/tool-interaction/tool-interaction.component.html` (template existente)
- `frontend/src/app/components/minimalist-tool-call/minimalist-tool-call.component.ts` (novo componente)
- `frontend/src/app/components/minimalist-tool-call/minimalist-tool-call.component.html` (novo template)

**Passos de Implementação:**

1.  **Criar o Novo Componente `MinimalistToolCall`:**
    -   Use o Angular CLI para gerar um novo componente: `ng generate component components/minimalist-tool-call`.
    -   Este componente receberá os dados da `tool_interaction` como um `@Input`.

2.  **Desenvolver o Template Minimalista (`minimalist-tool-call.component.html`):**
    -   Exiba o nome da ferramenta e um ícone ou botão discreto (ex: "Ver Parâmetros").
    -   Adicione um evento de clique a este botão para acionar a exibição dos detalhes.

    ```html
    <div class="minimalist-container">
      <span class="tool-name">{{ toolInteraction.name }}</span>
      <button (click)="showDetails()" class="details-button">Ver Parâmetros</button>
    </div>
    ```

3.  **Implementar a Lógica de Overlay/Modal:**
    -   Em `minimalist-tool-call.component.ts`, crie um método `showDetails()`.
    -   Este método será responsável por abrir um modal ou overlay. Uma boa abordagem em Angular é usar um serviço (como um `DialogService` com o Angular Material) para gerenciar a exibição de modais.
    -   O modal exibirá os parâmetros formatados da chamada da ferramenta.

4.  **Integrar o Novo Componente:**
    -   No template `tool-interaction.component.html`, adicione uma lógica condicional. Em vez de sempre mostrar os detalhes completos, renderize o novo componente `app-minimalist-tool-call`.

    ```html
    <!-- Em tool-interaction.component.html -->
    <app-minimalist-tool-call [toolInteraction]="interaction"></app-minimalist-tool-call>
    ```
    A lógica que exibia os parâmetros diretamente no `tool-interaction.component.html` será movida para o componente/serviço do modal.

5.  **Refatorar o Módulo Principal:**
    -   Declare e importe o `MinimalistToolCallComponent` no módulo apropriado (provavelmente `app.module.ts` ou um módulo compartilhado) para que ele possa ser usado em outros componentes.

Este plano divide as tarefas de forma que possam ser trabalhadas em paralelo por dois sub-agentes, um para cada tarefa principal.
