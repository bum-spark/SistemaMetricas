import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIG } from '../config';
import { AuthService } from './auth.service';

const RESPUESTA = {
  token: 'jwt.de.prueba',
  expiraEn: '2099-01-01T00:00:00.000Z',
  admin: { email: 'a@xolos.mx', nombre: 'Admin', juegosPermitidos: [] },
};

function crear(): { auth: AuthService; http: HttpTestingController } {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
}

describe('AuthService', () => {
  beforeEach(() => sessionStorage.clear());

  it('inicia sesión con POST /auth/login y guarda la sesión en memoria y sessionStorage', () => {
    const { auth, http } = crear();
    auth.iniciarSesion('a@xolos.mx', 'secreta').subscribe();
    const req = http.expectOne(`${CONFIG.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@xolos.mx', password: 'secreta' });
    req.flush(RESPUESTA);

    expect(auth.token()).toBe('jwt.de.prueba');
    expect(auth.admin()?.nombre).toBe('Admin');
    expect(auth.estaAutenticado()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('xa.sesion') ?? '{}').token).toBe('jwt.de.prueba');
    http.verify();
  });

  it('recupera la sesión de sessionStorage al recargar', () => {
    sessionStorage.setItem('xa.sesion', JSON.stringify(RESPUESTA));
    expect(crear().auth.estaAutenticado()).toBe(true);
  });

  it('un token vencido cuenta como sin sesión y se borra', () => {
    sessionStorage.setItem('xa.sesion', JSON.stringify({ ...RESPUESTA, expiraEn: '2000-01-01T00:00:00.000Z' }));
    const { auth } = crear();
    expect(auth.estaAutenticado()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(sessionStorage.getItem('xa.sesion')).toBeNull();
  });

  it('ignora una sesión guardada corrupta', () => {
    sessionStorage.setItem('xa.sesion', '{no es json');
    expect(crear().auth.estaAutenticado()).toBe(false);
  });

  it('cerrar sesión limpia memoria y sessionStorage', () => {
    sessionStorage.setItem('xa.sesion', JSON.stringify(RESPUESTA));
    const { auth } = crear();
    auth.cerrarSesion();
    expect(auth.estaAutenticado()).toBe(false);
    expect(sessionStorage.getItem('xa.sesion')).toBeNull();
  });
});
