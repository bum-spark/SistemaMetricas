import { computed, Injectable, signal } from '@angular/core';

// Cuenta las peticiones que llevan más de CONFIG.msAvisoApiDormida sin respuesta: la API en
// el plan gratuito se duerme y tarda ~1 min en despertar (DISENO_DASHBOARD.md §4).
@Injectable({ providedIn: 'root' })
export class EstadoApiService {
  private readonly lentas = signal(0);
  readonly despertando = computed(() => this.lentas() > 0);

  marcarLenta(): void {
    this.lentas.update((n) => n + 1);
  }

  terminarLenta(): void {
    this.lentas.update((n) => Math.max(0, n - 1));
  }
}
