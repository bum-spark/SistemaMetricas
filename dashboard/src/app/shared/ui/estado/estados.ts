import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, LucideIconData, SearchX, TriangleAlert } from 'lucide-angular';
import { ES } from '../../../i18n/es';
import { Boton } from '../boton/boton';

// Estados de vista (DISENO_DASHBOARD.md §4): cargando (skeleton), vacío y error.

// Bloque de skeleton: --bg-2 con brillo suave (sin brillo con prefers-reduced-motion).
@Component({
  selector: 'xa-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: '',
  styles: `
    :host {
      display: block;
      min-height: var(--space-4);
      border-radius: var(--radius-sm);
      background: linear-gradient(90deg, var(--bg-2) 0%, var(--bg-3) 50%, var(--bg-2) 100%);
      background-size: 200% 100%;
      animation: brillo calc(var(--dur-giro) * 2) var(--ease) infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      :host { animation: none; background: var(--bg-2); }
    }
    @keyframes brillo {
      from { background-position: 100% 0; }
      to { background-position: -100% 0; }
    }
  `,
})
export class Skeleton {}

@Component({
  selector: 'xa-estado-vacio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <lucide-icon [img]="icono()" [size]="20" [strokeWidth]="1.75" aria-hidden="true" />
    <h2 class="titulo">{{ titulo() }}</h2>
    @if (ayuda()) {
      <p class="ayuda">{{ ayuda() }}</p>
    }
    <ng-content />
  `,
  styleUrl: './estados.css',
  host: { class: 'xa-estado' },
})
export class EstadoVacio {
  readonly titulo = input.required<string>();
  readonly ayuda = input<string | null>(null);
  readonly icono = input<LucideIconData>(SearchX);
}

@Component({
  selector: 'xa-estado-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, Boton],
  template: `
    <lucide-icon [img]="iconoError" [size]="20" [strokeWidth]="1.75" aria-hidden="true" />
    <h2 class="titulo">{{ titulo() }}</h2>
    @if (ayuda()) {
      <p class="ayuda">{{ ayuda() }}</p>
    }
    <button xa-boton type="button" variante="secundario" (click)="reintentar.emit()">{{ textos.reintentar }}</button>
  `,
  styleUrl: './estados.css',
  host: { class: 'xa-estado xa-estado--error', role: 'alert' },
})
export class EstadoError {
  readonly titulo = input<string>(ES.estados.errorTitulo);
  readonly ayuda = input<string | null>(ES.estados.errorAyuda);
  readonly reintentar = output();
  protected readonly iconoError = TriangleAlert;
  protected readonly textos = ES.estados;
}
