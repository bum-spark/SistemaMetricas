import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONFIG } from '../../core/config';
import { juegoDePrueba } from '../../../testing/juegos';
import { ES } from '../../i18n/es';
import { Juegos } from './juegos';

const URL = `${CONFIG.apiUrl}/juegos?limite=100`;

async function montar() {
  TestBed.configureTestingModule({
    imports: [Juegos],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(Juegos);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

// La lista se actualiza en la promesa de JuegosService.cargar(): se deja correr antes de revisar el DOM.
async function asentar(fixture: { whenStable: () => Promise<unknown> }) {
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
}

const lista = (datos: unknown[]) => ({ datos, pagina: 1, limite: 100, total: datos.length, origen: 'todos' });

describe('Juegos (/juegos)', () => {
  it('muestra skeleton mientras carga', async () => {
    const { el, http } = await montar();
    expect(el.querySelectorAll('xa-skeleton').length).toBeGreaterThan(0);
    http.expectOne(URL);
  });

  it('una tarjeta por juego con nombre, versión, estado, mini-KPIs en es-MX y enlace a su slug', async () => {
    const { el, fixture, http } = await montar();
    http.expectOne(URL).flush(
      lista([
        juegoDePrueba({ nombre: 'Juego Uno', slug: 'juego-uno', logoUrl: '/juegos/juego-uno/logo.png' }),
        juegoDePrueba({ juegoId: 'b', nombre: 'Demo', slug: 'demo', activo: false, resumen: { jugadores: 0, sesiones: 0, tasaCompletado: 0.05 } }),
      ]),
    );
    await asentar(fixture);

    const tarjetas = el.querySelectorAll<HTMLAnchorElement>('a.tarjeta');
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0]!.getAttribute('href')).toBe('/juegos/juego-uno');
    expect(tarjetas[0]!.textContent).toContain('Juego Uno');
    expect(tarjetas[0]!.textContent).toContain('v1.0.0');
    expect(tarjetas[0]!.textContent).toContain(ES.juegos.activo);
    expect(tarjetas[0]!.textContent).toContain('1,200');
    expect(tarjetas[0]!.textContent).toContain('31 %');
    expect(tarjetas[0]!.querySelector('img')?.getAttribute('src')).toBe('/juegos/juego-uno/logo.png');
    expect(tarjetas[1]!.textContent).toContain(ES.juegos.inactivo);
    expect(tarjetas[1]!.textContent).toContain('5.0 %');
    expect(tarjetas[1]!.querySelector('img')).toBeNull();
    expect(tarjetas[1]!.querySelector('xa-logo-juego')?.textContent?.trim()).toBe('D');
  });

  it('sin juegos muestra el estado vacío', async () => {
    const { el, fixture, http } = await montar();
    http.expectOne(URL).flush(lista([]));
    await asentar(fixture);
    expect(el.querySelector('xa-estado-vacio')?.textContent).toContain(ES.juegos.vacioTitulo);
  });

  it('con error muestra la tarjeta de error y Reintentar vuelve a pedir la lista', async () => {
    const { el, fixture, http } = await montar();
    http.expectOne(URL).flush({}, { status: 500, statusText: 'Error' });
    await asentar(fixture);
    expect(el.querySelector('xa-estado-error')?.textContent).toContain(ES.juegos.errorTitulo);

    el.querySelector<HTMLButtonElement>('xa-estado-error button')!.click();
    http.expectOne(URL).flush(lista([juegoDePrueba()]));
    await asentar(fixture);
    expect(el.querySelectorAll('a.tarjeta')).toHaveLength(1);
  });
});
