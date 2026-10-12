import { model, Schema, type InferSchemaType } from 'mongoose';
import { PATRON_ID_CATALOGO } from '../dominio/constantes';
import { campoUuid, opcionesEsquema } from './comun';

// Colección `logros`: logros obtenidos por cada jugador (el catálogo de logros vive en `juegos`).
const esquemaLogroObtenido = new Schema(
  {
    juegoId: { ...campoUuid },
    playerId: { ...campoUuid },
    logroId: { type: String, required: true, match: PATRON_ID_CATALOGO },
    sessionId: { ...campoUuid },
    obtenidoEn: { type: Date, required: true },
  },
  opcionesEsquema('logros'),
);

// Un logro cuenta una vez por jugador.
esquemaLogroObtenido.index({ juegoId: 1, playerId: 1, logroId: 1 }, { unique: true });
esquemaLogroObtenido.index({ juegoId: 1, logroId: 1 });

export type LogroObtenido = InferSchemaType<typeof esquemaLogroObtenido>;
export const LogroObtenidoModelo = model('LogroObtenido', esquemaLogroObtenido);
