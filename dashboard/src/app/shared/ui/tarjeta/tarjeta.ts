import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ES } from '../../../i18n/es';

let siguienteId = 0;

// Tarjeta (DISENO_DASHBOARD.md §4): título (14/600) y subtítulo-pregunta (13, --text-2) a la
// izquierda; a la derecha, ayuda "?" con tooltip (aparece al foco y al hover, 150 ms).
@Component({
  selector: 'xa-tarjeta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', '[attr.aria-labelledby]': 'idTitulo' },
  template: `
    <header class="cabecera">
      <div class="textos">
        <h2 class="titulo" [id]="idTitulo">{{ titulo() }}</h2>
        @if (pregunta()) {
          <p class="pregunta">{{ pregunta() }}</p>
        }
      </div>
      @if (ayuda()) {
        <span class="ayuda">
          <button type="button" class="ayuda__boton" [attr.aria-describedby]="idAyuda" [attr.aria-label]="textos.ayuda(titulo())">?</button>
          <span class="ayuda__tooltip" role="tooltip" [id]="idAyuda">{{ ayuda() }}</span>
        </span>
      }
    </header>
    <ng-content />
  `,
  styleUrl: './tarjeta.css',
})
export class Tarjeta {
  readonly titulo = input.required<string>();
  readonly pregunta = input<string | null>(null);
  readonly ayuda = input<string | null>(null);
  protected readonly textos = ES.tarjeta;
  protected readonly idTitulo = `xa-tarjeta-${++siguienteId}`;
  protected readonly idAyuda = `${this.idTitulo}-ayuda`;
}
