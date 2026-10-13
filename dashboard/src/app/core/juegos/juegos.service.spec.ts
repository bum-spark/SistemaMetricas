import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { juegoDePrueba } from '../../../testing/juegos';
import { CONFIG } from '../config';
import { JuegosService } from './juegos.service';

const URL = `${CONFIG.apiUrl}/juegos?limite=100`;

describe('JuegosService', () => {
  let servicio: JuegosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(JuegosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('carga la lista una sola vez aunque se pida varias veces a la vez', async () => {
    const a = servicio.cargar();
    const b = servicio.cargar();
    expect(servicio.estado()).toBe('cargando');
    http.expectOne(URL).flush({ datos: [juegoDePrueba()], pagina: 1, limite: 100, total: 1, origen: 'todos' });
    await Promise.all([a, b]);
    expect(servicio.estado()).toBe('listo');
    await servicio.cargar();
    http.expectNone(URL);
    expect(servicio.juegos()).toHaveLength(1);
  });

  it('resuelve un slug a su juego', async () => {
    const p = servicio.cargar();
    http.expectOne(URL).flush({ datos: [juegoDePrueba(), juegoDePrueba({ slug: 'otro', juegoId: 'x' })], pagina: 1, limite: 100, total: 2, origen: 'todos' });
    await p;
    expect(servicio.porSlug('otro')?.juegoId).toBe('x');
    expect(servicio.porSlug('no-existe')).toBeUndefined();
    expect(servicio.porSlug(null)).toBeUndefined();
  });

  it('marca error si falla y permite reintentar con forzar', async () => {
    const p = servicio.cargar();
    http.expectOne(URL).flush({}, { status: 500, statusText: 'Error' });
    await expect(p).rejects.toBeTruthy();
    expect(servicio.estado()).toBe('error');

    const q = servicio.cargar(true);
    http.expectOne(URL).flush({ datos: [], pagina: 1, limite: 100, total: 0, origen: 'todos' });
    await q;
    expect(servicio.estado()).toBe('listo');
  });

  it('limpiar vacía la lista (al cerrar sesión)', async () => {
    const p = servicio.cargar();
    http.expectOne(URL).flush({ datos: [juegoDePrueba()], pagina: 1, limite: 100, total: 1, origen: 'todos' });
    await p;
    servicio.limpiar();
    expect(servicio.juegos()).toEqual([]);
    expect(servicio.estado()).toBe('inicial');
  });
});
