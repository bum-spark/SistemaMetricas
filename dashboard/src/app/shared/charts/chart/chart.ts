import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, untracked, viewChild } from '@angular/core';
import { BarController, BarElement, CategoryScale, Chart, ChartData, ChartOptions, Legend, LinearScale, Tooltip } from 'chart.js';

// Solo lo que usan las gráficas del dashboard (barras): Chart.js con "tree shaking".
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Envoltura propia de Chart.js (DISENO_DASHBOARD.md §5; no ng2-charts). El canvas lleva un
// aria-label con el dato clave y la alternativa textual completa se proyecta (tabla oculta
// visualmente con .solo-lector).
@Component({
  selector: 'xa-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lienzo">
      <canvas #lienzo role="img" [attr.aria-label]="etiquetaAccesible()"></canvas>
    </div>
    <ng-content />
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .lienzo { position: relative; height: var(--alto-grafica, calc(var(--space-8) * 4)); }
  `,
})
export class GraficaChart {
  readonly datos = input.required<ChartData<'bar'>>();
  readonly opciones = input.required<ChartOptions<'bar'>>();
  readonly etiquetaAccesible = input.required<string>();

  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private grafica: Chart<'bar'> | null = null;

  constructor() {
    afterNextRender(() => {
      const contexto = this.lienzo().nativeElement.getContext('2d');
      if (!contexto) {
        return; // sin canvas (p. ej. jsdom en los tests): solo queda la alternativa textual
      }
      this.grafica = new Chart(contexto, { type: 'bar', data: untracked(this.datos), options: untracked(this.opciones) });
    });
    // Datos u opciones nuevos (otro filtro): se actualiza la misma gráfica, sin recrearla.
    effect(() => {
      const datos = this.datos();
      const opciones = this.opciones();
      if (this.grafica) {
        this.grafica.data = datos;
        this.grafica.options = opciones;
        this.grafica.update();
      }
    });
    inject(DestroyRef).onDestroy(() => this.grafica?.destroy());
  }
}
