import { ES } from '../i18n/es';
import { formatearEntero, formatearPorcentaje } from './formato/formato';
import { TonoBadge } from './ui/badge/badge';

// Umbrales de TODAS las insignias del dashboard, en un solo lugar (DISENO_DASHBOARD.md §4,
// "Insignias de diagnóstico"; S-62). Calibrados con el seed de La Casa del Bosque y Faro
// Nocturno (demo): sin filtros, solo el paso o nivel más difícil queda en "alta"; con el build
// 1.0.0 (más difícil) aparecen las críticas.

// Sin insignia por debajo de esta muestra (jugadores o sesiones).
export const MUESTRA_MINIMA = 20;

export const UMBRALES = {
  // Caída entre pasos del embudo, % respecto al paso anterior.
  caidaEmbudo: { critica: 40, alta: 33 },
  // % de sesiones que jugaron el nivel y no lo completaron (reintentos: seRindieron).
  rendidosNivel: { critica: 40, alta: 33 },
  // Muertes de una celda del mapa de calor como % de la celda con más muertes del nivel.
  zonaCaliente: { critica: 70, elevada: 40 },
  // % de jugadores que obtuvieron el logro.
  rarezaLogro: { comun: 50, pocoComun: 20, raro: 5 },
} as const;

export interface DatosInsignia {
  etiqueta: string;
  tono: TonoBadge;
  // Texto del tooltip: la regla, el valor y la muestra (n).
  regla: string;
}

const T = ES.insignias;

function detalle(regla: string, valor: string, n: number, unidad: string): string {
  return `${regla} ${T.valor(valor)} ${T.muestra(formatearEntero(n), unidad)}`;
}

// Severidad de una caída del embudo (null si es menor a "alta" o la muestra es chica).
export function insigniaCaida(porcentaje: number, n: number): DatosInsignia | null {
  const u = UMBRALES.caidaEmbudo;
  if (n < MUESTRA_MINIMA || porcentaje < u.alta) {
    return null;
  }
  const critica = porcentaje >= u.critica;
  return {
    etiqueta: critica ? T.critica : T.alta,
    tono: critica ? 'danger' : 'warning',
    regla: detalle(T.reglaCaida(u.critica, u.alta), formatearPorcentaje(porcentaje), n, T.jugadores),
  };
}

// "Mayor fuga": solo para la caída más grande del embudo (con muestra suficiente).
export function insigniaMayorFuga(porcentaje: number, n: number): DatosInsignia | null {
  return n < MUESTRA_MINIMA || porcentaje <= 0
    ? null
    : { etiqueta: T.mayorFuga, tono: 'danger', regla: detalle(T.reglaMayorFuga, formatearPorcentaje(porcentaje), n, T.jugadores) };
}

// Diagnóstico de un nivel por el % de sesiones que se rindieron.
export function insigniaNivel(porcentajeRendidos: number, sesiones: number): DatosInsignia | null {
  const u = UMBRALES.rendidosNivel;
  if (sesiones < MUESTRA_MINIMA) {
    return null;
  }
  const regla = detalle(T.reglaNivel(u.critica, u.alta), formatearPorcentaje(porcentajeRendidos), sesiones, T.sesiones);
  if (porcentajeRendidos >= u.critica) {
    return { etiqueta: T.dificultadCritica, tono: 'danger', regla };
  }
  if (porcentajeRendidos >= u.alta) {
    return { etiqueta: T.friccionAlta, tono: 'warning', regla };
  }
  return { etiqueta: T.normal, tono: 'success', regla };
}

// Severidad de una celda del mapa de calor, relativa a la celda con más muertes del nivel
// (no a un % fijo del total, que dependería del tamaño de celda).
export function insigniaZona(muertes: number, maximoDelNivel: number): DatosInsignia {
  const u = UMBRALES.zonaCaliente;
  const relativo = maximoDelNivel > 0 ? (muertes / maximoDelNivel) * 100 : 0;
  const regla = `${T.reglaZona(u.critica, u.elevada)} ${T.valor(formatearPorcentaje(relativo))}`;
  if (relativo >= u.critica) {
    return { etiqueta: T.critica, tono: 'danger', regla };
  }
  if (relativo >= u.elevada) {
    return { etiqueta: T.elevada, tono: 'warning', regla };
  }
  return { etiqueta: T.moderada, tono: 'neutro', regla };
}

// Rareza de un logro calculada con el % de jugadores que lo obtuvieron.
export function rarezaLogro(porcentaje: number, jugadoresTotales: number): DatosInsignia | null {
  const u = UMBRALES.rarezaLogro;
  if (jugadoresTotales < MUESTRA_MINIMA) {
    return null;
  }
  const regla = detalle(T.reglaRareza(u.comun, u.pocoComun, u.raro), formatearPorcentaje(porcentaje), jugadoresTotales, T.jugadores);
  if (porcentaje >= u.comun) {
    return { etiqueta: T.comun, tono: 'neutro', regla };
  }
  if (porcentaje >= u.pocoComun) {
    return { etiqueta: T.pocoComun, tono: 'success', regla };
  }
  if (porcentaje >= u.raro) {
    return { etiqueta: T.raro, tono: 'petal', regla };
  }
  if (porcentaje > 0) {
    return { etiqueta: T.muyRaro, tono: 'warning', regla };
  }
  return { etiqueta: T.sinObtener, tono: 'neutro', regla };
}
