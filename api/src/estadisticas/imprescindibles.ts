import { z } from 'zod';
import { EventoModelo, SesionModelo } from '../modelos';
import { registrarEsquema } from '../openapi/registro';
import {
  dosDecimales,
  entero,
  filtroEventos,
  filtroSesiones,
  MEDIANA,
  nivelesOrdenados,
  porcentaje,
  ultimoNivelId,
  type ContextoEstadistica,
} from './contexto';
import { etapasSesionesTerminadas } from './duracionSesiones';

// Estadísticas imprescindibles (ESQUEMA_EVENTOS.md §10.1–10.5): sesiones, tiempo por nivel,
// embudo, muertes y logros. Cada función devuelve el `datos` de su endpoint.

const MIN = 60_000;
// Límites inferiores de los grupos del histograma de duración (§10.1).
export const LIMITES_DISTRIBUCION_MS = [0, 5, 10, 15, 20, 25, 30, 45, 60].map((m) => m * MIN);

// ---------- 10.1 Sesiones y duración ----------

export const esquemaDatosSesiones = registrarEsquema(
  'DatosSesiones',
  z.object({
    sesiones: z.number().int(),
    jugadores: z.number().int(),
    promedioMs: z.number().int().nullable(),
    medianaMs: z.number().int().nullable(),
    inferidas: z.number().int(),
    distribucion: z.array(z.object({ desdeMs: z.number().int(), sesiones: z.number().int() })),
  }),
);

export async function estadisticaSesiones(ctx: ContextoEstadistica): Promise<z.infer<typeof esquemaDatosSesiones>> {
  const ultimoLimite = LIMITES_DISTRIBUCION_MS.at(-1)!;
  const [resultado] = await SesionModelo.aggregate<{
    totales: { sesiones: number; jugadores: number; promedioMs: number; medianaMs: number; inferidas: number }[];
    distribucion: { _id: number | 'mas'; sesiones: number }[];
  }>([
    { $match: filtroSesiones(ctx) },
    ...etapasSesionesTerminadas(ctx.ahora),
    {
      $facet: {
        totales: [
          {
            $group: {
              _id: null,
              sesiones: { $sum: 1 },
              jugadores: { $addToSet: '$playerId' },
              promedioMs: { $avg: '$duracionMs' },
              medianaMs: MEDIANA('$duracionMs'),
              inferidas: { $sum: { $cond: ['$finInferido', 1, 0] } },
            },
          },
          { $addFields: { jugadores: { $size: '$jugadores' } } },
        ],
        distribucion: [
          {
            $bucket: {
              groupBy: '$duracionMs',
              boundaries: [...LIMITES_DISTRIBUCION_MS, Number.MAX_SAFE_INTEGER],
              default: 'mas',
              output: { sesiones: { $sum: 1 } },
            },
          },
        ],
      },
    },
  ]);
  const t = resultado?.totales[0];
  const porGrupo = new Map((resultado?.distribucion ?? []).map((d) => [d._id === 'mas' ? ultimoLimite : d._id, d.sesiones]));
  return {
    sesiones: t?.sesiones ?? 0,
    jugadores: t?.jugadores ?? 0,
    promedioMs: entero(t?.promedioMs),
    medianaMs: entero(t?.medianaMs),
    inferidas: t?.inferidas ?? 0,
    distribucion: LIMITES_DISTRIBUCION_MS.map((desdeMs) => ({ desdeMs, sesiones: porGrupo.get(desdeMs) ?? 0 })),
  };
}

// ---------- 10.2 Tiempo por nivel (por intento) ----------

const esquemaTiempoResultado = z.object({
  intentos: z.number().int(),
  promedioMs: z.number().int().nullable(),
  medianaMs: z.number().int().nullable(),
});

export const esquemaDatosTiempoNivel = registrarEsquema(
  'DatosTiempoNivel',
  z.array(
    z.object({
      nivelId: z.string(),
      completado: esquemaTiempoResultado,
      muerte: esquemaTiempoResultado,
      abandono: esquemaTiempoResultado,
    }),
  ),
);

export async function estadisticaTiempoNivel(ctx: ContextoEstadistica): Promise<z.infer<typeof esquemaDatosTiempoNivel>> {
  const grupos = await EventoModelo.aggregate<{ _id: { nivelId: string; resultado: string }; intentos: number; promedioMs: number; medianaMs: number }>([
    { $match: { ...filtroEventos(ctx), tipo: 'nivel_fin' } },
    {
      $group: {
        _id: { nivelId: '$data.nivelId', resultado: '$data.resultado' },
        intentos: { $sum: 1 },
        promedioMs: { $avg: '$data.duracionMs' },
        medianaMs: MEDIANA('$data.duracionMs'),
      },
    },
  ]);
  const clave = (nivelId: string, resultado: string) => `${nivelId}|${resultado}`;
  const porClave = new Map(grupos.map((g) => [clave(g._id.nivelId, g._id.resultado), g]));
  const valores = (nivelId: string, resultado: string) => {
    const g = porClave.get(clave(nivelId, resultado));
    return { intentos: g?.intentos ?? 0, promedioMs: entero(g?.promedioMs), medianaMs: entero(g?.medianaMs) };
  };
  return nivelesOrdenados(ctx.catalogo).map(({ nivelId }) => ({
    nivelId,
    completado: valores(nivelId, 'completado'),
    muerte: valores(nivelId, 'muerte'),
    abandono: valores(nivelId, 'abandono'),
  }));
}

