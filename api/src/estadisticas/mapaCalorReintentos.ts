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

// Límites inferiores de los grupos de intentos de la distribución (S-63): 1, 2–3, 4–6 y 7+.
// Único lugar de configuración; los nombres de los grupos los pone el dashboard.
export const GRUPOS_INTENTOS = [1, 2, 4, 7] as const;

const esquemaGrupoDistribucion = z.object({
  minimo: z.number().int(),
  // null = sin tope (último grupo, "7 o más").
  maximo: z.number().int().nullable(),
  sesiones: z.number().int(),
});

const esquemaGrupoReintentos = z.object({
  sesiones: z.number().int(),
  promedioIntentos: z.number().nullable(),
  maxIntentos: z.number().int().nullable(),
  // Sesiones según su intento máximo en el nivel, siempre con todos los grupos (0 si vacío).
  distribucion: z.array(esquemaGrupoDistribucion),
});

export const esquemaDatosReintentos = registrarEsquema(
  'DatosReintentos',
  z.array(z.object({ nivelId: z.string(), pasaron: esquemaGrupoReintentos, seRindieron: esquemaGrupoReintentos })),
);

// Índice del grupo de GRUPOS_INTENTOS al que pertenece `$intentos`.
const indiceGrupo = {
  $switch: {
    branches: GRUPOS_INTENTOS.map((minimo, i) => ({ case: { $gte: ['$intentos', minimo] }, then: i })).reverse(),
    default: 0,
  },
};

interface FilaResumen {
  _id: { nivelId: string; completado: number };
  sesiones: number;
  promedioIntentos: number;
  maxIntentos: number;
}
interface FilaDistribucion {
  _id: { nivelId: string; completado: number; grupo: number };
  sesiones: number;
}

// Por cada (sesión, nivel): intentos = mayor `intento` visto; "pasaron" si hubo un nivel_fin
// completado de ese nivel en esa sesión; si no, "se rindieron" (incluye sesiones con crash).
export async function estadisticaReintentos(ctx: ContextoEstadistica): Promise<z.infer<typeof esquemaDatosReintentos>> {
  const [facetas] = await EventoModelo.aggregate<{ resumen: FilaResumen[]; distribucion: FilaDistribucion[] }>([
    { $match: { ...filtroEventos(ctx), tipo: { $in: ['nivel_inicio', 'nivel_fin'] } } },
    {
      $group: {
        _id: { sessionId: '$sessionId', nivelId: '$data.nivelId' },
        intentos: { $max: '$data.intento' },
        completado: { $max: { $cond: [{ $eq: ['$data.resultado', 'completado'] }, 1, 0] } },
      },
    },
    {
      $facet: {
        resumen: [
          {
            $group: {
              _id: { nivelId: '$_id.nivelId', completado: '$completado' },
              sesiones: { $sum: 1 },
              promedioIntentos: { $avg: '$intentos' },
              maxIntentos: { $max: '$intentos' },
            },
          },
        ],
        distribucion: [{ $group: { _id: { nivelId: '$_id.nivelId', completado: '$completado', grupo: indiceGrupo }, sesiones: { $sum: 1 } } }],
      },
    },
  ]);
  // $facet siempre devuelve un documento (con arreglos vacíos si no hay eventos).
  const resumen = facetas?.resumen ?? [];
  const distribucion = facetas?.distribucion ?? [];
  const grupo = (nivelId: string, completado: number) => {
    const g = resumen.find((x) => x._id.nivelId === nivelId && x._id.completado === completado);
    const dist = GRUPOS_INTENTOS.map((minimo, i) => ({
      minimo,
      maximo: i + 1 < GRUPOS_INTENTOS.length ? GRUPOS_INTENTOS[i + 1]! - 1 : null,
      sesiones: distribucion.find((d) => d._id.nivelId === nivelId && d._id.completado === completado && d._id.grupo === i)?.sesiones ?? 0,
    }));
    return g
      ? { sesiones: g.sesiones, promedioIntentos: dosDecimales(g.promedioIntentos), maxIntentos: g.maxIntentos, distribucion: dist }
      : { sesiones: 0, promedioIntentos: null, maxIntentos: null, distribucion: dist };
  };
  return nivelesOrdenados(ctx.catalogo).map(({ nivelId }) => ({ nivelId, pasaron: grupo(nivelId, 1), seRindieron: grupo(nivelId, 0) }));
}
