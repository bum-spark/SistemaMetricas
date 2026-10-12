import { model, Schema, type InferSchemaType } from 'mongoose';
import { ORIGENES, PLATAFORMAS, TIPOS_EVENTO, VERSIONES_ESQUEMA } from '../dominio/constantes';
import { campoUuid, opcionesEsquema } from './comun';

// Campos comunes de ESQUEMA_EVENTOS.md §2. La validación estricta de cada evento
// (incluido `data` por tipo y contra el catálogo) la hace la ingesta con zod.
const esquemaEvento = new Schema(
  {
    eventoId: { ...campoUuid },
    juegoId: { ...campoUuid },
    playerId: { ...campoUuid },
    sessionId: { ...campoUuid },
    secuencia: { type: Number, required: true, min: 1 },
    timestamp: { type: Date, required: true },
    buildVersion: { type: String, required: true, maxlength: 32 },
    plataforma: { type: String, required: true, enum: PLATAFORMAS },
    tipo: { type: String, required: true, enum: TIPOS_EVENTO },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
    versionEsquema: { type: Number, required: true, enum: VERSIONES_ESQUEMA },
    recibidoEn: { type: Date, required: true },
    // 'real' (ingesta) o 'seed' (datos de prueba). Lo pone el servidor, nunca el cliente.
    origen: { type: String, required: true, enum: ORIGENES, default: 'real' },
  },
  { ...opcionesEsquema('eventos'), minimize: false },
);

// Duplicados por eventoId (R-07).
esquemaEvento.index({ juegoId: 1, eventoId: 1 }, { unique: true });
esquemaEvento.index({ juegoId: 1, tipo: 1, timestamp: 1 });
// Orden dentro de la sesión (R-16).
esquemaEvento.index({ juegoId: 1, sessionId: 1, secuencia: 1 });
esquemaEvento.index({ juegoId: 1, playerId: 1 });
esquemaEvento.index({ juegoId: 1, tipo: 1, buildVersion: 1 });

export type Evento = InferSchemaType<typeof esquemaEvento>;
export const EventoModelo = model('Evento', esquemaEvento);
