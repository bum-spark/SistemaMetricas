import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model } from '@angular/core';

export interface OpcionTab {
  valor: string;
  etiqueta: string;
}

// Tabs de texto (DISENO_DASHBOARD.md §4): subrayado de 2 px --accent en la activa. Patrón
// ARIA de tabs: flechas izquierda/derecha, Inicio y Fin mueven la selección.
@Component({
  selector: 'xa-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'tablist', '[attr.aria-label]': 'etiqueta()', '(keydown)': 'teclado($event)' },
  template: `
    @for (o of opciones(); track o.valor) {
      <button
        type="button"
        role="tab"
        class="tab"
        [attr.aria-selected]="o.valor === seleccion()"
        [attr.tabindex]="o.valor === seleccion() ? 0 : -1"
        (click)="seleccion.set(o.valor)"
      >
        {{ o.etiqueta }}
      </button>
    }
  `,
  styles: `
    :host { display: inline-flex; flex-wrap: wrap; gap: var(--space-1); }
    .tab {
      height: var(--control-alto);
      padding: 0 var(--space-2);
      border: 0;
      border-bottom: var(--barra-activa) solid transparent;
      background: transparent;
      color: var(--text-2);
      font-size: var(--fs-cuerpo);
      font-weight: var(--fw-medium);
      cursor: pointer;
    }
    .tab:hover { color: var(--text-1); }
    .tab[aria-selected='true'] { color: var(--text-1); border-bottom-color: var(--accent); }
  `,
})
export class Tabs {
  readonly opciones = input.required<OpcionTab[]>();
  readonly etiqueta = input.required<string>();
  readonly seleccion = model.required<string>();
  private readonly host = inject(ElementRef<HTMLElement>);

  protected teclado(evento: KeyboardEvent): void {
    const opciones = this.opciones();
    const actual = opciones.findIndex((o) => o.valor === this.seleccion());
    const destino =
      evento.key === 'ArrowRight' ? (actual + 1) % opciones.length
      : evento.key === 'ArrowLeft' ? (actual - 1 + opciones.length) % opciones.length
      : evento.key === 'Home' ? 0
      : evento.key === 'End' ? opciones.length - 1
      : -1;
    if (destino < 0) {
      return;
    }
    evento.preventDefault();
    this.seleccion.set(opciones[destino]!.valor);
    queueMicrotask(() => (this.host.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[destino]?.focus());
  }
}
