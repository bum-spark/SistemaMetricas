import { model, Schema, type InferSchemaType } from 'mongoose';
import { PLATAFORMAS } from '../dominio/constantes';
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
    // timestamp máximo recibido; base del fin inferido (ESQUEMA_EVENTOS.md §1.4).
    ultimoEventoEn: { type: Date, required: true },
  },
  opcionesEsquema('sesiones'),
);

esquemaSesion.index({ juegoId: 1, creadaEn: 1 });
esquemaSesion.index({ juegoId: 1, playerId: 1 });
esquemaSesion.index({ juegoId: 1, buildVersion: 1, plataforma: 1 });

export type Sesion = InferSchemaType<typeof esquemaSesion>;
export const SesionModelo = model('Sesion', esquemaSesion);
