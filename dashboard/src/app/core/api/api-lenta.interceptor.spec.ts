import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIG } from '../config';
import { apiLentaInterceptor } from './api-lenta.interceptor';
import { EstadoApiService } from './estado-api.service';

describe('apiLentaInterceptor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiLentaInterceptor])), provideHttpClientTesting()],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('avisa "despertando" si la API tarda más de 8 s y lo quita al responder', () => {
    const estado = TestBed.inject(EstadoApiService);
    const backend = TestBed.inject(HttpTestingController);
    TestBed.inject(HttpClient).get(`${CONFIG.apiUrl}/juegos`).subscribe();

    vi.advanceTimersByTime(CONFIG.msAvisoApiDormida - 1);
    expect(estado.despertando()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(estado.despertando()).toBe(true);

    backend.expectOne(`${CONFIG.apiUrl}/juegos`).flush({});
    expect(estado.despertando()).toBe(false);
  });

  it('una respuesta rápida no muestra el aviso', () => {
    const estado = TestBed.inject(EstadoApiService);
    TestBed.inject(HttpClient).get(`${CONFIG.apiUrl}/juegos`).subscribe();
    TestBed.inject(HttpTestingController).expectOne(`${CONFIG.apiUrl}/juegos`).flush({});
    vi.advanceTimersByTime(CONFIG.msAvisoApiDormida * 2);
    expect(estado.despertando()).toBe(false);
  });
});
