import { EventoModelo, JuegoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../modelos';
import { ejecutarScript, ErrorScript, texto } from './comun';

export interface ResultadoLimpieza {
  eventos: number;
  sesiones: number;
  jugadores: number;
  logros: number;
}

// Borra todo lo marcado con origen 'seed' (R-32). Los logros obtenidos no tienen
// `origen`: se borran los de los jugadores seed eliminados. Los juegos no se tocan.
export async function limpiarSeed(opciones: { juegoSlug?: string | undefined } = {}): Promise<ResultadoLimpieza> {
  let juegoId: string | undefined;
  if (opciones.juegoSlug !== undefined) {
    const juego = await JuegoModelo.findOne({ slug: opciones.juegoSlug }, { juegoId: 1 }).lean();
    if (!juego) {
      throw new ErrorScript(`No existe un juego con slug "${opciones.juegoSlug}".`);
    }
    juegoId = juego.juegoId;
  }
  const filtro = juegoId === undefined ? { origen: 'seed' as const } : { origen: 'seed' as const, juegoId };

  const jugadoresSeed = await JugadorModelo.find(filtro, { juegoId: 1, playerId: 1 }).lean();
  const porJuego = new Map<string, string[]>();
  for (const { juegoId: id, playerId } of jugadoresSeed) {
    porJuego.set(id, [...(porJuego.get(id) ?? []), playerId]);
  }
  let logros = 0;
  for (const [id, playerIds] of porJuego) {
    logros += (await LogroObtenidoModelo.deleteMany({ juegoId: id, playerId: { $in: playerIds } })).deletedCount;
  }

  const eventos = (await EventoModelo.deleteMany(filtro)).deletedCount;
  const sesiones = (await SesionModelo.deleteMany(filtro)).deletedCount;
  const jugadores = (await JugadorModelo.deleteMany(filtro)).deletedCount;
  return { eventos, sesiones, jugadores, logros };
}

export async function main(argv: string[]): Promise<void> {
  await ejecutarScript('limpiar-seed', argv, { juego: { type: 'string' } }, async ({ args, log }) => {
    const juegoSlug = texto(args, 'juego');
    log(juegoSlug ? `Borrando datos seed del juego "${juegoSlug}"…` : 'Borrando datos seed de todos los juegos…');
    const r = await limpiarSeed({ juegoSlug });
    log(`Eliminados → eventos: ${r.eventos} · sesiones: ${r.sesiones} · jugadores: ${r.jugadores} · logros: ${r.logros}`);
    log(`Total: ${r.eventos + r.sesiones + r.jugadores + r.logros} documentos. Los datos con origen "real" no se tocaron.`);
  });
}
