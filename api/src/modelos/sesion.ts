import { model, Schema, type InferSchemaType } from 'mongoose';
import { ORIGENES, PLATAFORMAS } from '../dominio/constantes';
import { campoUuid, opcionesEsquema } from './comun';

const esquemaSesion = new Schema(
  {
    sessionId: { ...campoUuid, unique: true },
    juegoId: { ...campoUuid },
    playerId: { ...campoUuid },
    buildVersion: { type: String, required: true, maxlength: 32 },
    plataforma: { type: String, required: true, enum: PLATAFORMAS },
    creadaEn: { type: Date, required: true },
    // timestamp de sesion_inicio / sesion_fin.
    inicio: { type: Date, default: null },
    fin: { type: Date, default: null },
    // Dos relojes separados (ESQUEMA_EVENTOS.md §1.4, R-34):
    // - ultimoEventoEn: máximo `timestamp` del CLIENTE recibido. null hasta el primer evento.
    //   Solo para el fin inferido y la duración (misma escala de tiempo que `inicio`).
    ultimoEventoEn: { type: Date, default: null },
    // - ultimoRecibidoEn: hora del SERVIDOR de la última ingesta con eventos de la sesión.
    //   Solo para decidir si la sesión ya terminó (30 min sin recibir eventos, S-05).
    ultimoRecibidoEn: { type: Date, default: null },
    // 'real' (ingesta) o 'seed' (datos de prueba). Lo pone el servidor, nunca el cliente.
    origen: { type: String, required: true, enum: ORIGENES, default: 'real' },
  },
  opcionesEsquema('sesiones'),
);

// Rango de fechas de las estadísticas de sesiones (filtra por `inicio`, reloj del cliente, R-34).
// Reemplaza a { juegoId, creadaEn }, que ninguna consulta usa desde R-34 (R-49).
esquemaSesion.index({ juegoId: 1, inicio: 1 });
esquemaSesion.index({ juegoId: 1, playerId: 1 });
esquemaSesion.index({ juegoId: 1, buildVersion: 1, plataforma: 1 });

export type Sesion = InferSchemaType<typeof esquemaSesion>;
export const SesionModelo = model('Sesion', esquemaSesion);
