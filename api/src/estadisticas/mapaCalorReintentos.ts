import { z } from 'zod';
import { AppError } from '../errores';
import { EventoModelo } from '../modelos';
import { registrarEsquema } from '../openapi/registro';
import { dosDecimales, filtroEventos, nivelesOrdenados, type ContextoEstadistica } from './contexto';
import type { FiltrosMapaCalor } from './filtros';

// Estadísticas recomendables de la etapa 7b (ESQUEMA_EVENTOS.md §10.6 y §10.7).

// ---------- 10.6 Mapa de calor de muertes ----------

export const esquemaDatosMapaCalor = registrarEsquema(
  'DatosMapaCalor',
  z.object({
    nivelId: z.string(),
    imagenUrl: z.string().nullable(),
    limites: z.object({ minX: z.number(), maxX: z.number(), minY: z.number(), maxY: z.number() }).nullable(),
    celda: z.number(),
    totalMuertes: z.number().int(),
    // Esquina inferior izquierda de cada celda (unidades de mundo) y muertes por causa.
    celdas: z.array(z.object({ x: z.number(), y: z.number(), causa: z.string(), muertes: z.number().int() })),
  }),
);

export async function estadisticaMapaCalor(ctx: ContextoEstadistica<FiltrosMapaCalor>): Promise<z.infer<typeof esquemaDatosMapaCalor>> {
  const { nivelId, celda } = ctx.filtros;
  const nivel = ctx.catalogo.niveles.find((n) => n.nivelId === nivelId);
  if (!nivel) {
    throw new AppError(400, 'VALIDACION_FALLIDA', `nivelId '${nivelId}' no está en el catálogo del juego.`);
  }
  const grupos = await EventoModelo.aggregate<{ _id: { cx: number; cy: number; causa: string }; muertes: number }>([
    { $match: { ...filtroEventos(ctx), tipo: 'muerte', 'data.nivelId': nivelId } },
    {
      $group: {
        _id: {
          cx: { $floor: { $divide: ['$data.x', celda] } },
          cy: { $floor: { $divide: ['$data.y', celda] } },
          causa: '$data.causa',
        },
        muertes: { $sum: 1 },
      },
    },
  ]);
  const ordenCausa = new Map(ctx.catalogo.causasMuerte.map((c, i) => [c.causa, i]));
  const celdas = grupos
    .map((g) => ({ cx: g._id.cx, cy: g._id.cy, causa: g._id.causa, muertes: g.muertes }))
    .sort((a, b) => a.cx - b.cx || a.cy - b.cy || (ordenCausa.get(a.causa) ?? 99) - (ordenCausa.get(b.causa) ?? 99))
    .map((g) => ({ x: g.cx * celda, y: g.cy * celda, causa: g.causa, muertes: g.muertes }));
  return {
    nivelId,
    imagenUrl: nivel.imagenUrl ?? null,
    limites: nivel.limites ?? null,
    celda,
    totalMuertes: celdas.reduce((s, c) => s + c.muertes, 0),
    celdas,
  };
}

// ---------- 10.7 Reintentos por nivel ----------

const esquemaGrupoReintentos = z.object({
  sesiones: z.number().int(),
  promedioIntentos: z.number().nullable(),
  maxIntentos: z.number().int().nullable(),
});

export const esquemaDatosReintentos = registrarEsquema(
  'DatosReintentos',
  z.array(z.object({ nivelId: z.string(), pasaron: esquemaGrupoReintentos, seRindieron: esquemaGrupoReintentos })),
);

// Por cada (sesión, nivel): intentos = mayor `intento` visto; "pasaron" si hubo un nivel_fin
// completado de ese nivel en esa sesión; si no, "se rindieron" (incluye sesiones con crash).
export async function estadisticaReintentos(ctx: ContextoEstadistica): Promise<z.infer<typeof esquemaDatosReintentos>> {
  const grupos = await EventoModelo.aggregate<{ _id: { nivelId: string; completado: number }; sesiones: number; promedioIntentos: number; maxIntentos: number }>([
    { $match: { ...filtroEventos(ctx), tipo: { $in: ['nivel_inicio', 'nivel_fin'] } } },
    {
      $group: {
        _id: { sessionId: '$sessionId', nivelId: '$data.nivelId' },
        intentos: { $max: '$data.intento' },
        completado: { $max: { $cond: [{ $eq: ['$data.resultado', 'completado'] }, 1, 0] } },
      },
    },
    {
      $group: {
        _id: { nivelId: '$_id.nivelId', completado: '$completado' },
        sesiones: { $sum: 1 },
        promedioIntentos: { $avg: '$intentos' },
        maxIntentos: { $max: '$intentos' },
      },
    },
  ]);
  const grupo = (nivelId: string, completado: number) => {
    const g = grupos.find((x) => x._id.nivelId === nivelId && x._id.completado === completado);
    return g
      ? { sesiones: g.sesiones, promedioIntentos: dosDecimales(g.promedioIntentos), maxIntentos: g.maxIntentos }
      : { sesiones: 0, promedioIntentos: null, maxIntentos: null };
  };
  return nivelesOrdenados(ctx.catalogo).map(({ nivelId }) => ({ nivelId, pasaron: grupo(nivelId, 1), seRindieron: grupo(nivelId, 0) }));
}
