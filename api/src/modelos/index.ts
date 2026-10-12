import { AdminModelo } from './admin';
import { EventoModelo } from './evento';
import { JuegoModelo } from './juego';
import { JugadorModelo } from './jugador';
import { LogroObtenidoModelo } from './logroObtenido';
import { SesionModelo } from './sesion';

export { AdminModelo, EventoModelo, JuegoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo };

export const MODELOS = [JuegoModelo, JugadorModelo, SesionModelo, EventoModelo, LogroObtenidoModelo, AdminModelo];

// Crea las colecciones y los índices declarados en los esquemas (no borra índices ajenos).
export async function asegurarIndices(): Promise<void> {
  await Promise.all(MODELOS.map((modelo) => modelo.createCollection().then(() => modelo.createIndexes())));
}
