import { TestBed } from '@angular/core/testing';
import { FONDOS_LOGIN, FondoLogin, FUNDIDO_MS, INTERVALO_MS, rutaFondo } from './fondo-login';

function simularMedios(reducido: boolean, movil = false) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: (q.includes('reduced-motion') && reducido) || (q.includes('max-width') && movil),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

// Image con decode() inmediato y registro de lo que se precargó.
const precargadas: string[] = [];
class ImagenFalsa {
  src = '';
  decode() {
    precargadas.push(this.src);
    return Promise.resolve();
  }
}

async function montar() {
  const fixture = TestBed.createComponent(FondoLogin);
  fixture.detectChanges();
  await vi.advanceTimersByTimeAsync(0);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const activa = (el: HTMLElement) => el.querySelector('picture.fondo--activo img')?.getAttribute('src');

describe('FondoLogin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    precargadas.length = 0;
    vi.stubGlobal('Image', ImagenFalsa);
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('al abrir solo pide la primera imagen; es decorativa (alt vacío y aria-hidden)', async () => {
    simularMedios(false);
    const fixture = TestBed.createComponent(FondoLogin);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    const imgs = el.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toBe(rutaFondo(FONDOS_LOGIN[0], false));
    expect(imgs[0]!.getAttribute('alt')).toBe('');
    expect(el.querySelector('source')?.getAttribute('srcset')).toBe(rutaFondo(FONDOS_LOGIN[0], true));
    expect(el.querySelector('source')?.getAttribute('media')).toBe('(max-width: 767px)');
  });

  it('con el formulario ya interactivo precarga las demás, en orden', async () => {
    simularMedios(false);
    const { fixture, el } = await montar();
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();
    expect(precargadas).toEqual(FONDOS_LOGIN.slice(1).map((f) => rutaFondo(f, false)));
    expect(el.querySelectorAll('picture')).toHaveLength(FONDOS_LOGIN.length);
  });

  it('en pantallas pequeñas precarga las variantes de 960 px', async () => {
    simularMedios(false, true);
    await montar();
    await vi.advanceTimersByTimeAsync(10);
    expect(precargadas[0]).toBe(rutaFondo(FONDOS_LOGIN[1], true));
  });

  it('cambia de imagen cada 7 s y vuelve a la primera al final', async () => {
    simularMedios(false);
    const { fixture, el } = await montar();
    expect(activa(el)).toBe(rutaFondo(FONDOS_LOGIN[0], false));
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    fixture.detectChanges();
    expect(activa(el)).toBe(rutaFondo(FONDOS_LOGIN[1], false));
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * (FONDOS_LOGIN.length - 1));
    fixture.detectChanges();
    expect(activa(el)).toBe(rutaFondo(FONDOS_LOGIN[0], false));
    expect(FUNDIDO_MS).toBe(1200);
  });

  it('se pausa con la pestaña oculta y sigue al volver', async () => {
    simularMedios(false);
    const { fixture, el } = await montar();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3);
    fixture.detectChanges();
    expect(activa(el)).toBe(rutaFondo(FONDOS_LOGIN[0], false));

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    fixture.detectChanges();
    expect(activa(el)).toBe(rutaFondo(FONDOS_LOGIN[1], false));
  });

  it('con movimiento reducido: una sola imagen fija, sin precargas ni cambios', async () => {
    simularMedios(true);
    const { fixture, el } = await montar();
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3);
    fixture.detectChanges();
    expect(precargadas).toEqual([]);
    expect(el.querySelectorAll('img')).toHaveLength(1);
    expect(el.classList.contains('fondo--quieto')).toBe(true);
    expect(activa(el)).toBe(rutaFondo(FONDOS_LOGIN[0], false));
  });
});
