import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ListaJuegos, ResumenJuego } from '../api/tipos';
import { CONFIG } from '../config';

export type EstadoCarga = 'inicial' | 'cargando' | 'listo' | 'error';

// Máximo que acepta GET /juegos por página; el estudio tiene pocos juegos.
const LIMITE = 100;

// Lista de juegos permitidos al admin, en memoria (DISENO_DASHBOARD.md §6): alimenta la
// pantalla /juegos, el selector de la barra superior y la traducción slug → juegoId.
@Injectable({ providedIn: 'root' })
export class JuegosService {
  private readonly http = inject(HttpClient);
  private readonly lista = signal<ResumenJuego[]>([]);
  private readonly estadoInterno = signal<EstadoCarga>('inicial');
  private readonly cargadoEnInterno = signal<Date | null>(null);
  private pendiente: Promise<ResumenJuego[]> | null = null;

  readonly juegos = this.lista.asReadonly();
  readonly estado = this.estadoInterno.asReadonly();
  readonly cargadoEn = this.cargadoEnInterno.asReadonly();
  readonly cargado = computed(() => this.estadoInterno() === 'listo');

  // Carga una sola vez (las llamadas simultáneas comparten la petición); `forzar` recarga.
  cargar(forzar = false): Promise<ResumenJuego[]> {
    if (this.estadoInterno() === 'listo' && !forzar) {
      return Promise.resolve(this.lista());
    }
    if (this.pendiente) {
      return this.pendiente;
    }
    this.estadoInterno.set('cargando');
    this.pendiente = firstValueFrom(this.http.get<ListaJuegos>(`${CONFIG.apiUrl}/juegos`, { params: { limite: LIMITE } }))
      .then((r) => {
        this.lista.set(r.datos);
        this.cargadoEnInterno.set(new Date());
        this.estadoInterno.set('listo');
        return r.datos;
      })
      .catch((err: unknown) => {
        this.estadoInterno.set('error');
        throw err;
      })
      .finally(() => {
        this.pendiente = null;
      });
    return this.pendiente;
  }

  porSlug(slug: string | null | undefined): ResumenJuego | undefined {
    return slug ? this.lista().find((j) => j.slug === slug) : undefined;
  }

  // Al cerrar sesión: otro admin puede tener otros juegos permitidos.
  limpiar(): void {
    this.lista.set([]);
    this.estadoInterno.set('inicial');
  }
}
