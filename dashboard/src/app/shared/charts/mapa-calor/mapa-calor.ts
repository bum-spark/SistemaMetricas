import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { LimitesNivel } from '../../../core/api/tipos';
import { ES } from '../../../i18n/es';
import { formatearEntero } from '../../formato/formato';
import { colorCalor, escalaCalor, token } from '../chart-theme';
import { aMundo, aPixel, CeldaAgregada, celdaEn, limitesEfectivos } from './geometria';

const T = ES.muertes;
const decimal = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Mapa de calor de muertes en canvas (DISENO_DASHBOARD.md §5): imagen del nivel atenuada al
// 60 % y, encima, un degradado radial por celda con la escala secuencial; coordenadas del
// mundo escaladas con `limites` (Y invertido). Lectura de coordenadas al mover el puntero y
// leyenda de escala abajo. Sin imagen: fondo --bg-2 con cuadrícula y aviso.
@Component({
  selector: 'xa-mapa-calor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lienzo" #contenedor>
      <canvas
        #lienzo
        role="img"
        [attr.aria-label]="alternativa()"
        (pointermove)="mover($event)"
        (pointerleave)="lectura.set(null)"
      ></canvas>
      @if (!imagenUrl()) {
        <p class="aviso">{{ textos.sinImagen }}</p>
      }
    </div>
    <div class="pie">
      <p class="lectura cifras" aria-live="off">{{ lectura() ?? textos.lecturaVacia }}</p>
      <div class="escala" aria-hidden="true">
        <span>{{ textos.escalaMin }}</span>
        <span class="escala__barra"></span>
        <span>{{ textos.escalaMax(maximoTexto()) }}</span>
      </div>
    </div>
  `,
  styleUrl: './mapa-calor.css',
})
export class MapaCalor {
  readonly celdas = input.required<CeldaAgregada[]>();
  readonly celda = input.required<number>();
  readonly limites = input<LimitesNivel | null>(null);
  readonly imagenUrl = input<string | null>(null);
  readonly nombreCausa = input<(causa: string) => string>((c) => c);
  readonly alternativa = input.required<string>();

  protected readonly textos = T;
  protected readonly lectura = signal<string | null>(null);
  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly imagen = signal<HTMLImageElement | null>(null);
  private readonly ancho = signal(0);
  private readonly maximo = computed(() => this.celdas().reduce((m, c) => Math.max(m, c.muertes), 0));
  protected readonly maximoTexto = computed(() => formatearEntero(this.maximo()));
  private readonly limitesUsados = computed(() => limitesEfectivos(this.limites(), this.celdas(), this.celda()));

  constructor() {
    // La imagen se carga aparte (misma origen: /niveles/...); al cargar se vuelve a dibujar.
    effect(() => {
      const url = this.imagenUrl();
      this.imagen.set(null);
      if (!url) {
        return;
      }
      const img = new Image();
      img.onload = () => this.imagen.set(img);
      img.src = url;
    });
    afterNextRender(() => {
      const observador = new ResizeObserver((entradas) => this.ancho.set(Math.floor(entradas[0]!.contentRect.width)));
      observador.observe(this.contenedor().nativeElement);
      this.destruir = () => observador.disconnect();
    });
    inject(DestroyRef).onDestroy(() => this.destruir?.());
    effect(() => this.dibujar());
  }

  private destruir: (() => void) | undefined;

  private dibujar(): void {
    let ancho = this.ancho();
    const l = this.limitesUsados();
    const celdas = this.celdas();
    const imagen = this.imagen();
    const canvas = this.lienzo().nativeElement;
    const ctx = ancho > 0 ? canvas.getContext('2d') : null;
    if (!ctx) {
      return;
    }
    // Proporción del nivel; un nivel muy vertical se limita en alto y se angosta (centrado).
    const altoMaximo = (parseFloat(token('--space-8')) || 64) * 8;
    const proporcion = l ? (l.maxY - l.minY) / (l.maxX - l.minX) : 0.25;
    const alto = Math.max(1, Math.min(Math.round(ancho * proporcion), altoMaximo));
    ancho = Math.min(ancho, Math.round(alto / proporcion));
    const escala = window.devicePixelRatio || 1;
    canvas.width = ancho * escala;
    canvas.height = alto * escala;
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${alto}px`;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    if (imagen) {
      ctx.globalAlpha = parseFloat(token('--opacidad-atenuado')) || 0.6;
      ctx.drawImage(imagen, 0, 0, ancho, alto);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = token('--bg-2');
      ctx.fillRect(0, 0, ancho, alto);
      ctx.strokeStyle = token('--border-subtle');
      const paso = parseFloat(token('--space-6')) || 32;
      for (let x = paso; x < ancho; x += paso) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, alto);
        ctx.stroke();
      }
      for (let y = paso; y < alto; y += paso) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ancho, y);
        ctx.stroke();
      }
    }
    if (!l) {
      return;
    }

    // Degradado radial por celda; las más calientes al final para que queden encima.
    const max = this.maximo() || 1;
    const escalaColores = escalaCalor();
    const lado = (this.celda() / (l.maxX - l.minX)) * ancho;
    const radio = Math.max(lado * 1.2, 10);
    for (const c of [...celdas].sort((a, b) => a.muertes - b.muertes)) {
      const { px, py } = aPixel(c.x + this.celda() / 2, c.y + this.celda() / 2, l, ancho, alto);
      const t = c.muertes / max;
      const [r, g, b] = colorCalor(t, escalaColores);
      const degradado = ctx.createRadialGradient(px, py, 0, px, py, radio);
      degradado.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.35 + 0.6 * t})`);
      degradado.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = degradado;
      ctx.beginPath();
      ctx.arc(px, py, radio, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  protected mover(evento: PointerEvent): void {
    const l = this.limitesUsados();
    const canvas = this.lienzo().nativeElement;
    if (!l) {
      return;
    }
    const caja = canvas.getBoundingClientRect();
    const { x, y } = aMundo(evento.clientX - caja.left, evento.clientY - caja.top, l, caja.width, caja.height);
    const celda = celdaEn(x, y, this.celdas(), this.celda());
    const coordenadas = T.lectura(decimal.format(x), decimal.format(y));
    this.lectura.set(celda ? `${coordenadas} · ${T.lecturaCelda(formatearEntero(celda.muertes), this.nombreCausa()(celda.causaDominante))}` : coordenadas);
  }
}
