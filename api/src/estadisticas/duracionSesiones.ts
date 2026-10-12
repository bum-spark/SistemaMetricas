import type { PipelineStage } from 'mongoose';
import { SesionModelo } from '../modelos';

// Sesiones terminadas y su duración (ESQUEMA_EVENTOS.md §1.4 y §10.1, R-34).
// Dos relojes, cada uno para una sola cosa:
// - ¿Terminó? → reloj del SERVIDOR: tiene `fin`, o no se recibieron eventos en 30 min
//   (`ultimoRecibidoEn`). Así un reloj del cliente atrasado no "cierra" sesiones activas.
// - ¿Cuánto duró? → reloj del CLIENTE: (`fin` ?? `ultimoEventoEn`) − `inicio`, todos timestamps
//   del juego. Nunca se mezcla con `creadaEn` ni con la hora del servidor.
// Las sesiones sin `inicio` (sin sesion_inicio) o sin eventos no entran.

export const MINUTOS_SIN_EVENTOS_PARA_TERMINAR = 30; // S-05

export function etapasSesionesTerminadas(ahora: Date): PipelineStage[] {
  const limite = new Date(ahora.getTime() - MINUTOS_SIN_EVENTOS_PARA_TERMINAR * 60 * 1000);
  return [
    { $match: { inicio: { $ne: null }, ultimoEventoEn: { $ne: null } } },
    { $match: { $or: [{ fin: { $ne: null } }, { ultimoRecibidoEn: { $lt: limite } }] } },
    {
      $addFields: {
        finInferido: { $eq: ['$fin', null] },
        duracionMs: { $subtract: [{ $ifNull: ['$fin', '$ultimoEventoEn'] }, '$inicio'] },
      },
    },
    // Un fin anterior al inicio (relojes del cliente incoherentes) no es una duración válida.
    { $match: { duracionMs: { $gte: 0 } } },
  ];
}

export interface DuracionSesion {
  sessionId: string;
  duracionMs: number;
  finInferido: boolean;
}

export async function duracionesDeSesiones(juegoId: string, ahora: Date = new Date()): Promise<DuracionSesion[]> {
  return SesionModelo.aggregate<DuracionSesion>([
    { $match: { juegoId } },
    ...etapasSesionesTerminadas(ahora),
    { $project: { _id: 0, sessionId: 1, duracionMs: 1, finInferido: 1 } },
  ]);
}
