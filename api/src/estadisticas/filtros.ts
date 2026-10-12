import { z } from 'zod';
import { ORIGENES, PLATAFORMAS } from '../dominio/constantes';

// Filtros comunes de /estadisticas/* (ESQUEMA_EVENTOS.md §7.2). Todos opcionales.

export const ORIGENES_FILTRO = [...ORIGENES, 'todos'] as const;
export type OrigenFiltro = (typeof ORIGENES_FILTRO)[number];

// "real" = solo ingesta real, "seed" = solo datos de prueba, "todos" (por defecto) = ambos (R-48).
export const esquemaOrigenFiltro = z.enum(ORIGENES_FILTRO).default('todos');

export const esquemaFiltrosEstadisticas = z
  .object({
    desde: z.iso.datetime({ message: 'debe ser ISO 8601 en UTC, terminado en Z' }).optional(),
    hasta: z.iso.datetime({ message: 'debe ser ISO 8601 en UTC, terminado en Z' }).optional(),
    buildVersion: z.string().min(1).max(32).optional(),
    plataforma: z.enum(PLATAFORMAS).optional(),
    origen: esquemaOrigenFiltro,
  })
  .refine((f) => f.desde === undefined || f.hasta === undefined || f.desde < f.hasta, {
    message: 'desde debe ser anterior a hasta',
    path: ['desde'],
  });

export type FiltrosEstadisticas = z.infer<typeof esquemaFiltrosEstadisticas>;

// Condición de Mongo para el origen: "todos" no filtra.
export function condicionOrigen(origen: OrigenFiltro): { origen?: 'real' | 'seed' } {
  return origen === 'todos' ? {} : { origen };
}
