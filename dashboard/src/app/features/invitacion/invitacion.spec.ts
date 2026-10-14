import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONFIG } from '../../core/config';
import { ES } from '../../i18n/es';
import { Invitacion, tokenDelFragmento } from './invitacion';

const TOKEN = 'abcDEF_-0123456789abcdefghijABCDEFGHIJ0123456';
const VALIDAR = `${CONFIG.apiUrl}/auth/invitacion/validar`;
const ACEPTAR = `${CONFIG.apiUrl}/auth/invitacion/aceptar`;

async function montar(hash: string) {
  history.replaceState(null, '', `/invitacion${hash}`);
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(Invitacion);
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const asentar = async () => {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, http, el, asentar };
}

const escribir = (input: HTMLInputElement, valor: string) => {
  input.value = valor;
  input.dispatchEvent(new Event('input'));
};

describe('tokenDelFragmento', () => {
  it.each([
    ['#token=abc', 'abc'],
    ['#token=', null],
    ['', null],
    ['#otra=1', null],
  ])('%s → %s', (hash, token) => {
    expect(tokenDelFragmento(hash)).toBe(token);
  });
});

describe('Invitacion', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('lee el token del fragmento, lo borra de la URL y lo valida por header', async () => {
    const { http, el, asentar } = await montar(`#token=${TOKEN}`);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);

    const req = http.expectOne(VALIDAR);
    expect(req.request.headers.get('X-Invitacion-Token')).toBe(TOKEN);
    expect(req.request.urlWithParams).not.toContain(TOKEN);
    req.flush({ email: 'ana@ejemplo.mx', nombre: 'Ana', expiraEn: '2026-10-17T12:00:00.000Z' });
    await asentar();
    expect(el.textContent).toContain(ES.invitacion.para('ana@ejemplo.mx'));
    expect(el.textContent).toMatch(/vence el \d{2}\/10\/2026/);
  });

  it('muestra las reglas, exige que se cumplan y crea la contraseña', async () => {
    const { http, el, asentar } = await montar(`#token=${TOKEN}`);
    http.expectOne(VALIDAR).flush({ email: 'ana@ejemplo.mx', nombre: '', expiraEn: '2026-10-17T12:00:00.000Z' });
    await asentar();
    const [longitud, coinciden] = [...el.querySelectorAll('.regla')];
    expect(longitud!.textContent).toContain(ES.invitacion.reglaLongitud(12));
    expect(longitud!.textContent).toContain(ES.invitacion.noCumple);

    const pass = el.querySelector<HTMLInputElement>('#invitacion-password')!;
    const conf = el.querySelector<HTMLInputElement>('#invitacion-confirmacion')!;
    escribir(pass, 'corta');
    escribir(conf, 'otra');
    await asentar();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await asentar();
    http.expectNone(ACEPTAR);
    expect(longitud!.classList).toContain('regla--falta');
    expect(coinciden!.classList).toContain('regla--falta');

    escribir(pass, 'contraseña-larga-nueva');
    escribir(conf, 'contraseña-larga-nueva');
    await asentar();
    expect(longitud!.classList).toContain('regla--ok');
    expect(coinciden!.textContent).toContain(ES.invitacion.cumple);
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await asentar();
    const req = http.expectOne(ACEPTAR);
    expect(req.request.body).toEqual({ token: TOKEN, password: 'contraseña-larga-nueva' });
    req.flush({ email: 'ana@ejemplo.mx' });
    await asentar();
    expect(el.textContent).toContain(ES.invitacion.listoTitulo);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/login');
  });

  it('un enlace inválido, vencido o usado muestra el mismo aviso', async () => {
    const { http, el, asentar } = await montar(`#token=${TOKEN}`);
    http.expectOne(VALIDAR).flush({ error: { codigo: 'INVITACION_INVALIDA', mensaje: '', detalles: [] } }, { status: 400, statusText: 'Bad Request' });
    await asentar();
    expect(el.textContent).toContain(ES.invitacion.invalidoTitulo);
    expect(el.querySelector('form')).toBeNull();
  });

  it('si el enlace deja de servir al aceptar, también lo dice', async () => {
    const { http, el, asentar } = await montar(`#token=${TOKEN}`);
    http.expectOne(VALIDAR).flush({ email: 'ana@ejemplo.mx', nombre: '', expiraEn: '2026-10-17T12:00:00.000Z' });
    await asentar();
    escribir(el.querySelector<HTMLInputElement>('#invitacion-password')!, 'contraseña-larga-nueva');
    escribir(el.querySelector<HTMLInputElement>('#invitacion-confirmacion')!, 'contraseña-larga-nueva');
    await asentar();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await asentar();
    http.expectOne(ACEPTAR).flush({ error: { codigo: 'INVITACION_INVALIDA', mensaje: '', detalles: [] } }, { status: 400, statusText: 'Bad Request' });
    await asentar();
    expect(el.textContent).toContain(ES.invitacion.invalidoTitulo);
  });

  it('sin token en la URL no llama a la API', async () => {
    const { http, el, asentar } = await montar('');
    await asentar();
    http.expectNone(VALIDAR);
    expect(el.textContent).toContain(ES.invitacion.sinToken);
  });
});
