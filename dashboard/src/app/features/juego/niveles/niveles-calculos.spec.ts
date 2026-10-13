import { CATALOGO_PRUEBA } from '../../../../testing/juego';
import { EMBUDO_NIVELES, REINTENTOS, TIEMPOS } from '../../../../testing/niveles';
import { filasNiveles, kpisNiveles, porcentajesGrupos } from './niveles-calculos';

describe('cálculos de Niveles', () => {
  const filas = filasNiveles(CATALOGO_PRUEBA, TIEMPOS, REINTENTOS, EMBUDO_NIVELES);

  it('una fila por nivel del catálogo, en su orden, con jugadores, mediana, intentos, % rendidos e insignia', () => {
    expect(filas.map((f) => f.nombre)).toEqual(['Nivel A', 'Nivel B']);
    expect(filas[0]).toMatchObject({ jugadores: 90, medianaCompletarMs: 290_000, intentosPasar: 1.25, sesiones: 100, porcentajeRendidos: 20, pasadasLimpias: 64 });
    expect(filas[0]!.insignia?.etiqueta).toBe('Normal');
    expect(filas[1]!.porcentajeRendidos).toBe(50);
    expect(filas[1]!.insignia?.etiqueta).toBe('Dificultad crítica');
  });

  it('un nivel sin datos queda con nulos y sin insignia', () => {
    const [f] = filasNiveles(CATALOGO_PRUEBA, [], [], []);
    expect(f).toMatchObject({ jugadores: 0, medianaCompletarMs: null, intentosPasar: null, sesiones: 0, porcentajeRendidos: null, insignia: null });
  });

  it('KPIs: nivel más largo, intentos ponderados, pasadas limpias y nivel más rendido', () => {
    const k = kpisNiveles(filas, REINTENTOS);
    expect(k.masLargo).toEqual({ nombre: 'Nivel B', medianaMs: 500_000 });
    // (1.25 × 80 + 2 × 40) / 120 = 1.5
    expect(k.intentosPasar).toBeCloseTo(1.5, 5);
    expect(k.pasadasLimpias).toBe(80);
    expect(k.sesiones).toBe(180);
    expect(k.masRendido).toEqual({ nombre: 'Nivel B', porcentaje: 50 });
  });

  it('porcentajes de los grupos de intentos entre quienes pasaron', () => {
    expect(porcentajesGrupos(REINTENTOS[1])).toEqual([40, 45, 10, 5]);
    expect(porcentajesGrupos(undefined)).toEqual([]);
  });
});
