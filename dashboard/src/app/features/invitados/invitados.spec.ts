import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { juegoDePrueba } from '../../../testing/juegos';
import { InvitacionEmitida, Invitado } from '../../core/api/tipos';
import { CONFIG } from '../../core/config';
import { ES } from '../../i18n/es';
import { Invitados } from './invitados';

const UNO = juegoDePrueba({ juegoId: 'j1', nombre: 'Juego Uno', slug: 'juego-uno' });
const DOS = juegoDePrueba({ juegoId: 'j2', nombre: 'Juego Dos', slug: 'juego-dos' });
const URL_INVITADOS = `${CONFIG.apiUrl}/invitados`;
const ENLACE = 'https://panel.ejemplo.mx/invitacion#token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function invitado(extra: Partial<Invitado> = {}): Invitado {
  return {
    email: 'ana@ejemplo.mx',
    nombre: 'Ana',
    estado: 'activo',
    juegos: ['j1'],
    invitadoPor: 'admin@xolos.mx',
    invitadoEn: '2026-10-10T12:00:00.000Z',
    ultimoAcceso: '2026-10-12T15:30:00.000Z',
    enlaceExpiraEn: null,
    ...extra,
  };
}

function emitida(extra: Partial<Invitado> = {}): InvitacionEmitida {
  return { invitado: invitado({ estado: 'pendiente', ultimoAcceso: null, ...extra }), enlace: ENLACE, expiraEn: '2026-10-17T12:00:00.000Z' };
}

