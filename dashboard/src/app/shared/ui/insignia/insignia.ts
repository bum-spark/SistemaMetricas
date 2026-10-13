import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatosInsignia } from '../../umbrales';
import { Badge } from '../badge/badge';

let siguienteId = 0;

// Insignia de diagnóstico (DISENO_DASHBOARD.md §4): badge con tooltip que muestra la regla,
// el valor y la muestra (n). Enfocable con teclado para leer el tooltip.
@Component({
  selector: 'xa-insignia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge],
  host: { tabindex: '0', '[attr.aria-describedby]': 'id', '[class.xa-insignia--derecha]': "alinear() === 'derecha'" },
  template: `
    <xa-badge [tono]="insignia().tono">{{ insignia().etiqueta }}</xa-badge>
    <span class="tooltip" role="tooltip" [id]="id">{{ insignia().regla }}</span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
      border-radius: var(--radius-full);
      cursor: help;
    }
    :host(:focus-visible) { outline: none; box-shadow: var(--focus-ring); }
    .tooltip {
      position: absolute;
      top: calc(100% + var(--space-1));
      left: 0;
      z-index: 15;
      width: max-content;
      max-width: var(--tooltip-ancho-max);
      padding: var(--space-2) var(--space-3);
      background: var(--bg-2);
      border: var(--borde) solid var(--border-default);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-popover);
      color: var(--text-1);
      font-size: var(--fs-etiqueta);
      line-height: var(--lh-etiqueta);
      font-weight: var(--fw-regular);
      white-space: normal;
      opacity: 0;
      visibility: hidden;
      transition: opacity var(--dur-fast) var(--ease), visibility var(--dur-fast);
    }
    :host(.xa-insignia--derecha) .tooltip { left: auto; right: 0; }
    :host(:hover) .tooltip,
    :host(:focus-visible) .tooltip {
      opacity: 1;
      visibility: visible;
      transition-delay: var(--retraso-tooltip);
    }
  `,
})
export class Insignia {
  readonly insignia = input.required<DatosInsignia>();
  // 'derecha' cuando la insignia está pegada al borde derecho (el tooltip crece hacia la izquierda).
  readonly alinear = input<'izquierda' | 'derecha'>('izquierda');
  protected readonly id = `xa-insignia-${++siguienteId}`;
}
