import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { montarVistaJuego } from '../../../testing/juego';
import { juegoDePrueba } from '../../../testing/juegos';
import { CONFIG } from '../../core/config';
import { ES } from '../../i18n/es';
import { Juego } from './juego';

@Component({ template: '<p class="vista">vista</p>', changeDetection: ChangeDetectionStrategy.OnPush })
class Vista {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />', changeDetection: ChangeDetectionStrategy.OnPush })
class Anfitrion {}

describe('Juego (/juegos/:slug)', () => {
  it('un slug que no existe muestra la vista de error con enlace a la lista', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'juegos/:slug', component: Juego, children: [{ path: '', component: Vista }] }]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Anfitrion);
    await TestBed.inject(Router).navigateByUrl('/juegos/no-existe');
    await fixture.whenStable();
    TestBed.inject(HttpTestingController)
      .expectOne(`${CONFIG.apiUrl}/juegos?limite=100`)
      .flush({ datos: [juegoDePrueba()], pagina: 1, limite: 100, total: 1, origen: 'todos' });
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('xa-estado-vacio')?.textContent).toContain(ES.juego.noEncontradoTitulo);
    expect(el.querySelector('xa-estado-vacio a')?.getAttribute('href')).toBe('/juegos');
    expect(el.querySelector('.vista')).toBeNull();
    TestBed.inject(HttpTestingController).verify();
  });

  it('con un juego válido muestra la barra de filtros con las opciones del detalle', async () => {
    const m = await montarVistaJuego(Vista);
    const builds = [...m.el.querySelectorAll<HTMLOptionElement>('#filtro-build option')].map((o) => o.value);
    expect(builds).toEqual(['', '1.0.0', '1.0.1']);
    const plataformas = [...m.el.querySelectorAll<HTMLOptionElement>('#filtro-plataforma option')].map((o) => o.textContent?.trim());
    expect(plataformas).toEqual([ES.filtros.todas, 'Android', 'Windows']);
    expect(m.el.querySelector('.vista')).not.toBeNull();
  });

  it('los filtros se escriben en la URL y "Limpiar filtros" los quita', async () => {
    const m = await montarVistaJuego(Vista);
    const select = m.el.querySelector<HTMLSelectElement>('#filtro-plataforma')!;
    select.value = 'android';
    select.dispatchEvent(new Event('change'));
    await m.asentar();
    expect(m.router.url).toBe('/juegos/juego-uno?plataforma=android');

    m.el.querySelector<HTMLButtonElement>('button.limpiar')!.click();
    await m.asentar();
    expect(m.router.url).toBe('/juegos/juego-uno');
  });

  it('el atajo "7 días" pone desde = hoy - 6 días (UTC) y queda marcado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
    try {
      const m = await montarVistaJuego(Vista);
      const atajo = [...m.el.querySelectorAll<HTMLButtonElement>('.atajo')].find((b) => b.textContent === ES.filtros.dias7)!;
      atajo.click();
      await m.asentar();
      expect(m.router.url).toBe('/juegos/juego-uno?desde=2026-10-06');
      expect(atajo.getAttribute('aria-pressed')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });
});
