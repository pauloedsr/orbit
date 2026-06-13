import { Component, EventEmitter, Input, Output, signal, effect, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-mention-autocomplete',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isVisible() && items().length > 0) {
      <div class="autocomplete-panel" [style.transform]="transform()">
        <ul>
          @for (item of items(); track item; let i = $index) {
            <li
              [class.selected]="i === selectedIndex()"
              (mouseover)="selectIndex(i)"
              (click)="confirmSelection()"
            >
              {{ item }}
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: [`
    .autocomplete-panel {
      position: absolute;
      bottom: 100%;
      left: 0;
      width: 100%;
      max-height: 250px;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      box-shadow: 0 -4px 12px rgba(0,0,0,0.2);
      margin-bottom: 6px;
      z-index: 100;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 4px;
    }
    li {
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border-radius: var(--radius-sm);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    li.selected {
      background: var(--bg-hover);
      color: var(--accent);
    }
  `]
})
export class MentionAutocompleteComponent {
  @Input() items = signal<string[]>([]);
  @Input() triggerCoordinates: { x: number; y: number } | null = null;
  @Output() itemSelected = new EventEmitter<string>();

  isVisible = signal(false);
  selectedIndex = signal(0);
  transform = signal('');

  private hostElement: HTMLElement;

  constructor(private elRef: ElementRef) {
    this.hostElement = this.elRef.nativeElement;

    effect(() => {
      const items = this.items();
      this.isVisible.set(items.length > 0);
      this.selectedIndex.set(0);
    }, { allowSignalWrites: true });

    effect(() => {
      const coords = this.triggerCoordinates;
      if (coords) {
        // Lógica para posicionar o painel.
        // Isso é complexo e pode precisar de ajuste.
        // Por agora, vamos usar uma posição fixa relativa ao input.
        this.transform.set(`translateY(-100%)`);
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.isVisible()) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.update(i => (i > 0 ? i - 1 : this.items().length - 1));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.update(i => (i < this.items().length - 1 ? i + 1 : 0));
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      this.confirmSelection();
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  selectIndex(index: number) {
    this.selectedIndex.set(index);
  }

  confirmSelection() {
    if (this.isVisible() && this.items().length > 0) {
      this.itemSelected.emit(this.items()[this.selectedIndex()]);
      this.close();
    }
  }

  close() {
    this.items.set([]);
    this.isVisible.set(false);
  }
}
