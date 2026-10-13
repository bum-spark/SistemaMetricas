import { colorCategorico, opcionesBase, PALETA_CATEGORICA } from './chart-theme';

describe('chart-theme', () => {
  it('asigna colores por posición y repite la paleta después del 6.º', () => {
    expect(colorCategorico(0)).toBe(PALETA_CATEGORICA[0]);
    expect(colorCategorico(5)).toBe(PALETA_CATEGORICA[5]);
    expect(colorCategorico(6)).toBe(PALETA_CATEGORICA[0]);
  });

  it('opciones base: sin cuadrícula en el eje de categorías y barras horizontales si se pide', () => {
    const vertical = opcionesBase();
    expect(vertical.indexAxis).toBe('x');
    expect((vertical.scales?.['x'] as { grid: { display: boolean } }).grid.display).toBe(false);
    const horizontal = opcionesBase(true);
    expect(horizontal.indexAxis).toBe('y');
    expect((horizontal.scales?.['y'] as { grid: { display: boolean } }).grid.display).toBe(false);
    expect(horizontal.plugins?.legend?.position).toBe('bottom');
  });
});
