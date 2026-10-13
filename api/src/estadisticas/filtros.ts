import { z } from 'zod';
import { ORIGENES, PATRON_ID_CATALOGO, PLATAFORMAS } from '../dominio/constantes';

// Filtros comunes de /estadisticas/* (ESQUEMA_EVENTOS.md §7.2). Todos opcionales.

export const ORIGENES_FILTRO = [...ORIGENES, 'todos'] as const;
export type OrigenFiltro = (typeof ORIGENES_FILTRO)[number];

// "real" = solo ingesta real, "seed" = solo datos de prueba, "todos" (por defecto) = ambos (R-48).
export const esquemaOrigenFiltro = z.enum(ORIGENES_FILTRO).default('todos');

const camposComunes = {
  desde: z.iso.datetime({ message: 'debe ser ISO 8601 en UTC, terminado en Z' }).optional(),
  hasta: z.iso.datetime({ message: 'debe ser ISO 8601 en UTC, terminado en Z' }).optional(),
  buildVersion: z.string().min(1).max(32).optional(),
  plataforma: z.enum(PLATAFORMAS).optional(),
  origen: esquemaOrigenFiltro,
};

// La regla desde < hasta se aplica a cualquier variante de filtros (comunes + extras).
function conRangoValido<T extends z.ZodObject>(esquema: T) {
  return esquema.refine((f: { desde?: string; hasta?: string }) => f.desde === undefined || f.hasta === undefined || f.desde < f.hasta, {
    message: 'desde debe ser anterior a hasta',
    path: ['desde'],
  });
}

export const esquemaFiltrosEstadisticas = conRangoValido(z.object(camposComunes));
export type FiltrosEstadisticas = z.infer<typeof esquemaFiltrosEstadisticas>;

// Mapa de calor (§10.6): filtros comunes + nivel obligatorio + tamaño de celda en unidades de mundo.
export const esquemaFiltrosMapaCalor = conRangoValido(
  z.object({
    ...camposComunes,
    nivelId: z.string({ error: 'es obligatorio' }).regex(PATRON_ID_CATALOGO, 'debe estar en snake_case'),
    celda: z.coerce.number().positive().max(1000).default(1),
  }),
);
export type FiltrosMapaCalor = z.infer<typeof esquemaFiltrosMapaCalor>;

// Condición de Mongo para el origen: "todos" no filtra.
export function condicionOrigen(origen: OrigenFiltro): { origen?: 'real' | 'seed' } {
  return origen === 'todos' ? {} : { origen };
}
