import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { Catalogo, DetalleJuego } from '../app/core/api/tipos';
import { CONFIG } from '../app/core/config';
import { Juego } from '../app/features/juego/juego';
import { juegoDePrueba } from './juegos';

// Catálogo ficticio para los specs de las vistas de un juego (IDs inventados a propósito:
// el código no debe depender de los del juego real).
export const CATALOGO_PRUEBA: Catalogo = {
  duracionEsperadaMs: 1_200_000,
  tiposEvento: [],
  niveles: [
    { nivelId: 'nivel_a', nombre: 'Nivel A', orden: 1 },
    { nivelId: 'nivel_b', nombre: 'Nivel B', orden: 2 },
  ],
  causasMuerte: [
    { causa: 'pinchos', nombre: 'Pinchos' },
    { causa: 'agua', nombre: 'Agua' },
  ],
  logros: [],
  coleccionables: [],
};

export function detalleDePrueba(extra: Partial<DetalleJuego> = {}): DetalleJuego {
  const j = juegoDePrueba();
  return {
    juegoId: j.juegoId,
    nombre: j.nombre,
    slug: j.slug,
    logoUrl: null,
    versionActual: '1.0.0',
    activo: true,
    catalogo: CATALOGO_PRUEBA,
    filtros: { buildVersions: ['1.0.0', '1.0.1'], plataformas: ['android', 'windows'] },
    contieneDatosSeed: false,
    ...extra,
  };
}

@Component({ imports: [RouterOutlet], template: '<router-outlet />', changeDetection: ChangeDetectionStrategy.OnPush })
class Anfitrion {}

export interface MontajeJuego {
  fixture: ComponentFixture<Anfitrion>;
  el: HTMLElement;
  http: HttpTestingController;
  router: Router;
  asentar: () => Promise<void>;
  urlEstadistica: (endpoint: string) => string;
}

// Monta /juegos/juego-uno/<seccion> con el componente Juego real, responde la lista de juegos
// y el detalle con el catálogo de prueba. Las peticiones de estadísticas quedan para el spec.
export async function montarVistaJuego(vista: Type<unknown>, seccion = '', url?: string): Promise<MontajeJuego> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'juegos/:slug', component: Juego, children: [{ path: seccion, component: vista }] }]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(Anfitrion);
  const router = TestBed.inject(Router);
  const http = TestBed.inject(HttpTestingController);
  const asentar = async () => {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  await router.navigateByUrl(url ?? `/juegos/juego-uno${seccion ? '/' + seccion : ''}`);
  await asentar();
  const j = juegoDePrueba();
  http.expectOne(`${CONFIG.apiUrl}/juegos?limite=100`).flush({ datos: [j], pagina: 1, limite: 100, total: 1, origen: 'todos' });
  await asentar();
  http.expectOne(`${CONFIG.apiUrl}/juegos/${j.juegoId}`).flush(detalleDePrueba());
  await asentar();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    http,
    router,
    asentar,
    urlEstadistica: (endpoint) => `${CONFIG.apiUrl}/estadisticas/${j.juegoId}/${endpoint}`,
  };
}
