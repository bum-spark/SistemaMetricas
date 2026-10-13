import { DestroyRef, effect, inject, Signal, signal, untracked } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

// `cargadoEn`: reloj del cliente cuando llegaron los datos ("Datos cargados hace X min").
export type Carga<T> = { estado: 'cargando' } | { estado: 'listo'; datos: T; cargadoEn: Date } | { estado: 'error'; error: unknown };

export interface CargaReactiva<T> {
  readonly carga: Signal<Carga<T>>;
  reintentar(): void;
}

// Pide datos cada vez que cambian las señales que lee `origen` (p. ej. el juego y los filtros
// de la URL) y expone el estado para la vista: cargando (skeleton), listo o error. Cancela la
// petición anterior si los filtros cambian antes de que responda. Debe llamarse en un
// contexto de inyección (constructor o inicializador de campo de un componente).
export function cargaReactiva<T>(origen: () => Observable<T> | null): CargaReactiva<T> {
  const carga = signal<Carga<T>>({ estado: 'cargando' });
  const intento = signal(0);
  let sub: Subscription | undefined;

  effect(() => {
    intento();
    const peticion = origen();
    untracked(() => {
      sub?.unsubscribe();
      carga.set({ estado: 'cargando' });
      if (!peticion) {
        return;
      }
      sub = peticion.subscribe({
        next: (datos) => carga.set({ estado: 'listo', datos, cargadoEn: new Date() }),
        error: (error: unknown) => carga.set({ estado: 'error', error }),
      });
    });
  });
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());

  return { carga: carga.asReadonly(), reintentar: () => intento.update((n) => n + 1) };
}

// El momento de carga más reciente entre varias cargas listas (null si alguna no está lista).
export function cargadoEnDe(...cargas: Carga<unknown>[]): Date | null {
  let ultimo: Date | null = null;
  for (const c of cargas) {
    if (c.estado !== 'listo') {
      return null;
    }
    if (!ultimo || c.cargadoEn > ultimo) {
      ultimo = c.cargadoEn;
    }
  }
  return ultimo;
}
