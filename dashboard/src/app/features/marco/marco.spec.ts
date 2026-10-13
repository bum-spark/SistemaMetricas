import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CONFIG } from '../../core/config';
import { juegoDePrueba } from '../../../testing/juegos';
import { ES } from '../../i18n/es';
import { Marco, slugDeUrl } from './marco';

@Component({ template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class Vacia {}

const SESION = { token: 't', expiraEn: '2099-01-01T00:00:00.000Z', admin: { email: 'a@x.mx', nombre: 'Admin Uno', juegosPermitidos: [] } };

async function montar(url: string) {
  sessionStorage.setItem('xa.sesion', JSON.stringify(SESION));
  TestBed.configureTestingModule({
    imports: [Marco],
    providers: [
      provideRouter([
        { path: 'login', component: Vacia },
        { path: 'juegos', component: Vacia },
        { path: 'juegos/:slug', component: Vacia },
        { path: 'juegos/:slug/:seccion', component: Vacia },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(Marco);
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`${CONFIG.apiUrl}/juegos?limite=100`).flush({
    datos: [juegoDePrueba({ nombre: 'Juego Uno', slug: 'juego-uno', logoUrl: '/logos/juego-uno/logo.png' }), juegoDePrueba({ juegoId: 'b', nombre: 'Demo', slug: 'demo' })],
    pagina: 1,
    limite: 100,
    total: 2,
    origen: 'todos',
  });
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, router };
}

describe('slugDeUrl', () => {
  it.each([
    ['/juegos', null],
    ['/juegos?x=1', null],
    ['/juegos/la-casa', 'la-casa'],
    ['/juegos/la-casa/muertes?desde=2026-10-01', 'la-casa'],
    ['/login', null],
  ])('%s → %s', (url, slug) => {
    expect(slugDeUrl(url)).toBe(slug);
  });
});

describe('Marco', () => {
  afterEach(() => sessionStorage.clear());

  it('en /juegos: marca, admin y Salir; sin secciones de juego; selector con "Elige un juego"', async () => {
    const { el } = await montar('/juegos');
    expect(el.querySelector('.sidebar__marca')?.textContent).toContain(CONFIG.appName);
    expect(el.querySelector('.sidebar__admin')?.textContent).toBe('Admin Uno');
    expect(el.querySelector('nav')).toBeNull();
    expect(el.querySelector('xa-selector-juego')?.textContent).toContain(ES.selector.elegir);
  });

  it('dentro de un juego: solo las secciones construidas, con la activa marcada, y el juego en el selector', async () => {
    const { el } = await montar('/juegos/juego-uno');
    const items = [...el.querySelectorAll<HTMLAnchorElement>('nav a')];
    expect(items.map((a) => a.textContent?.trim())).toEqual([ES.marco.secciones.resumen, ES.marco.secciones.progresion, ES.marco.secciones.niveles, ES.marco.secciones.muertes]);
    expect(items.map((a) => a.getAttribute('href'))).toEqual(['/juegos/juego-uno', '/juegos/juego-uno/progresion', '/juegos/juego-uno/niveles', '/juegos/juego-uno/muertes']);
    expect(el.querySelector('nav [aria-current="page"]')?.textContent?.trim()).toBe(ES.marco.secciones.resumen);
    const selector = el.querySelector('xa-selector-juego')!;
    expect(selector.textContent).toContain('Juego Uno');
    expect(selector.querySelector('img')?.getAttribute('src')).toBe('/logos/juego-uno/logo.png');
  });

  it('con un slug que no existe no muestra las secciones', async () => {
    const { el } = await montar('/juegos/no-existe');
    expect(el.querySelector('nav')).toBeNull();
  });

  it('el selector lista los juegos y se cierra con Escape', async () => {
    const { el, fixture } = await montar('/juegos/juego-uno');
    const disparador = el.querySelector<HTMLButtonElement>('xa-selector-juego button')!;
    disparador.click();
    await fixture.whenStable();
    expect(disparador.getAttribute('aria-expanded')).toBe('true');
    const opciones = [...el.querySelectorAll<HTMLAnchorElement>('#selector-juego-lista a')];
    expect(opciones.map((a) => a.getAttribute('href'))).toEqual(['/juegos/juego-uno', '/juegos/demo', '/juegos']);
    expect(opciones[0]!.getAttribute('aria-current')).toBe('page');

    el.querySelector('xa-selector-juego')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('#selector-juego-lista')).toBeNull();
  });

  it('Salir cierra la sesión y manda a login', async () => {
    const { el, fixture, router } = await montar('/juegos');
    el.querySelector<HTMLButtonElement>('.sidebar__usuario button')!.click();
    await fixture.whenStable();
    expect(sessionStorage.getItem('xa.sesion')).toBeNull();
    expect(router.url).toBe('/login');
  });

  it('el botón de menú alterna el cajón (aria-expanded)', async () => {
    const { el, fixture } = await montar('/juegos');
    const boton = el.querySelector<HTMLButtonElement>('.topbar__menu')!;
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    boton.click();
    await fixture.whenStable();
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.marco')?.classList.contains('marco--menu-abierto')).toBe(true);
  });
});
