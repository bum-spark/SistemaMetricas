import { z } from 'zod';
import { registrarEsquema } from '../openapi/registro';
import type { Catalogo } from './catalogo';
import { PATRON_UUID_V4, PLATAFORMAS, TIPOS_EVENTO, type Plataforma, type TipoEvento } from './constantes';
import { describirIssue } from './zodEs';

// Contrato de eventos (ESQUEMA_EVENTOS.md §2–§4). Los mismos esquemas validan la ingesta
// y generan la documentación OpenAPI.

const uuidV4 = z.string().regex(PATRON_UUID_V4, 'debe ser un UUID v4');
const idCatalogo = z.string().min(1).max(64);
const duracionMs = z.number().int().min(0);
const intento = z.number().int().min(1);

// `data` por tipo. Todos estrictos: un campo desconocido rechaza el evento.
export const ESQUEMAS_DATA = {
  sesion_inicio: z.strictObject({}),
  sesion_fin: z.strictObject({ motivo: z.enum(['cierre_normal', 'menu_salir']) }),
  nivel_inicio: z.strictObject({ nivelId: idCatalogo, intento }),
  nivel_fin: z.strictObject({
    nivelId: idCatalogo,
    intento,
    resultado: z.enum(['completado', 'muerte', 'abandono']),
    duracionMs,
  }),
  muerte: z.strictObject({ nivelId: idCatalogo, intento, causa: idCatalogo, x: z.number(), y: z.number() }),
  logro: z.strictObject({ logroId: idCatalogo }),
  pausa: z.strictObject({ duracionMs, nivelId: idCatalogo.optional() }),
  inactividad: z.strictObject({ duracionMs, nivelId: idCatalogo.optional() }),
  error: z.strictObject({ codigo: z.string().min(1).max(64), mensaje: z.string().min(1).max(500), fatal: z.boolean() }),
  rendimiento: z.strictObject({
    fpsPromedio: z.number().min(0),
    tiempoCargaMs: duracionMs.optional(),
    nivelId: idCatalogo.optional(),
  }),
  flor_recogida: z.strictObject({ nivelId: idCatalogo, duracionMs }),
  dialogo_saltado: z.strictObject({ dialogoId: z.string().min(1).max(64), nivelId: idCatalogo }),
  coleccionable_encontrado: z.strictObject({ coleccionableId: idCatalogo, nivelId: idCatalogo }),
  tutorial_completado: z.strictObject({ duracionMs }),
} satisfies Record<TipoEvento, z.ZodObject>;

const camposComunes = {
  eventoId: uuidV4,
  juegoId: uuidV4,
  playerId: uuidV4,
  sessionId: uuidV4,
  secuencia: z.number().int().min(1),
  // ISO 8601 en UTC con "Z" (sin desfase horario).
  timestamp: z.iso.datetime({ message: 'debe ser ISO 8601 en UTC, terminado en Z' }),
  buildVersion: z.string().min(1).max(32),
  plataforma: z.enum(PLATAFORMAS),
  versionEsquema: z.literal(1),
};

// Primer filtro: la forma común. `tipo` y `data` se revisan después contra el catálogo.
const esquemaSobre = z.strictObject({
  ...camposComunes,
  tipo: z.string().min(1).max(64),
  data: z.record(z.string(), z.unknown()),
});

// Para la documentación: una variante por tipo, discriminada por `tipo`.
export const esquemaEvento = registrarEsquema(
  'Evento',
  z.discriminatedUnion(
    'tipo',
    TIPOS_EVENTO.map((tipo) => z.strictObject({ ...camposComunes, tipo: z.literal(tipo), data: ESQUEMAS_DATA[tipo] })) as unknown as [
      z.ZodObject,
      ...z.ZodObject[],
    ],
  ),
);

export const CODIGOS_RECHAZO = [
  'VALIDACION_FALLIDA',
  'TIPO_NO_REGISTRADO',
  'JUEGO_NO_COINCIDE',
  'SESION_NO_ENCONTRADA',
  'SIN_CONSENTIMIENTO',
] as const;
export type CodigoRechazo = (typeof CODIGOS_RECHAZO)[number];

