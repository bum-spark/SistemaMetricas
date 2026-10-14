import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';

// Fondos del login: arte del juego del estudio, optimizado a WebP (public/login/). El primero es
// el que se ve al abrir; el orden está elegido para que el mejor vaya primero (S-66).
export const FONDOS_LOGIN = ['fondo-01', 'fondo-02', 'fondo-03', 'fondo-04', 'fondo-05', 'fondo-06'] as const;
export const INTERVALO_MS = 7000;
// Debe coincidir con --login-fundido (1.2 s) en tokens.css.
export const FUNDIDO_MS = 1200;
const MEDIA_MOVIL = '(max-width: 767px)';

export function rutaFondo(nombre: string, movil: boolean): string {
  return `login/${nombre}${movil ? '-960' : ''}.webp`;
}

function coincide(consulta: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(consulta).matches;
}

// Precarga una imagen (sin mostrarla); resuelve aunque falle, para no detener el carrusel.
function precargar(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return typeof img.decode === 'function'
    ? img.decode().catch(() => undefined)
    : new Promise((r) => {
        img.onload = img.onerror = () => r();
      });
}

// Carrusel decorativo a pantalla completa (DISENO_DASHBOARD.md §6, excepción del login):
// fundido cruzado de 1.2 s cada 7 s con un zoom muy sutil y una capa oscura encima.
// - Al abrir solo se pide la primera imagen; las demás se precargan cuando el formulario ya
//   es interactivo, y la siguiente se asegura (decode) justo antes de mostrarse.
// - Se pausa con la pestaña oculta. Con prefers-reduced-motion: una sola imagen fija.
// - En pantallas de hasta 767 px se usan las variantes de 960 px (<picture>).
@Component({
  selector: 'xa-fondo-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.fondo--quieto]': 'reducido' },
  template: `
    @for (nombre of visibles(); track nombre) {
      <picture class="fondo" [class.fondo--activo]="nombre === activo()">
        <source [attr.media]="mediaMovil" [attr.srcset]="ruta(nombre, true)" />
        <img [src]="ruta(nombre, false)" alt="" [attr.fetchpriority]="nombre === fondos[0] ? 'high' : null" decoding="async" />
      </picture>
    }
    <div class="capa"></div>
  `,
  styleUrl: './fondo-login.css',
})
export class FondoLogin {
  protected readonly fondos = FONDOS_LOGIN;
  protected readonly mediaMovil = MEDIA_MOVIL;
  protected readonly reducido = coincide('(prefers-reduced-motion: reduce)');
  private readonly indice = signal(0);
  // Solo se agregan al DOM las imágenes ya precargadas (así no se piden antes de tiempo).
  private readonly cargadas = signal<ReadonlySet<string>>(new Set([FONDOS_LOGIN[0]]));
  protected readonly activo = computed(() => FONDOS_LOGIN[this.indice()]!);
  protected readonly visibles = computed(() => FONDOS_LOGIN.filter((f) => this.cargadas().has(f)));

  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private destruido = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.destruido = true;
      this.detener();
      document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    });
    if (this.reducido) {
      return; // una sola imagen fija: sin carrusel ni precargas
    }
    afterNextRender(() => {
      document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
      // El formulario ya es interactivo: precarga el resto con baja prioridad, en orden.
      const ocioso = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
      ocioso(() => void this.precargarResto());
      this.programar();
    });
  }

  protected ruta(nombre: string, movil: boolean): string {
    return rutaFondo(nombre, movil);
  }

  private async precargarResto(): Promise<void> {
    for (const nombre of FONDOS_LOGIN.slice(1)) {
      if (this.destruido) return;
      await this.asegurar(nombre);
    }
  }

  private async asegurar(nombre: string): Promise<void> {
    if (!this.cargadas().has(nombre)) {
      await precargar(rutaFondo(nombre, coincide(MEDIA_MOVIL)));
      this.cargadas.update((s) => new Set([...s, nombre]));
    }
  }

  private programar(): void {
    this.detener();
    if (this.destruido || document.hidden) return;
    this.temporizador = setTimeout(() => void this.avanzar(), INTERVALO_MS);
  }

  private async avanzar(): Promise<void> {
    const siguiente = (this.indice() + 1) % FONDOS_LOGIN.length;
    await this.asegurar(FONDOS_LOGIN[siguiente]!); // la siguiente, justo antes de mostrarse
    if (this.destruido) return;
    this.indice.set(siguiente);
    this.programar();
  }

  private detener(): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }

  private readonly alCambiarVisibilidad = () => (document.hidden ? this.detener() : this.programar());
}
