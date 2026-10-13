import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIG } from '../config';
import { SaludService } from './salud.service';

const URL = `${CONFIG.apiUrl}/salud`;

describe('SaludService', () => {
  let salud: SaludService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    salud = TestBed.inject(SaludService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    salud.detener();
    vi.useRealTimers();
  });

  const tic = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('un ping que responde queda "en línea" y no vuelve a preguntar', async () => {
    salud.comprobar();
    expect(salud.estado()).toBe('comprobando');
    http.expectOne(URL).flush({ estado: 'ok' });
    await tic(0);
    expect(salud.estado()).toBe('en-linea');
    await tic(60_000);
    http.expectNone(URL);
  });

  it('si no responde en 5 s queda "despertando" y reintenta cada 5 s hasta que responde', async () => {
    salud.comprobar();
    http.expectOne(URL);
    await tic(SaludService.ESPERA_MS);
    expect(salud.estado()).toBe('despertando');
    await tic(SaludService.ESPERA_MS);
    http.match(URL).forEach((r, i, todas) => (i === todas.length - 1 ? r.flush({ estado: 'ok' }) : undefined));
    await tic(0);
    expect(salud.estado()).toBe('en-linea');
  });

  it('se rinde a los ~90 s ("sin conexión") y deja de preguntar', async () => {
    salud.comprobar();
    for (let t = 0; t < SaludService.MAXIMO_MS + SaludService.ESPERA_MS * 2; t += SaludService.ESPERA_MS) {
      http.match(URL).forEach((r) => r.flush({}, { status: 503, statusText: 'Arrancando' }));
      await tic(SaludService.ESPERA_MS);
    }
    expect(salud.estado()).toBe('sin-conexion');
    http.match(URL);
    await tic(30_000);
    http.expectNone(URL);
  });

  it('detener() corta los reintentos', async () => {
    salud.comprobar();
    http.expectOne(URL).flush({}, { status: 502, statusText: 'x' });
    await tic(0);
    expect(salud.estado()).toBe('despertando');
    salud.detener();
    await tic(30_000);
    http.expectNone(URL);
  });
});
