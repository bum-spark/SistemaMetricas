import { TestBed } from '@angular/core/testing';
import { LogoJuego } from './logo-juego';

async function montar(entradas: Record<string, unknown>) {
  const fixture = TestBed.createComponent(LogoJuego);
  for (const [k, v] of Object.entries(entradas)) {
    fixture.componentRef.setInput(k, v);
  }
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('LogoJuego', () => {
  it('muestra el logo de logoUrl con alt, tamaño explícito y srcset @2x para rutas del dashboard', async () => {
    const { el } = await montar({ nombre: 'La Casa', logoUrl: '/logos/la-casa/logo.png' });
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/logos/la-casa/logo.png');
    expect(img.getAttribute('srcset')).toBe('/logos/la-casa/logo.png 1x, /logos/la-casa/logo@2x.png 2x');
    expect(img.getAttribute('alt')).toBe('Logo de La Casa');
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('height')).toBe('40');
  });

  it('una URL https externa va sin srcset; en el selector la imagen es de 20 px', async () => {
    const { el } = await montar({ nombre: 'Otro', logoUrl: 'https://cdn.ejemplo.com/otro.png', tamano: 'selector' });
    const img = el.querySelector('img')!;
    expect(img.hasAttribute('srcset')).toBe(false);
    expect(img.getAttribute('width')).toBe('20');
  });

  it('sin logoUrl muestra la inicial del nombre', async () => {
    const { el } = await montar({ nombre: 'Faro Nocturno', logoUrl: null });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent?.trim()).toBe('F');
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Logo de Faro Nocturno');
  });

  it('si la imagen falla al cargar, cae a la inicial', async () => {
    const { el, fixture } = await montar({ nombre: 'Roto', logoUrl: '/logos/roto/logo.png' });
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent?.trim()).toBe('R');
  });

  it('decorativo: alt vacío (el nombre ya está escrito junto al logo)', async () => {
    const { el } = await montar({ nombre: 'La Casa', logoUrl: '/logos/la-casa/logo.png', decorativo: true });
    expect(el.querySelector('img')!.getAttribute('alt')).toBe('');
  });
});
