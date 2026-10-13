import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Skeleton } from '../estado/estados';

// Tarjeta KPI (DISENO_DASHBOARD.md §4): etiqueta (12/500 mayúscula suave, --text-3), cifra (32/600) y debajo
// el contexto (13, --text-2), p. ej. "esperado ~20:00".
@Component({
  selector: 'xa-kpi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Skeleton],
  template: `
    <p class="etiqueta">{{ etiqueta() }}</p>
    @if (cargando()) {
      <xa-skeleton class="esqueleto-cifra" />
      <xa-skeleton class="esqueleto-contexto" />
    } @else {
      <p class="cifra cifras">{{ valor() }}</p>
      <p class="contexto">{{ contexto() || ' ' }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
      padding: var(--padding-tarjeta);
      background: var(--bg-1);
      border: var(--borde) solid var(--border-default);
      border-radius: var(--radius-md);
    }
    .etiqueta {
      font-size: var(--fs-etiqueta);
      line-height: var(--lh-etiqueta);
      font-weight: var(--fw-medium);
      color: var(--text-3);
      text-transform: uppercase;
      letter-spacing: var(--tracking-etiqueta);
    }
    .cifra {
      font-family: var(--font-display);
      font-size: var(--fs-kpi);
      line-height: var(--lh-kpi);
      font-weight: var(--fw-semibold);
    }
    .contexto {
      min-height: var(--lh-secundario);
      font-size: var(--fs-secundario);
      line-height: var(--lh-secundario);
      color: var(--text-2);
    }
    .esqueleto-cifra { height: var(--lh-kpi); width: 60%; }
    .esqueleto-contexto { height: var(--lh-secundario); width: 80%; }
  `,
})
export class Kpi {
  readonly etiqueta = input.required<string>();
  readonly valor = input<string>('');
  readonly contexto = input<string | null>(null);
  readonly cargando = input(false);
}
