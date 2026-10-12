import { model, Schema, type InferSchemaType } from 'mongoose';
import { campoUuid, opcionesEsquema } from './comun';

const esquemaJugador = new Schema(
  {
    juegoId: { ...campoUuid },
    playerId: { ...campoUuid },
    consentimiento: { type: Boolean, required: true },
    // Reservado para vincular una cuenta del foro en el futuro (entrega 3).
    cuentaId: { type: String, default: null },
    primeraVez: { type: Date, required: true },
    ultimaVez: { type: Date, required: true },
  },
  opcionesEsquema('jugadores'),
);

esquemaJugador.index({ juegoId: 1, playerId: 1 }, { unique: true });
esquemaJugador.index({ juegoId: 1, primeraVez: 1 });

export type Jugador = InferSchemaType<typeof esquemaJugador>;
export const JugadorModelo = model('Jugador', esquemaJugador);