export interface Rechazo {
  codigo: CodigoRechazo;
  mensaje: string;
}

export interface EventoValidado {
  eventoId: string;
  juegoId: string;
  playerId: string;
  sessionId: string;
  secuencia: number;
  timestamp: Date;
  buildVersion: string;
  plataforma: Plataforma;
  tipo: TipoEvento;
  data: Record<string, unknown>;
  versionEsquema: 1;
}

export type ResultadoValidacion = { ok: true; evento: EventoValidado } | { ok: false; rechazo: Rechazo };

const MAX_FUTURO_MS = 24 * 60 * 60 * 1000; // S-06
const MAX_PASADO_MS = 7 * 24 * 60 * 60 * 1000; // S-06

function rechazo(codigo: CodigoRechazo, mensaje: string): ResultadoValidacion {
  return { ok: false, rechazo: { codigo, mensaje } };
}

function fueraDeCatalogo(campo: string, valor: string): string {
  return `data.${campo} '${valor}' no está en el catálogo del juego.`;
}

// Revisa que los IDs de `data` existan en el catálogo del juego.
function revisarCatalogo(data: Record<string, unknown>, catalogo: Catalogo): string | null {
  const { nivelId, causa, logroId, coleccionableId } = data;
  if (typeof nivelId === 'string' && !catalogo.niveles.some((n) => n.nivelId === nivelId)) {
    return fueraDeCatalogo('nivelId', nivelId);
  }
  if (typeof causa === 'string' && !catalogo.causasMuerte.some((c) => c.causa === causa)) {
    return fueraDeCatalogo('causa', causa);
  }
  if (typeof logroId === 'string' && !catalogo.logros.some((l) => l.logroId === logroId)) {
    return fueraDeCatalogo('logroId', logroId);
  }
  if (typeof coleccionableId === 'string') {
    const coleccionable = catalogo.coleccionables.find((c) => c.coleccionableId === coleccionableId);
    if (!coleccionable) {
      return fueraDeCatalogo('coleccionableId', coleccionableId);
    }
    if (coleccionable.nivelId !== nivelId) {
      return `data.coleccionableId '${coleccionableId}' pertenece al nivel '${coleccionable.nivelId}', no a '${String(nivelId)}'.`;
    }
  }
  return null;
}

// Validación de un evento sin tocar la base de datos. La sesión y el consentimiento
// se revisan después, en lote (servicio de ingesta).
export function validarEvento(crudo: unknown, ctx: { juegoId: string; catalogo: Catalogo; ahora: Date }): ResultadoValidacion {
  const sobre = esquemaSobre.safeParse(crudo);
  if (!sobre.success) {
    return rechazo('VALIDACION_FALLIDA', describirIssue(sobre.error.issues[0]!));
  }
  const e = sobre.data;
  if (e.juegoId !== ctx.juegoId) {
    return rechazo('JUEGO_NO_COINCIDE', 'juegoId no corresponde al juego de la API key.');
  }
  if (!(ctx.catalogo.tiposEvento as string[]).includes(e.tipo)) {
    return rechazo('TIPO_NO_REGISTRADO', `tipo '${e.tipo}' no está registrado para este juego.`);
  }
  const tipo = e.tipo as TipoEvento;

  const timestamp = new Date(e.timestamp);
  const diferencia = timestamp.getTime() - ctx.ahora.getTime();
  if (diferencia > MAX_FUTURO_MS) {
    return rechazo('VALIDACION_FALLIDA', 'timestamp: está más de 24 h en el futuro.');
  }
  if (-diferencia > MAX_PASADO_MS) {
    return rechazo('VALIDACION_FALLIDA', 'timestamp: tiene más de 7 días de antigüedad.');
  }

  const data = ESQUEMAS_DATA[tipo].safeParse(e.data);
  if (!data.success) {
    return rechazo('VALIDACION_FALLIDA', describirIssue(data.error.issues[0]!, 'data'));
  }
  const problemaCatalogo = revisarCatalogo(data.data, ctx.catalogo);
  if (problemaCatalogo) {
    return rechazo('VALIDACION_FALLIDA', problemaCatalogo);
  }

  return { ok: true, evento: { ...e, tipo, timestamp, data: data.data } };
}