// ---------- 10.3 Embudo de progresión ----------

export const esquemaDatosEmbudo = registrarEsquema(
  'DatosEmbudo',
  z.array(z.object({ paso: z.string(), jugadores: z.number().int(), porcentaje: z.number() })),
);

export const PASO_TERMINARON = 'terminaron';

export async function estadisticaEmbudo(ctx: ContextoEstadistica): Promise<z.infer<typeof esquemaDatosEmbudo>> {
  const ultimo = ultimoNivelId(ctx.catalogo);
  const grupos = await EventoModelo.aggregate<{ _id: string; jugadores: number }>([
    {
      $match: {
        ...filtroEventos(ctx),
        $or: [{ tipo: 'nivel_inicio' }, { tipo: 'nivel_fin', 'data.resultado': 'completado', 'data.nivelId': ultimo }],
      },
    },
    {
      $group: {
        _id: { paso: { $cond: [{ $eq: ['$tipo', 'nivel_fin'] }, PASO_TERMINARON, '$data.nivelId'] }, playerId: '$playerId' },
      },
    },
    { $group: { _id: '$_id.paso', jugadores: { $sum: 1 } } },
  ]);
  const porPaso = new Map(grupos.map((g) => [g._id, g.jugadores]));
  const pasos = [...nivelesOrdenados(ctx.catalogo).map((n) => n.nivelId), PASO_TERMINARON];
  const primero = porPaso.get(pasos[0]!) ?? 0;
  return pasos.map((paso) => {
    const jugadores = porPaso.get(paso) ?? 0;
    return { paso, jugadores, porcentaje: porcentaje(jugadores, primero) };
  });
}

// ---------- 10.4 Muertes por nivel y causa ----------

export const esquemaDatosMuertes = registrarEsquema(
  'DatosMuertes',
  z.array(
    z.object({
      nivelId: z.string(),
      causa: z.string(),
      muertes: z.number().int(),
      jugadores: z.number().int(),
      muertesPorJugador: z.number(),
    }),
  ),
);

export async function estadisticaMuertes(ctx: ContextoEstadistica): Promise<z.infer<typeof esquemaDatosMuertes>> {
  const grupos = await EventoModelo.aggregate<{ _id: { nivelId: string; causa: string }; muertes: number; jugadores: number }>([
    { $match: { ...filtroEventos(ctx), tipo: 'muerte' } },
    { $group: { _id: { nivelId: '$data.nivelId', causa: '$data.causa' }, muertes: { $sum: 1 }, jugadores: { $addToSet: '$playerId' } } },
    { $project: { muertes: 1, jugadores: { $size: '$jugadores' } } },
  ]);
  // Orden del catálogo: niveles por `orden`, causas por su posición (asignación de colores estable).
  const ordenNivel = new Map(nivelesOrdenados(ctx.catalogo).map((n, i) => [n.nivelId, i]));
  const ordenCausa = new Map(ctx.catalogo.causasMuerte.map((c, i) => [c.causa, i]));
  return grupos
    .map((g) => ({
      nivelId: g._id.nivelId,
      causa: g._id.causa,
      muertes: g.muertes,
      jugadores: g.jugadores,
      muertesPorJugador: dosDecimales(g.muertes / g.jugadores),
    }))
    .sort((a, b) => (ordenNivel.get(a.nivelId) ?? 99) - (ordenNivel.get(b.nivelId) ?? 99) || (ordenCausa.get(a.causa) ?? 99) - (ordenCausa.get(b.causa) ?? 99));
}

// ---------- 10.5 Logros (% de jugadores) ----------

export const esquemaDatosLogros = registrarEsquema(
  'DatosLogros',
  z.array(z.object({ logroId: z.string(), nombre: z.string(), jugadores: z.number().int(), porcentaje: z.number() })),
);

export async function estadisticaLogros(ctx: ContextoEstadistica): Promise<z.infer<typeof esquemaDatosLogros>> {
  const F = filtroEventos(ctx);
  const [grupos, [denominador]] = await Promise.all([
    EventoModelo.aggregate<{ _id: string; jugadores: number }>([
      { $match: { ...F, tipo: 'logro' } },
      { $group: { _id: { logroId: '$data.logroId', playerId: '$playerId' } } },
      { $group: { _id: '$_id.logroId', jugadores: { $sum: 1 } } },
    ]),
    // Jugadores con al menos un evento en el rango filtrado (S-22).
    EventoModelo.aggregate<{ total: number }>([{ $match: F }, { $group: { _id: '$playerId' } }, { $count: 'total' }]),
  ]);
  const total = denominador?.total ?? 0;
  const porLogro = new Map(grupos.map((g) => [g._id, g.jugadores]));
  return ctx.catalogo.logros.map((l) => {
    const jugadores = porLogro.get(l.logroId) ?? 0;
    return { logroId: l.logroId, nombre: l.nombre, jugadores, porcentaje: porcentaje(jugadores, total) };
  });
}
