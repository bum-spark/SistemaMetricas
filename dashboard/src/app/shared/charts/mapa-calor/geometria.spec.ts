import { colorCalor } from '../chart-theme';
import { agregarCeldas, aMundo, aPixel, celdaEn, limitesEfectivos } from './geometria';

const CELDAS = [
  { x: 10, y: 0, causa: 'pinchos', muertes: 3 },
  { x: 10, y: 0, causa: 'agua', muertes: 5 },
  { x: 20, y: 5, causa: 'pinchos', muertes: 2 },
];
const L = { minX: 0, maxX: 100, minY: 0, maxY: 20 };

describe('geometría del mapa de calor', () => {
  it('"Todas" suma las causas de cada celda y guarda la dominante; una causa filtra', () => {
    expect(agregarCeldas(CELDAS, null)).toEqual([
      { x: 10, y: 0, muertes: 8, causaDominante: 'agua' },
      { x: 20, y: 5, muertes: 2, causaDominante: 'pinchos' },
    ]);
    expect(agregarCeldas(CELDAS, 'pinchos').map((c) => c.muertes)).toEqual([3, 2]);
  });

  it('mundo ↔ píxeles con el eje Y invertido (en Unity crece hacia arriba)', () => {
    expect(aPixel(0, 0, L, 1000, 200)).toEqual({ px: 0, py: 200 });
    expect(aPixel(100, 20, L, 1000, 200)).toEqual({ px: 1000, py: 0 });
    expect(aMundo(500, 50, L, 1000, 200)).toEqual({ x: 50, y: 15 });
  });

  it('límites del catálogo o, si faltan, la caja de las celdas', () => {
    expect(limitesEfectivos(L, [], 1)).toBe(L);
    expect(limitesEfectivos(null, [{ x: -5, y: 2 }, { x: 10, y: 8 }], 5)).toEqual({ minX: -5, maxX: 15, minY: 2, maxY: 13 });
    expect(limitesEfectivos(null, [], 1)).toBeNull();
  });

  it('encuentra la celda que contiene un punto (también con coordenadas negativas)', () => {
    const celdas = agregarCeldas([...CELDAS, { x: -5, y: -5, causa: 'agua', muertes: 1 }], null);
    expect(celdaEn(12.3, 4.9, celdas, 5)?.muertes).toBe(8);
    expect(celdaEn(-0.1, -0.1, celdas, 5)?.muertes).toBe(1);
    expect(celdaEn(50, 10, celdas, 5)).toBeUndefined();
  });

  it('interpola la escala de calor de frío a caliente', () => {
    const escala: [number, number, number][] = [
      [0, 0, 0],
      [100, 100, 100],
      [200, 200, 200],
      [255, 255, 255],
    ];
    expect(colorCalor(0, escala)).toEqual([0, 0, 0]);
    expect(colorCalor(0.5, escala)).toEqual([150, 150, 150]);
    expect(colorCalor(1, escala)).toEqual([255, 255, 255]);
    expect(colorCalor(2, escala)).toEqual([255, 255, 255]);
  });
});
