import {
  formatearDuracion,
  formatearEntero,
  formatearFecha,
  formatearFraccion,
  formatearPorcentaje,
  inicial,
  SIN_DATO,
} from './formato';

describe('formato es-MX', () => {
  it('enteros con coma de miles', () => {
    expect(formatearEntero(1234567)).toBe('1,234,567');
    expect(formatearEntero(0)).toBe('0');
    expect(formatearEntero(null)).toBe(SIN_DATO);
  });

  it('porcentajes: un decimal solo si es menor a 10 %', () => {
    expect(formatearPorcentaje(31)).toBe('31 %');
    expect(formatearPorcentaje(9.44)).toBe('9.4 %');
    expect(formatearPorcentaje(0)).toBe('0 %');
    expect(formatearPorcentaje(100)).toBe('100 %');
    expect(formatearPorcentaje(null)).toBe(SIN_DATO);
    expect(formatearFraccion(0.2533)).toBe('25 %');
    expect(formatearFraccion(0.05)).toBe('5.0 %');
  });

  it('duraciones mm:ss y h:mm:ss', () => {
    expect(formatearDuracion(1122000)).toBe('18:42');
    expect(formatearDuracion(59_400)).toBe('00:59');
    expect(formatearDuracion(3_725_000)).toBe('1:02:05');
    expect(formatearDuracion(null)).toBe(SIN_DATO);
  });

  it('fechas dd/MM/yyyy', () => {
    expect(formatearFecha(new Date(2026, 9, 5))).toBe('05/10/2026');
  });

  it('inicial del nombre del juego para el avatar', () => {
    expect(inicial('Faro Nocturno (demo)')).toBe('F');
    expect(inicial('  ¡ébano!')).toBe('É');
    expect(inicial('')).toBe('?');
  });
});
