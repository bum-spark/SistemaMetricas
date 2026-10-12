import { randomUUID } from 'node:crypto';
import type { AnyBulkWriteOperation } from 'mongoose';
import { validarEvento, type EventoValidado, type Rechazo } from '../dominio/eventos';
import type { JuegoAutenticado } from '../middlewares/autenticarJuego';
import { EventoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../modelos';
import type { Sesion } from '../modelos/sesion';
import type { Jugador } from '../modelos/jugador';
import type { SolicitudSesion } from './esquemas';

// ---------- POST /sesiones ----------

export type ResultadoSesion =
  | { estado: 201; cuerpo: { sessionId: string } }
  | { estado: 200; cuerpo: { sessionId: null; consentimiento: false } };

// ESQUEMA_EVENTOS.md §1.2. El consentimiento se guarda en `jugadores` y se actualiza en cada arranque.
export async function crearSesion(juego: JuegoAutenticado, datos: SolicitudSesion, ahora = new Date()): Promise<ResultadoSesion> {
  const filtroJugador = { juegoId: juego.juegoId, playerId: datos.playerId };

  if (!datos.consentimiento) {
    // Sin consentimiento no se crea sesión ni jugador; si ya existía, solo se marca (S-16).
    await JugadorModelo.updateOne(filtroJugador, { $set: { consentimiento: false } });
    return { estado: 200, cuerpo: { sessionId: null, consentimiento: false } };
  }

  await JugadorModelo.updateOne(
    filtroJugador,
    {
      $set: { consentimiento: true, ultimaVez: ahora },
      $setOnInsert: { primeraVez: ahora, cuentaId: null, origen: 'real' },
    },
    { upsert: true },
  );
  const sessionId = randomUUID();
  await SesionModelo.create({
    sessionId,
    juegoId: juego.juegoId,
    playerId: datos.playerId,
    buildVersion: datos.buildVersion,
    plataforma: datos.plataforma,
    creadaEn: ahora,
    ultimoEventoEn: ahora,
    origen: 'real',
  });
  return { estado: 201, cuerpo: { sessionId } };
}

// ---------- POST /eventos ----------

export interface RechazoIndexado extends Rechazo {
  indice: number;
}

export interface ResultadoIngesta {
  aceptados: number;
  rechazados: RechazoIndexado[];
}

function esSoloLlavesDuplicadas(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const { code, writeErrors } = err as { code?: number; writeErrors?: { code?: number; err?: { code?: number } }[] };
  if (Array.isArray(writeErrors) && writeErrors.length > 0) {
    return writeErrors.every((w) => (w.code ?? w.err?.code) === 11000);
  }
  return code === 11000;
}

// Inserta sin orden y tolera solo llaves duplicadas (reintentos concurrentes del mismo evento).
async function insertarIgnorandoDuplicados(insertar: () => Promise<unknown>): Promise<void> {
  try {
    await insertar();
  } catch (err) {
    if (!esSoloLlavesDuplicadas(err)) {
      throw err;
    }
  }
}

// ESQUEMA_EVENTOS.md §1.3: aceptación parcial, duplicados por eventoId, logros y ultimoEventoEn.
export async function ingerirEventos(juego: JuegoAutenticado, crudos: unknown[], ahora = new Date()): Promise<ResultadoIngesta> {
  const rechazados: RechazoIndexado[] = [];
  const validos: { indice: number; evento: EventoValidado }[] = [];

  // 1. Validación sin base de datos (forma, tipo, catálogo, timestamp).
  crudos.forEach((crudo, indice) => {
    const resultado = validarEvento(crudo, { juegoId: juego.juegoId, catalogo: juego.catalogo, ahora });
    if (resultado.ok) {
      validos.push({ indice, evento: resultado.evento });
    } else {
      rechazados.push({ indice, ...resultado.rechazo });
    }
  });

  // 2. Consentimiento y sesión, consultados en lote.
  const playerIds = [...new Set(validos.map((v) => v.evento.playerId))];
  const sessionIds = [...new Set(validos.map((v) => v.evento.sessionId))];
  const [jugadores, sesiones] = await Promise.all([
    JugadorModelo.find({ juegoId: juego.juegoId, playerId: { $in: playerIds } }, { playerId: 1, consentimiento: 1 }).lean<Pick<Jugador, 'playerId' | 'consentimiento'>[]>(),
    SesionModelo.find({ juegoId: juego.juegoId, sessionId: { $in: sessionIds } }, { sessionId: 1, playerId: 1 }).lean<Pick<Sesion, 'sessionId' | 'playerId'>[]>(),
  ]);
  const consentimientoPorJugador = new Map(jugadores.map((j) => [j.playerId, j.consentimiento]));
  const jugadorPorSesion = new Map(sesiones.map((s) => [s.sessionId, s.playerId]));

  const aceptados: EventoValidado[] = [];
  for (const { indice, evento } of validos) {
    if (consentimientoPorJugador.get(evento.playerId) === false) {
      rechazados.push({ indice, codigo: 'SIN_CONSENTIMIENTO', mensaje: 'El jugador retiró su consentimiento; no se guardan sus eventos.' });
    } else if (jugadorPorSesion.get(evento.sessionId) !== evento.playerId) {
      rechazados.push({ indice, codigo: 'SESION_NO_ENCONTRADA', mensaje: 'sessionId no existe para este jugador y juego.' });
    } else {
      aceptados.push(evento);
    }
  }

  // 3. Duplicados: dentro del lote y contra lo ya guardado. Cuentan como aceptados.
  const vistos = new Set<string>();
  const unicos = aceptados.filter((e) => !vistos.has(e.eventoId) && vistos.add(e.eventoId));
  const existentes = new Set(
    (
      await EventoModelo.find({ juegoId: juego.juegoId, eventoId: { $in: unicos.map((e) => e.eventoId) } }, { eventoId: 1 }).lean<
        { eventoId: string }[]
      >()
    ).map((e) => e.eventoId),
  );
  const nuevos = unicos.filter((e) => !existentes.has(e.eventoId));

  if (nuevos.length > 0) {
    await insertarIgnorandoDuplicados(() =>
      EventoModelo.insertMany(
        nuevos.map((e) => ({ ...e, recibidoEn: ahora, origen: 'real' as const })),
        { ordered: false },
      ),
    );
  }

  // 4. Efectos derivados, idempotentes (un reenvío no cambia nada).
  await actualizarSesionesYJugadores(juego.juegoId, aceptados, ahora);
  await registrarLogros(juego.juegoId, aceptados);

  rechazados.sort((a, b) => a.indice - b.indice);
  return { aceptados: aceptados.length, rechazados };
}

async function actualizarSesionesYJugadores(juegoId: string, eventos: EventoValidado[], ahora: Date): Promise<void> {
  if (eventos.length === 0) {
    return;
  }
  const porSesion = new Map<string, { maximo: Date; inicio?: Date; fin?: Date }>();
  for (const e of eventos) {
    const actual = porSesion.get(e.sessionId) ?? { maximo: e.timestamp };
    if (e.timestamp > actual.maximo) {
      actual.maximo = e.timestamp;
    }
    if (e.tipo === 'sesion_inicio' && (!actual.inicio || e.timestamp < actual.inicio)) {
      actual.inicio = e.timestamp;
    }
    if (e.tipo === 'sesion_fin' && (!actual.fin || e.timestamp < actual.fin)) {
      actual.fin = e.timestamp;
    }
    porSesion.set(e.sessionId, actual);
  }

  const operaciones: AnyBulkWriteOperation[] = [];
  for (const [sessionId, { maximo, inicio, fin }] of porSesion) {
    operaciones.push({ updateOne: { filter: { juegoId, sessionId }, update: { $max: { ultimoEventoEn: maximo } } } });
    // inicio y fin: se queda el primero que llegó.
    if (inicio) {
      operaciones.push({ updateOne: { filter: { juegoId, sessionId, inicio: null }, update: { $set: { inicio } } } });
    }
    if (fin) {
      operaciones.push({ updateOne: { filter: { juegoId, sessionId, fin: null }, update: { $set: { fin } } } });
    }
  }
  await SesionModelo.bulkWrite(operaciones, { ordered: false });

  const playerIds = [...new Set(eventos.map((e) => e.playerId))];
  await JugadorModelo.updateMany({ juegoId, playerId: { $in: playerIds } }, { $max: { ultimaVez: ahora } });
}

// Un logro cuenta una vez por jugador: el índice único descarta los repetidos.
async function registrarLogros(juegoId: string, eventos: EventoValidado[]): Promise<void> {
  const logros = eventos
    .filter((e) => e.tipo === 'logro')
    .map((e) => ({ juegoId, playerId: e.playerId, sessionId: e.sessionId, logroId: String(e.data.logroId), obtenidoEn: e.timestamp }));
  if (logros.length > 0) {
    await insertarIgnorandoDuplicados(() => LogroObtenidoModelo.insertMany(logros, { ordered: false }));
  }
}
