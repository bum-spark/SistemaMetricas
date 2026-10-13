import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CONFIG } from '../config';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    sessionStorage.setItem(
      'xa.sesion',
      JSON.stringify({ token: 'jwt-1', expiraEn: '2099-01-01T00:00:00.000Z', admin: { email: 'a', nombre: 'A', juegosPermitidos: [] } }),
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    sessionStorage.clear();
  });

  it('agrega el Bearer solo a las peticiones a la API', () => {
    http.get(`${CONFIG.apiUrl}/juegos`).subscribe();
    http.get('/marca/estudio-xolos.png').subscribe();
    expect(backend.expectOne(`${CONFIG.apiUrl}/juegos`).request.headers.get('Authorization')).toBe('Bearer jwt-1');
    expect(backend.expectOne('/marca/estudio-xolos.png').request.headers.has('Authorization')).toBe(false);
  });

  it('no manda el token al login', () => {
    http.post(`${CONFIG.apiUrl}/auth/login`, {}).subscribe();
    expect(backend.expectOne(`${CONFIG.apiUrl}/auth/login`).request.headers.has('Authorization')).toBe(false);
  });

  it('ante un 401 cierra la sesión y manda a login con el destino', () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http.get(`${CONFIG.apiUrl}/juegos`).subscribe({ error: () => undefined });
    backend.expectOne(`${CONFIG.apiUrl}/juegos`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(TestBed.inject(AuthService).token()).toBeNull();
    expect(navegar).toHaveBeenCalledWith(['/login'], { queryParams: { destino: '/', motivo: 'expirada' } });
  });

  it('un 401 del login no redirige (lo maneja la pantalla)', () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
    http.post(`${CONFIG.apiUrl}/auth/login`, {}).subscribe({ error: () => undefined });
    backend.expectOne(`${CONFIG.apiUrl}/auth/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(navegar).not.toHaveBeenCalled();
  });
});
