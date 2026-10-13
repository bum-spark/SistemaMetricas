import { CeldaMapaCalor, LimitesNivel } from '../../../core/api/tipos';

export interface CeldaAgregada {
  x: number;
  y: number;
  muertes: number;
  causaDominante: string;
}

// Suma las causas de cada celda (pestaña "Todas") o filtra una causa; guarda la causa dominante.
export function agregarCeldas(celdas: CeldaMapaCalor[], causa: string | null): CeldaAgregada[] {
  const mapa = new Map<string, { x: number; y: number; muertes: number; porCausa: Map<string, number> }>();
  for (const c of celdas) {
    if (causa && c.causa !== causa) {
      continue;
    }
    const clave = `${c.x}|${c.y}`;
    const actual = mapa.get(clave) ?? { x: c.x, y: c.y, muertes: 0, porCausa: new Map<string, number>() };
    actual.muertes += c.muertes;
    actual.porCausa.set(c.causa, (actual.porCausa.get(c.causa) ?? 0) + c.muertes);
    mapa.set(clave, actual);
  }
  return [...mapa.values()].map((c) => ({
    x: c.x,
    y: c.y,
    muertes: c.muertes,
    causaDominante: [...c.porCausa.entries()].sort((a, b) => b[1] - a[1])[0]![0],
  }));
}

// Límites del catálogo; si faltan, la caja que cubre todas las celdas.
export function limitesEfectivos(limites: LimitesNivel | null, celdas: { x: number; y: number }[], celda: number): LimitesNivel | null {
  if (limites && limites.maxX > limites.minX && limites.maxY > limites.minY) {
    return limites;
  }
  if (celdas.length === 0) {
    return null;
  }
  return {
    minX: Math.min(...celdas.map((c) => c.x)),
    maxX: Math.max(...celdas.map((c) => c.x)) + celda,
    minY: Math.min(...celdas.map((c) => c.y)),
    maxY: Math.max(...celdas.map((c) => c.y)) + celda,
  };
}

// Mundo → píxeles del canvas. El eje Y se invierte: en Unity crece hacia arriba (§5).
export function aPixel(x: number, y: number, l: LimitesNivel, ancho: number, alto: number): { px: number; py: number } {
  return {
    px: ((x - l.minX) / (l.maxX - l.minX)) * ancho,
    py: alto - ((y - l.minY) / (l.maxY - l.minY)) * alto,
  };
}

// Píxeles del canvas → mundo (para la lectura de coordenadas).
export function aMundo(px: number, py: number, l: LimitesNivel, ancho: number, alto: number): { x: number; y: number } {
  return {
    x: l.minX + (px / ancho) * (l.maxX - l.minX),
    y: l.minY + ((alto - py) / alto) * (l.maxY - l.minY),
  };
}

// Celda que contiene un punto del mundo (esquina inferior izquierda = múltiplo de `celda`).
export function celdaEn(x: number, y: number, celdas: CeldaAgregada[], celda: number): CeldaAgregada | undefined {
  const cx = Math.floor(x / celda) * celda;
  const cy = Math.floor(y / celda) * celda;
  return celdas.find((c) => Math.abs(c.x - cx) < 1e-9 && Math.abs(c.y - cy) < 1e-9);
}
