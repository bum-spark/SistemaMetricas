import { PasoEmbudo, ReintentosNivel, TiempoNivel } from '../app/core/api/tipos';

// Respuestas de prueba de tiempo-nivel, reintentos y embudo para el catálogo de prueba
// (nivel_a, nivel_b).
const vacio = { intentos: 0, promedioMs: null, medianaMs: null };
const dist = (a: number, b: number, c: number, d: number) => [
  { minimo: 1, maximo: 1, sesiones: a },
  { minimo: 2, maximo: 3, sesiones: b },
  { minimo: 4, maximo: 6, sesiones: c },
  { minimo: 7, maximo: null, sesiones: d },
];

export const TIEMPOS: TiempoNivel[] = [
  { nivelId: 'nivel_a', completado: { intentos: 80, promedioMs: 300_000, medianaMs: 290_000 }, muerte: { intentos: 40, promedioMs: 60_000, medianaMs: 55_000 }, abandono: vacio },
  { nivelId: 'nivel_b', completado: { intentos: 50, promedioMs: 520_000, medianaMs: 500_000 }, muerte: { intentos: 70, promedioMs: 90_000, medianaMs: 80_000 }, abandono: { intentos: 10, promedioMs: 200_000, medianaMs: 190_000 } },
];

export const REINTENTOS: ReintentosNivel[] = [
  {
    nivelId: 'nivel_a',
    pasaron: { sesiones: 80, promedioIntentos: 1.25, maxIntentos: 4, distribucion: dist(64, 14, 2, 0) },
    seRindieron: { sesiones: 20, promedioIntentos: 1.5, maxIntentos: 3, distribucion: dist(12, 8, 0, 0) },
  },
  {
    nivelId: 'nivel_b',
    pasaron: { sesiones: 40, promedioIntentos: 2, maxIntentos: 8, distribucion: dist(16, 18, 4, 2) },
    seRindieron: { sesiones: 40, promedioIntentos: 2.5, maxIntentos: 9, distribucion: dist(10, 20, 8, 2) },
  },
];

export const EMBUDO_NIVELES: PasoEmbudo[] = [
  { paso: 'nivel_a', jugadores: 90, porcentaje: 100 },
  { paso: 'nivel_b', jugadores: 70, porcentaje: 77.8 },
  { paso: 'terminaron', jugadores: 38, porcentaje: 42.2 },
];
