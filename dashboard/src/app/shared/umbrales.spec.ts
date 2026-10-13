import { insigniaCaida, insigniaMayorFuga, insigniaNivel, insigniaZona, MUESTRA_MINIMA, rarezaLogro } from './umbrales';

const etiqueta = (i: { etiqueta: string } | null) => i?.etiqueta ?? null;

describe('umbrales de insignias', () => {
  it('caídas del embudo con los valores del seed: solo la mayor de La Casa del Bosque sin filtros es "Alta"', () => {
    // La Casa del Bosque, sin filtros: 30.3 %, 36.4 %, 30.1 %.
    expect([insigniaCaida(30.3, 300), insigniaCaida(36.4, 209), insigniaCaida(30.1, 133)].map(etiqueta)).toEqual([null, 'Alta', null]);
    // Build 1.0.0: 36.0 %, 47.9 %, 44.0 %.
    expect([insigniaCaida(36, 150), insigniaCaida(47.9, 96), insigniaCaida(44, 50)].map(etiqueta)).toEqual(['Alta', 'Crítica', 'Crítica']);
  });

  it('sin insignia con muestra menor a 20, y el tooltip muestra regla, valor y n', () => {
    expect(insigniaCaida(50, MUESTRA_MINIMA - 1)).toBeNull();
    const i = insigniaCaida(42.9, 1200)!;
    expect(i.tono).toBe('danger');
    expect(i.regla).toContain('≥ 40 % crítica');
    expect(i.regla).toContain('Valor: 43 %.');
    expect(i.regla).toContain('n = 1,200 jugadores');
  });

  it('"Mayor fuga" solo con muestra suficiente y pérdida real', () => {
    expect(etiqueta(insigniaMayorFuga(36.4, 209))).toBe('Mayor fuga');
    expect(insigniaMayorFuga(36.4, 10)).toBeNull();
    expect(insigniaMayorFuga(0, 300)).toBeNull();
  });

  it('diagnóstico por nivel (% de sesiones que se rindieron)', () => {
    expect([insigniaNivel(28.5, 316), insigniaNivel(36.9, 217), insigniaNivel(31.1, 135)].map(etiqueta)).toEqual(['Normal', 'Fricción alta', 'Normal']);
    expect(etiqueta(insigniaNivel(46.9, 98))).toBe('Dificultad crítica');
    expect(insigniaNivel(60, 14)).toBeNull();
  });

  it('zonas calientes relativas a la celda con más muertes del nivel', () => {
    expect(etiqueta(insigniaZona(100, 100))).toBe('Crítica');
    expect(etiqueta(insigniaZona(70, 100))).toBe('Crítica');
    expect(etiqueta(insigniaZona(50, 100))).toBe('Elevada');
    expect(etiqueta(insigniaZona(39, 100))).toBe('Moderada');
    expect(insigniaZona(5, 10).regla).toContain('celda con más muertes');
  });

  it('rareza de logros por % de jugadores', () => {
    expect([80, 35, 12, 2, 0].map((p) => etiqueta(rarezaLogro(p, 300)))).toEqual(['Común', 'Poco común', 'Raro', 'Muy raro', 'Sin obtener']);
    expect(rarezaLogro(50, 5)).toBeNull();
  });
});
