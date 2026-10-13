import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { CONFIG } from '../../core/config';
import { ES } from '../../i18n/es';
import { Login } from './login';

const URL_LOGIN = `${CONFIG.apiUrl}/auth/login`;

async function montar(url = '/login') {
  TestBed.configureTestingModule({
    imports: [Login],
    providers: [
      provideRouter([{ path: 'login', component: Login }]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(Login);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const escribir = (selector: string, valor: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  };
  const enviar = async () => {
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, el, router, escribir, enviar, http: TestBed.inject(HttpTestingController) };
}

describe('Login', () => {
  beforeEach(() => sessionStorage.clear());

  it('muestra la marca con APP_NAME, los campos con etiqueta y el botón Entrar', async () => {
    const { el } = await montar();
    expect(el.querySelector('xa-marca')?.textContent).toContain(CONFIG.appName);
    const logo = el.querySelector('img')!;
    expect(logo.getAttribute('width')).toBe('64');
    expect(logo.getAttribute('height')).toBe('64');
    expect(el.querySelector('label[for="login-email"]')?.textContent).toBe(ES.login.email);
    expect(el.querySelector('label[for="login-password"]')?.textContent).toBe(ES.login.password);
    expect(el.querySelector('button[type="submit"]')?.textContent?.trim()).toBe(ES.login.entrar);
  });

  it('valida campos vacíos y correo inválido sin llamar a la API', async () => {
    const { el, fixture, escribir, enviar, http } = await montar();
    await enviar();
    expect(el.textContent).toContain(ES.login.emailObligatorio);
    expect(el.textContent).toContain(ES.login.passwordObligatoria);
    expect(el.querySelector('#login-email')?.getAttribute('aria-invalid')).toBe('true');

    escribir('#login-email', 'no-es-correo');
    await fixture.whenStable();
    expect(el.textContent).toContain(ES.login.emailInvalido);
    http.expectNone(URL_LOGIN);
  });

  it('con credenciales correctas entra y navega al destino interno', async () => {
    const { escribir, enviar, http, router } = await montar('/login?destino=%2Fjuegos%2Fla-casa');
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    escribir('#login-email', ' demo@xolos.mx ');
    escribir('#login-password', 'secreta');
    await enviar();

    const req = http.expectOne(URL_LOGIN);
    expect(req.request.body).toEqual({ email: 'demo@xolos.mx', password: 'secreta' });
    req.flush({ token: 't', expiraEn: '2099-01-01T00:00:00.000Z', admin: { email: 'demo@xolos.mx', nombre: 'D', juegosPermitidos: [] } });
    expect(navegar).toHaveBeenCalledWith('/juegos/la-casa');
  });

  it('mientras envía, el botón queda ocupado y no se puede reenviar', async () => {
    const { el, fixture, escribir, enviar, http } = await montar();
    escribir('#login-email', 'demo@xolos.mx');
    escribir('#login-password', 'secreta');
    await enviar();
    await fixture.whenStable();
    const boton = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.textContent?.trim()).toBe(ES.login.entrando);
    await enviar();
    expect(http.match(URL_LOGIN)).toHaveLength(1);
  });

  it.each([
    [401, ES.login.credencialesIncorrectas],
    [429, ES.login.demasiadosIntentos],
    [500, ES.login.errorInesperado],
    [0, ES.login.sinConexion],
  ])('un error %s muestra un mensaje genérico', async (status, mensaje) => {
    const { el, fixture, escribir, enviar, http } = await montar();
    escribir('#login-email', 'demo@xolos.mx');
    escribir('#login-password', 'mala');
    await enviar();
    http.expectOne(URL_LOGIN).flush({}, { status, statusText: 'x' });
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe(mensaje);
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('avisa si llegó por sesión expirada', async () => {
    const { el } = await montar('/login?motivo=expirada');
    expect(el.querySelector('[role="alert"]')?.textContent).toBe(ES.login.sesionExpirada);
  });
});
