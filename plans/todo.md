# TODO: Melhorias no Componente de Chat

Este arquivo rastreia o progresso das tarefas delegadas a sub-agentes. Marque a caixa correspondente ao concluir uma tarefa.

## Tarefa 1: Implementar Auto-Scroll no Chat
- [ ] Analisar `frontend/src/app/components/chat/chat.component.ts` e seu template.
- [ ] Adicionar uma referência de template (`#scrollContainer`) ao elemento de contêiner das mensagens.
- [ ] Usar `@ViewChild` para acessar o elemento no componente.
- [ ] Implementar a lógica `scrollToBottom()` no hook `ngAfterViewChecked` ou em resposta a mudanças na lista de mensagens.
- [ ] Testar para garantir que o chat role para o final ao carregar e ao receber novas mensagens.
- [X] **TAREFA CONCLUÍDA** - Marque esta caixa quando todos os passos acima estiverem finalizados.

## Tarefa 2: Melhorar a UI de Chamada de Ferramentas (Tool Call)
- [ ] Gerar um novo componente `MinimalistToolCallComponent` em `frontend/src/app/components/`.
- [ ] Definir um `@Input()` no novo componente para receber os dados da `tool_interaction`.
- [ ] Criar o template HTML para o componente minimalista, mostrando o nome da ferramenta e um botão "Ver Parâmetros".
- [ ] Implementar um método no `MinimalistToolCallComponent` que, ao ser clicado, abra um modal/overlay com os detalhes completos dos parâmetros. (Pode ser necessário criar um componente de diálogo separado para isso).
- [ ] Substituir a renderização atual em `tool-interaction.component.html` pelo novo `<app-minimalist-tool-call>`.
- [ ] Garantir que o novo componente seja declarado e importado corretamente no módulo Angular correspondente.
- [ ] Testar a nova UI para garantir que os detalhes são exibidos corretamente ao clicar no botão.
- [X] **TAREFA CONCLUÍDA** - Marque esta caixa quando todos os passos acima estiverem finalizados.
