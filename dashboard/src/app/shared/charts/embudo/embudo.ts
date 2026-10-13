import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ES } from '../../../i18n/es';
import { formatearEntero, formatearPorcentaje } from '../../formato/formato';

export interface PasoVisible {
  etiqueta: string;
  jugadores: number;
  porcentaje: number; // respecto al primer paso, 0–100 (de la API)
}

export interface Caida {
  desde: number; // índice del paso anterior
  hasta: number; // índice del paso con la caída
  jugadores: number;
  porcentaje: number; // pérdida relativa al paso anterior, 0–100
}

// Pérdida entre pasos consecutivos (relativa al paso anterior).
export function caidas(pasos: readonly PasoVisible[]): Caida[] {
  return pasos.slice(1).map((paso, i) => {
    const previo = pasos[i]!;
    const perdidos = Math.max(0, previo.jugadores - paso.jugadores);
    return { desde: i, hasta: i + 1, jugadores: perdidos, porcentaje: previo.jugadores > 0 ? (perdidos / previo.jugadores) * 100 : 0 };
  });
}

// La mayor caída del embudo (null si nadie se pierde).
export function mayorCaida(pasos: readonly PasoVisible[]): Caida | null {
  return caidas(pasos).reduce<Caida | null>((max, c) => (c.jugadores > 0 && (!max || c.porcentaje > max.porcentaje) ? c : max), null);
}

// Embudo de progresión (DISENO_DASHBOARD.md §5): barras horizontales decrecientes en SVG,
// --petal con opacidad decreciente; cada barra con jugadores y % respecto al primero; entre
// barras la caída en --danger; la mayor caída con borde --danger.
@Component({
  selector: 'xa-embudo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="embudo" [class.embudo--compacto]="compacto()">
      @for (paso of pasos(); track $index; let i = $index) {
        <li class="paso" [class.paso--mayor-caida]="mayor()?.hasta === i" [style.--paso]="fraccion(i)">
          @if (i > 0) {
            <p class="caida">
              <span aria-hidden="true">−</span><span class="solo-lector">{{ textos.perdida }}</span>{{ porcentaje(listaCaidas()[i - 1]!.porcentaje) }}
            </p>
          }
          <div class="fila">
            <span class="etiqueta">{{ paso.etiqueta }}</span>
            <span class="valor cifras">{{ entero(paso.jugadores) }} · {{ porcentaje(paso.porcentaje) }}</span>
          </div>
          <svg class="barra" aria-hidden="true" focusable="false">
            <rect class="barra__fondo" x="0" y="0" width="100%" height="100%" />
            <rect class="barra__valor" x="0" y="0" [attr.width]="ancho(paso.porcentaje)" height="100%" />
          </svg>
        </li>
      }
    </ol>
  `,
  styleUrl: './embudo.css',
})
export class Embudo {
  readonly pasos = input.required<PasoVisible[]>();
  readonly compacto = input(false);
  protected readonly textos = ES.embudo;
  protected readonly entero = formatearEntero;
  protected readonly porcentaje = formatearPorcentaje;
  protected readonly listaCaidas = computed(() => caidas(this.pasos()));
  protected readonly mayor = computed(() => mayorCaida(this.pasos()));

  // 0 en el primer paso, 1 en el último: controla la opacidad decreciente en CSS.
  protected fraccion(i: number): number {
    const n = this.pasos().length;
    return n > 1 ? i / (n - 1) : 0;
  }

  // Una barra con jugadores nunca queda invisible (mínimo 0.5 %).
  protected ancho(porcentaje: number): string {
    return `${porcentaje > 0 ? Math.max(0.5, Math.min(100, porcentaje)) : 0}%`;
  }
}
