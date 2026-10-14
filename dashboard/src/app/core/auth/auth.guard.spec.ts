import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { authGuard, destinoSeguro, soloAdminGuard } from './auth.guard';

function ejecutar(url: string): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

describe('authGuard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });

  it('sin sesión manda a /login conservando el destino', () => {
    const r = ejecutar('/juegos/la-casa/muertes?desde=2026-10-01');
    expect(TestBed.inject(Router).serializeUrl(r as UrlTree)).toBe(
      '/login?destino=%2Fjuegos%2Fla-casa%2Fmuertes%3Fdesde%3D2026-10-01',
    );
  });

  it('con sesión vigente deja pasar', () => {
    sessionStorage.setItem(
      'xa.sesion',
      JSON.stringify({ token: 't', expiraEn: '2099-01-01T00:00:00.000Z', admin: { email: 'a', nombre: 'A', juegosPermitidos: [] } }),
    );
    expect(ejecutar('/juegos')).toBe(true);
  });
});

describe('soloAdminGuard', () => {
  const sesion = (rol?: string) =>
    sessionStorage.setItem('xa.sesion', JSON.stringify({ token: 't', expiraEn: '2099-01-01T00:00:00.000Z', admin: { email: 'a', nombre: 'A', juegosPermitidos: [], ...(rol ? { rol } : {}) } }));
  const ejecutarAdmin = () => TestBed.runInInjectionContext(() => soloAdminGuard({} as ActivatedRouteSnapshot, { url: '/invitados' } as RouterStateSnapshot));

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });

  it('un invitado vuelve a /juegos', () => {
    sesion('invitado');
    expect(TestBed.inject(Router).serializeUrl(ejecutarAdmin() as UrlTree)).toBe('/juegos');
  });

  it.each([['admin'], [undefined]])('rol %s (sin rol = admin) deja pasar', (rol) => {
    sesion(rol);
    expect(ejecutarAdmin()).toBe(true);
  });
});

describe('destinoSeguro', () => {
  it.each([
    ['/juegos/x/muertes', '/juegos/x/muertes'],
    [null, '/juegos'],
    ['https://malicioso.com', '/juegos'],
    ['//malicioso.com', '/juegos'],
    ['/login?destino=/x', '/juegos'],
  ])('%s → %s', (entrada, esperado) => {
    expect(destinoSeguro(entrada)).toBe(esperado);
  });
});