async function montar(lista: Invitado[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(Invitados);
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const asentar = async () => {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  http.expectOne(`${CONFIG.apiUrl}/juegos?limite=100`).flush({ datos: [UNO, DOS], pagina: 1, limite: 100, total: 2, origen: 'todos' });
  http.expectOne(`${URL_INVITADOS}?limite=100`).flush({ datos: lista, pagina: 1, limite: 100, total: lista.length });
  await asentar();
  return { fixture, http, el, asentar };
}

const filas = (el: HTMLElement) => [...el.querySelectorAll('tbody tr')];
const botonCon = (raiz: Element, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
const escribir = (input: HTMLInputElement, valor: string) => {
  input.value = valor;
  input.dispatchEvent(new Event('input'));
};

describe('Invitados', () => {
  it('lista correo, estado, juegos (y los que no administra) y último acceso', async () => {
    const { el } = await montar([
      invitado(),
      invitado({ email: 'beto@ejemplo.mx', nombre: '', estado: 'pendiente', juegos: ['j1', 'j2', 'ajeno'], ultimoAcceso: null, enlaceExpiraEn: '2026-10-17T12:00:00.000Z' }),
      invitado({ email: 'caro@ejemplo.mx', estado: 'desactivado' }),
    ]);
    const [ana, beto, caro] = filas(el);
    expect(ana!.textContent).toContain('ana@ejemplo.mx');
    expect(ana!.querySelector('xa-badge')?.textContent?.trim()).toBe(ES.invitados.estado.activo);
    expect(ana!.textContent).toContain('Juego Uno');
    expect(ana!.textContent).toContain('12/10/2026');
    expect(beto!.querySelector('xa-badge')?.textContent?.trim()).toBe(ES.invitados.estado.pendiente);
    expect(beto!.textContent).toContain('Juego Uno, Juego Dos');
    expect(beto!.textContent).toContain(ES.invitados.juegosAjenos(1));
    expect(beto!.textContent).toContain(ES.invitados.nunca);
    expect(beto!.textContent).toContain('Enlace vigente hasta');
    // Desactivado: sin "Restablecer" y con "Activar".
    expect(botonCon(caro!, ES.invitados.restablecer)).toBeUndefined();
    expect(botonCon(caro!, ES.invitados.activar)).toBeDefined();
  });

  it('sin invitados muestra el estado vacío', async () => {
    const { el } = await montar([]);
    expect(el.querySelector('xa-estado-vacio')?.textContent).toContain(ES.invitados.vacioTitulo);
  });

  it('invitar: valida, manda correo, nombre y juegos, y muestra el enlace una sola vez con su vigencia', async () => {
    const { el, http, asentar } = await montar([]);
    botonCon(el, ES.invitados.invitar).click();
    await asentar();
    const modal = el.querySelector('dialog[open]')!;
    expect(modal.textContent).toContain(ES.invitados.modalInvitar);

    // Sin correo ni juegos: errores visibles y no se manda nada.
    botonCon(modal, ES.invitados.crearInvitacion).click();
    await asentar();
    expect(modal.textContent).toContain(ES.invitados.correoObligatorio);
    expect(modal.textContent).toContain(ES.invitados.juegosObligatorios);
    http.expectNone(URL_INVITADOS);

    escribir(modal.querySelector<HTMLInputElement>('#invitar-email')!, ' ana@ejemplo.mx ');
    escribir(modal.querySelector<HTMLInputElement>('#invitar-nombre')!, 'Ana');
    const casillas = modal.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect([...modal.querySelectorAll('.juego > span:last-child')].map((l) => l.textContent?.trim())).toEqual(['Juego Uno', 'Juego Dos']);
    casillas[1]!.click();
    await asentar();
    botonCon(modal, ES.invitados.crearInvitacion).click();
    await asentar();

    const req = http.expectOne(URL_INVITADOS);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@ejemplo.mx', nombre: 'Ana', juegos: ['j2'] });
    req.flush(emitida());
    await asentar();
    http.expectOne(`${URL_INVITADOS}?limite=100`).flush({ datos: [emitida().invitado], pagina: 1, limite: 100, total: 1 });
    await asentar();

    const enlace = el.querySelector('dialog[open]')!;
    expect(enlace.textContent).toContain(ES.invitados.enlaceTitulo);
    expect(enlace.querySelector<HTMLInputElement>('#invitacion-enlace')?.value).toBe(ENLACE);
    expect(enlace.textContent).toContain(ES.invitados.enlaceUnaVez);
    expect(enlace.textContent).toMatch(/Vence el \d{2}\/10\/2026 \d{2}:\d{2}/);

    // Al cerrar, el enlace desaparece de la página (no se puede volver a ver).
    botonCon(enlace, ES.invitados.listo).click();
    await asentar();
    expect(el.querySelector('dialog[open]')).toBeNull();
    expect(el.innerHTML).not.toContain('token=');
  });

  it('copiar usa el portapapeles y lo confirma; si falla, pide copiarlo a mano', async () => {
    const escribirTexto = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('sin permiso'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: escribirTexto } });
    const { el, http, asentar } = await montar([invitado()]);
    botonCon(filas(el)[0]!, ES.invitados.restablecer).click();
    await asentar();
    http.expectOne(`${URL_INVITADOS}/ana%40ejemplo.mx/restablecer`).flush(emitida({ estado: 'activo' }));
    await asentar();

    const modal = el.querySelector('dialog[open]')!;
    botonCon(modal, ES.invitados.copiar).click();
    await asentar();
    expect(escribirTexto).toHaveBeenCalledWith(ENLACE);
    expect(botonCon(modal, ES.invitados.copiado)).toBeDefined();
    botonCon(modal, ES.invitados.copiado).click();
    await asentar();
    expect(modal.textContent).toContain(ES.invitados.copiaManual);
  });

  it('un correo repetido (409) se explica en el modal', async () => {
    const { el, http, asentar } = await montar([]);
    botonCon(el, ES.invitados.invitar).click();
    await asentar();
    const modal = el.querySelector('dialog[open]')!;
    escribir(modal.querySelector<HTMLInputElement>('#invitar-email')!, 'ana@ejemplo.mx');
    modal.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    await asentar();
    botonCon(modal, ES.invitados.crearInvitacion).click();
    await asentar();
    http.expectOne(URL_INVITADOS).flush({ error: { codigo: 'CORREO_YA_REGISTRADO', mensaje: '', detalles: [] } }, { status: 409, statusText: 'Conflict' });
    await asentar();
    expect(modal.textContent).toContain(ES.invitados.correoRepetido);
  });

  it('desactivar y cambiar juegos actualizan la fila', async () => {
    const { el, http, asentar } = await montar([invitado({ juegos: ['j1', 'ajeno'] })]);
    botonCon(filas(el)[0]!, ES.invitados.desactivar).click();
    await asentar();
    const patch = http.expectOne(`${URL_INVITADOS}/ana%40ejemplo.mx`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ activo: false });
    patch.flush(invitado({ estado: 'desactivado', juegos: ['j1', 'ajeno'] }));
    await asentar();
    expect(filas(el)[0]!.querySelector('xa-badge')?.textContent?.trim()).toBe(ES.invitados.estado.desactivado);

    botonCon(filas(el)[0]!, ES.invitados.cambiarJuegos).click();
    await asentar();
    const modal = el.querySelector('dialog[open]')!;
    const casillas = modal.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    // Solo los juegos de este admin; marcado el que ya tenía.
    expect([...casillas].map((c) => c.checked)).toEqual([true, false]);
    casillas[1]!.click();
    await asentar();
    botonCon(modal, ES.invitados.guardar).click();
    await asentar();
    const cambio = http.expectOne(`${URL_INVITADOS}/ana%40ejemplo.mx`);
    expect(cambio.request.body).toEqual({ juegos: ['j1', 'j2'] });
    cambio.flush(invitado({ estado: 'desactivado', juegos: ['j1', 'j2', 'ajeno'] }));
    await asentar();
    expect(el.querySelector('dialog[open]')).toBeNull();
    expect(filas(el)[0]!.textContent).toContain('Juego Uno, Juego Dos');
  });

  it('si la lista falla, ofrece reintentar', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Invitados);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${CONFIG.apiUrl}/juegos?limite=100`).flush({ datos: [UNO], pagina: 1, limite: 100, total: 1, origen: 'todos' });
    http.expectOne(`${URL_INVITADOS}?limite=100`).flush(null, { status: 500, statusText: 'Error' });
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('xa-estado-error')?.textContent).toContain(ES.invitados.errorTitulo);
  });
});
