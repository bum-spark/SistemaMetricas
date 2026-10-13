import { TestBed } from '@angular/core/testing';
import { ES } from '../../../i18n/es';
import { MapaCalor } from './mapa-calor';

async function montar(entradas: Record<string, unknown>) {
  const fixture = TestBed.createComponent(MapaCalor);
  for (const [k, v] of Object.entries({ celda: 5, alternativa: 'Alternativa', ...entradas })) {
    fixture.componentRef.setInput(k, v);
  }
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('MapaCalor', () => {
  it('canvas con alternativa textual, escala con el máximo y aviso si falta la imagen', async () => {
    const { el } = await montar({ celdas: [{ x: 0, y: 0, muertes: 7, causaDominante: 'agua' }], imagenUrl: null });
    const canvas = el.querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Alternativa');
    expect(el.querySelector('.escala')?.textContent).toContain(ES.muertes.escalaMax('7'));
    expect(el.querySelector('.aviso')?.textContent).toBe(ES.muertes.sinImagen);
    expect(el.querySelector('.lectura')?.textContent).toBe(ES.muertes.lecturaVacia);
  });

  it('con imagen no muestra el aviso', async () => {
    const { el } = await montar({ celdas: [], imagenUrl: '/niveles/juego/nivel.svg' });
    expect(el.querySelector('.aviso')).toBeNull();
  });
});
