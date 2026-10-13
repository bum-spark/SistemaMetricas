import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { ES } from '../../../i18n/es';
import { Badge } from '../badge/badge';

const MS_MINUTO = 60_000;

// Cabecera de página (DISENO_DASHBOARD.md §4): título (28/36) con la versión como badge,
// la pregunta que responde la vista y "Datos cargados hace X min" (reloj del cliente; se
// actualiza cada minuto y se reinicia cuando la vista recarga sus datos).
@Component({
  selector: 'xa-cabecera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge],
  template: `
    <div class="principal">
      <div class="titulo-fila">
        <h1 class="titulo">{{ titulo() }}</h1>
        @if (version()) {
          <xa-badge tono="petal" [attr.title]="tituloVersion()">{{ version() }}</xa-badge>
        }
      </div>
      @if (pregunta()) {
        <p class="pregunta">{{ pregunta() }}</p>
      }
    </div>
    @if (cargadoHace(); as texto) {
      <p class="cargado" aria-live="off">{{ texto }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-2) var(--space-4);
      margin-bottom: var(--space-5);
    }
    .principal { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
    .titulo-fila { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
    .titulo {
      font-family: var(--font-display);
      font-size: var(--fs-titulo-pagina);
      line-height: var(--lh-titulo-pagina);
      font-weight: var(--fw-semibold);
    }
    .pregunta { font-size: var(--fs-secundario); line-height: var(--lh-secundario); color: var(--text-2); }
    .cargado { font-size: var(--fs-etiqueta); line-height: var(--lh-etiqueta); color: var(--text-3); }
  `,
})
export class Cabecera {
  readonly titulo = input.required<string>();
  readonly pregunta = input<string | null>(null);
  readonly version = input<string | null>(null);
  readonly tituloVersion = input<string | null>(null);
  readonly cargadoEn = input<Date | null>(null);

  private readonly ahora = signal(Date.now());
  protected readonly cargadoHace = computed(() => {
    const en = this.cargadoEn();
    return en ? ES.cabecera.cargadoHace(Math.max(0, Math.floor((this.ahora() - en.getTime()) / MS_MINUTO))) : null;
  });

  constructor() {
    const reloj = setInterval(() => this.ahora.set(Date.now()), MS_MINUTO);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }
}
