import { CATALOGO_LOGROS, LOGROS } from '../../../../testing/logros';
import { filasLogros, jugadoresTotales, kpisLogros } from './logros-calculos';

describe('cálculos de Logros', () => {
  it('estima los jugadores del filtro con el logro más obtenido', () => {
    expect(jugadoresTotales(LOGROS)).toBe(300);
    expect(jugadoresTotales([{ logroId: 'x', nombre: 'X', jugadores: 0, porcentaje: 0 }])).toBe(0);
  });

  it('agrega la descripción del catálogo y la rareza calculada con el %', () => {
    const filas = filasLogros(CATALOGO_LOGROS, LOGROS);
    expect(filas.map((f) => [f.nombre, f.descripcion, f.rareza?.etiqueta])).toEqual([
      ['Logro A', 'Completa el nivel A.', 'Común'],
      ['Logro B', 'Encuentra el objeto escondido.', 'Muy raro'],
      ['Logro C', '', 'Sin obtener'],
    ]);
    expect(filas[0]!.rareza?.regla).toContain('n = 300 jugadores');
  });

  it('KPIs: total obtenidos, más común, más raro obtenido y cuántos nadie tiene', () => {
    const k = kpisLogros(filasLogros(CATALOGO_LOGROS, LOGROS));
    expect(k.obtenidos).toBe(246);
    expect(k.catalogo).toBe(3);
    expect(k.comun?.nombre).toBe('Logro A');
    expect(k.raro?.nombre).toBe('Logro B');
    expect(k.sinObtener).toBe(1);
  });
});
