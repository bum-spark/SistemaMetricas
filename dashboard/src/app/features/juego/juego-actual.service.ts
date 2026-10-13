import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { DetalleJuego } from '../../core/api/tipos';
import { CONFIG } from '../../core/config';
import { JuegosService } from '../../core/juegos/juegos.service';
import { cargaReactiva } from '../../shared/carga';
import { FiltrosVista, filtrosAApi, filtrosAUrl, filtrosDeUrl, filtrosIguales } from './filtros';

// Estado del juego abierto en /juegos/:slug/... (se provee en el componente Juego):
// slug → juegoId con la lista en memoria, detalle (catálogo y opciones de filtros) con
// GET /juegos/:juegoId y filtros leídos de la URL.
@Injectable()
export class JuegoActualService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly juegos = inject(JuegosService);

  readonly slug = toSignal(this.ruta.paramMap.pipe(map((p) => p.get('slug'))), { initialValue: null });
  readonly resumen = computed(() => this.juegos.porSlug(this.slug()));
  readonly juegoId = computed(() => this.resumen()?.juegoId ?? null);

  private readonly filtrosUrl = toSignal(this.ruta.queryParamMap.pipe(map(filtrosDeUrl)), {
    initialValue: filtrosDeUrl(this.ruta.snapshot.queryParamMap),
  });
  // Misma referencia mientras no cambien los valores: no se repiten peticiones.
  readonly filtros = computed(() => this.filtrosUrl(), { equal: filtrosIguales });
  readonly filtrosApi = computed(() => filtrosAApi(this.filtros()));

  private readonly cargaDetalle = cargaReactiva(() => {
    const id = this.juegoId();
    return id ? this.http.get<DetalleJuego>(`${CONFIG.apiUrl}/juegos/${encodeURIComponent(id)}`) : null;
  });
  readonly detalle = this.cargaDetalle.carga;
  readonly catalogo = computed(() => {
    const d = this.detalle();
    return d.estado === 'listo' ? d.datos.catalogo : null;
  });

  // true mientras se carga la lista de juegos (el slug aún no se puede resolver).
  readonly resolviendo = computed(() => this.juegos.estado() === 'inicial' || this.juegos.estado() === 'cargando');
  readonly listaFallo = computed(() => this.juegos.estado() === 'error');
  readonly noEncontrado = computed(() => this.juegos.estado() === 'listo' && !this.resumen());

  constructor() {
    // Resuelve el slug aunque se entre directo a la URL (la lista se pide una sola vez).
    this.juegos.cargar().catch(() => undefined);
  }

  reintentarDetalle(): void {
    this.cargaDetalle.reintentar();
  }

  reintentarLista(): void {
    this.juegos.cargar(true).catch(() => undefined);
  }

  aplicarFiltros(cambios: Partial<FiltrosVista>): void {
    const nuevos = { ...this.filtros(), ...cambios };
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: filtrosAUrl(nuevos), queryParamsHandling: 'merge' });
  }
}
