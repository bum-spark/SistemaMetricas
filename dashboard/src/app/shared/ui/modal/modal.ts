import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';

let siguienteId = 0;

// Modal (S-68) sobre <dialog> nativo: atrapa el foco, Esc lo cierra y al cerrar el foco vuelve
// al control que lo abrió. Superficie --bg-1, borde --border-default, --radius-lg y
// --shadow-popover; el fondo de la página se atenúa con --bg-0. Lo abre y cierra el padre con
// `abierto`; Esc o el botón de cerrar emiten `cerrar`.
@Component({
  selector: 'xa-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo class="modal" [attr.aria-labelledby]="idTitulo" [attr.aria-describedby]="ayuda() ? idAyuda : null" (cancel)="alCancelar($event)">
      <header class="modal__cabecera">
        <h2 class="modal__titulo" [id]="idTitulo">{{ titulo() }}</h2>
        @if (ayuda()) {
          <p class="modal__ayuda" [id]="idAyuda">{{ ayuda() }}</p>
        }
      </header>
      <ng-content />
    </dialog>
  `,
  styles: `
    .modal {
      width: min(var(--modal-ancho), calc(100vw - 2 * var(--space-4)));
      max-height: calc(100vh - 2 * var(--space-4));
      overflow-y: auto;
      padding: var(--space-5);
      background: var(--bg-1);
      color: var(--text-1);
      border: var(--borde) solid var(--border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-popover);
    }
    .modal::backdrop {
      background: var(--bg-0);
      opacity: var(--opacidad-atenuado);
    }
    .modal__cabecera { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-5); }
    .modal__titulo {
      font-family: var(--font-display);
      font-size: var(--fs-titulo-seccion);
      line-height: var(--lh-titulo-seccion);
      font-weight: var(--fw-semibold);
    }
    .modal__ayuda { font-size: var(--fs-secundario); line-height: var(--lh-secundario); color: var(--text-2); }
  `,
})
export class Modal {
  readonly titulo = input.required<string>();
  readonly ayuda = input<string | null>(null);
  readonly abierto = input(false);
  readonly cerrar = output();

  protected readonly idTitulo = `xa-modal-${++siguienteId}`;
  protected readonly idAyuda = `${this.idTitulo}-ayuda`;
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    effect(() => {
      const d = this.dialogo().nativeElement;
      if (this.abierto() && !d.open) {
        // jsdom no implementa showModal: en los specs basta con el atributo open.
        if (typeof d.showModal === 'function') {
          d.showModal();
        } else {
          d.setAttribute('open', '');
        }
      } else if (!this.abierto() && d.open) {
        if (typeof d.close === 'function') {
          d.close();
        } else {
          d.removeAttribute('open');
        }
      }
    });
  }

  // Esc: el padre decide (cierra con `abierto`); así el estado no se desincroniza.
  protected alCancelar(evento: Event): void {
    evento.preventDefault();
    this.cerrar.emit();
  }
}
