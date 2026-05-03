import { Component, HostListener } from '@angular/core';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ChatComponent } from './components/chat/chat.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ToolInteractionComponent } from './components/tool-interaction/tool-interaction.component';
import { DeleteConfirmationDialogComponent } from './components/delete-confirmation-dialog/delete-confirmation-dialog.component';
import { RenameConversationDialogComponent } from './components/rename-conversation-dialog/rename-conversation-dialog.component';
import { ChatService } from './services/chat.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SidebarComponent, ChatComponent, SettingsComponent, ToolInteractionComponent, DeleteConfirmationDialogComponent, RenameConversationDialogComponent],
  template: `
    <div class="app-shell">
      <app-sidebar />
      <app-chat style="width: 100%;" />
    </div>
    @if (chat.showSettings()) {
      <app-settings />
    }
    <app-tool-interaction />
    <app-delete-confirmation-dialog />
    <app-rename-conversation-dialog />
  `,
  styles: [`
    :host {
      display: flex;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }
    .app-shell {
      display: flex;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      background: var(--bg-primary);
    }
  `]
})
export class AppComponent {
  constructor(public chat: ChatService) { }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    // Ctrl+N / Cmd+N — nova conversa
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
      event.preventDefault();
      this.chat.createConversation();
    }
  }
}
