import { EventoModelo, JuegoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../../src/modelos';
import { limpiarSeed } from '../../src/scripts/limpiarSeed';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { datosEvento, datosJuego, datosSesion, uuid } from '../modelos/fixtures';

usarBdPrueba();

async function crearJugadorCompleto(juegoId: string, origen: 'real' | 'seed') {
  const playerId = uuid();
  const sessionId = uuid();
  const ahora = new Date();
  await JugadorModelo.create({ juegoId, playerId, consentimiento: true, primeraVez: ahora, ultimaVez: ahora, origen });
  await SesionModelo.create(datosSesion({ juegoId, playerId, sessionId, origen }));
  await EventoModelo.create(datosEvento({ juegoId, playerId, sessionId, origen }));
  await EventoModelo.create(datosEvento({ juegoId, playerId, sessionId, origen, secuencia: 2 }));
  await LogroObtenidoModelo.create({ juegoId, playerId, sessionId, logroId: 'la_verdad', obtenidoEn: ahora });
}

describe('origen por defecto', () => {
  it('jugadores, sesiones y eventos guardan origen "real" si no se indica', async () => {
    const juegoId = uuid();
    const jugador = await JugadorModelo.create({ juegoId, playerId: uuid(), consentimiento: true, primeraVez: new Date(), ultimaVez: new Date() });
    const sesion = await SesionModelo.create(datosSesion());
    const evento = await EventoModelo.create(datosEvento());
    expect([jugador.origen, sesion.origen, evento.origen]).toEqual(['real', 'real', 'real']);
  });

  it('rechaza un origen desconocido', async () => {
    await expect(EventoModelo.create(datosEvento({ origen: 'importado' }))).rejects.toThrow(/origen/);
  });
});

describe('limpiarSeed', () => {
  it('borra solo lo marcado como seed (y los logros de esos jugadores) y cuenta lo eliminado', async () => {
    const juego = await JuegoModelo.create(datosJuego());
    await crearJugadorCompleto(juego.juegoId, 'seed');
    await crearJugadorCompleto(juego.juegoId, 'seed');
    await crearJugadorCompleto(juego.juegoId, 'real');

    const resultado = await limpiarSeed();

    expect(resultado).toEqual({ eventos: 4, sesiones: 2, jugadores: 2, logros: 2 });
    expect(await JugadorModelo.countDocuments()).toBe(1);
    expect(await EventoModelo.countDocuments({ origen: 'real' })).toBe(2);
    expect(await LogroObtenidoModelo.countDocuments()).toBe(1);
    expect(await JuegoModelo.countDocuments()).toBe(1);
  });

  it('con --juego limita el borrado a ese juego', async () => {
    const casa = await JuegoModelo.create(datosJuego());
    const faro = await JuegoModelo.create(datosJuego());
    await crearJugadorCompleto(casa.juegoId, 'seed');
    await crearJugadorCompleto(faro.juegoId, 'seed');

    const resultado = await limpiarSeed({ juegoSlug: faro.slug });

    expect(resultado).toEqual({ eventos: 2, sesiones: 1, jugadores: 1, logros: 1 });
    expect(await JugadorModelo.countDocuments({ juegoId: casa.juegoId, origen: 'seed' })).toBe(1);
    expect(await JugadorModelo.countDocuments({ juegoId: faro.juegoId })).toBe(0);
  });

  it('falla con un mensaje claro si el slug no existe', async () => {
    await expect(limpiarSeed({ juegoSlug: 'no-existe' })).rejects.toThrow('No existe un juego con slug "no-existe".');
  });

  it('no falla si no hay nada que borrar', async () => {
    await expect(limpiarSeed()).resolves.toEqual({ eventos: 0, sesiones: 0, jugadores: 0, logros: 0 });
  });
});
