import { CATALOGO_PRUEBA } from '../../../../testing/juego';
import { MUERTES } from '../../../../testing/muertes';
import { filasMuertes, kpisMuertes } from './muertes-calculos';


describe('cálculos de Muertes', () => {
  const filas = filasMuertes(CATALOGO_PRUEBA, MUERTES);

  it('nombres y posiciones del catálogo y % de las muertes del nivel', () => {
    expect(filas.map((f) => [f.nombreNivel, f.nombreCausa, f.posicionCausa, f.porcentajeNivel])).toEqual([
      ['Nivel A', 'Pinchos', 0, 75],
      ['Nivel A', 'Agua', 1, 25],
      ['Nivel B', 'Agua', 1, 100],
    ]);
  });

  it('KPIs: total, causa más letal, nivel más mortal y combinación con más muertes por jugador', () => {
    expect(kpisMuertes(filas)).toEqual({
      total: 100,
      niveles: 2,
      causa: { nombre: 'Agua', muertes: 70 },
      nivel: { nombre: 'Nivel B', muertes: 60 },
      repetida: { causa: 'Agua', nivel: 'Nivel B', muertesPorJugador: 2.4 },
    });
    expect(kpisMuertes([])).toMatchObject({ total: 0, causa: null, nivel: null, repetida: null });
  });
});
