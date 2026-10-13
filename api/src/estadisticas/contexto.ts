import type { Catalogo } from '../dominio/catalogo';
import { condicionOrigen, type FiltrosEstadisticas } from './filtros';

// Contexto común de las consultas de /estadisticas/* (ESQUEMA_EVENTOS.md §10).

export interface ContextoEstadistica<F extends FiltrosEstadisticas = FiltrosEstadisticas> {
  juegoId: string;
  catalogo: Catalogo;
  filtros: F;
  // Hora del servidor para decidir qué sesiones ya terminaron (R-34).
  ahora: Date;
}

function rango(f: FiltrosEstadisticas): { $gte?: Date; $lt?: Date } | undefined {
  if (f.desde === undefined && f.hasta === undefined) {
    return undefined;
  }
  return {
    ...(f.desde !== undefined && { $gte: new Date(f.desde) }),
    ...(f.hasta !== undefined && { $lt: new Date(f.hasta) }),
  };
}

function comunes(ctx: ContextoEstadistica): Record<string, unknown> {
  const f = ctx.filtros;
  return {
    juegoId: ctx.juegoId,
    ...(f.buildVersion !== undefined && { buildVersion: f.buildVersion }),
    ...(f.plataforma !== undefined && { plataforma: f.plataforma }),
    ...condicionOrigen(f.origen),
  };
}

// `F` de §10: filtro base sobre `eventos` (rango sobre `timestamp`, reloj del cliente).
export function filtroEventos(ctx: ContextoEstadistica): Record<string, unknown> {
  const r = rango(ctx.filtros);
  return { ...comunes(ctx), ...(r && { timestamp: r }) };
}

// Filtro base sobre `sesiones` (rango sobre `inicio`, reloj del cliente; §10.1).
export function filtroSesiones(ctx: ContextoEstadistica): Record<string, unknown> {
  const r = rango(ctx.filtros);
  return { ...comunes(ctx), ...(r && { inicio: r }) };
}

export function nivelesOrdenados(catalogo: Catalogo) {
  return [...catalogo.niveles].sort((a, b) => a.orden - b.orden);
}

export function ultimoNivelId(catalogo: Catalogo): string {
  const ultimo = nivelesOrdenados(catalogo).at(-1);
  if (!ultimo) {
    throw new Error('El catálogo no tiene niveles.');
  }
  return ultimo.nivelId;
}

// Porcentaje con un decimal (0–100); 0 si no hay denominador.
export function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((1000 * parte) / total) / 10;
}

export function entero(valor: number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Math.round(valor);
}

export function dosDecimales(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// $median con method "approximate": en MongoDB 7 es exacta (mediana inferior) hasta ~1000
// valores por grupo y aproximada (t-digest) por encima, con error despreciable.
export const MEDIANA = (campo: string) => ({ $median: { input: campo, method: 'approximate' as const } });
