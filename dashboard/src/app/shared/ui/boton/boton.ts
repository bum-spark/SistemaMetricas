import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';
export type TamanoBoton = 'compacto' | 'normal' | 'grande';

// Botón (DISENO_DASHBOARD.md §4) sobre un <button> nativo: <button xa-boton variante="primario">.
@Component({
  selector: 'button[xa-boton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'xa-boton',
    '[class]': '"xa-boton--" + variante() + " xa-boton--" + tamano()',
    '[class.xa-boton--cargando]': 'cargando()',
    '[class.xa-boton--bloque]': 'bloque()',
    '[attr.aria-busy]': 'cargando() || null',
    '[disabled]': 'deshabilitado() || cargando()',
  },
  template: `
    @if (cargando()) {
      <span class="xa-boton__spinner" aria-hidden="true"></span>
    }
    <span class="xa-boton__texto"><ng-content /></span>
  `,
  styleUrl: './boton.css',
})
export class Boton {
  readonly variante = input<VarianteBoton>('secundario');
  readonly tamano = input<TamanoBoton>('normal');
  readonly cargando = input(false);
  readonly deshabilitado = input(false);
  readonly bloque = input(false);
}
