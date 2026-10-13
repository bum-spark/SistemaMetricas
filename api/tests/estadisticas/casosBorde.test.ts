import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminModelo } from '../../src/modelos';
import { crearAppDePrueba } from '../helpers';
import { abrirSesion, loteEjemplo } from '../ingesta/helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { consultar, juegoConSeed, tokenAdmin } from './helpers';
import { oraculoEmbudo } from './oraculo';

// Tests que modifican datos: cada uno empieza con la base limpia.
usarBdPrueba();

const { app } = crearAppDePrueba();

describe('una sola sesión real (la partida de ejemplo de §11)', () => {
  it('valores exactos calculados a mano', async () => {
    const casa = await juegoConSeed('la-casa-del-bosque', null);
    const get = consultar(app, await tokenAdmin(app));
    const ctx = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    await request(app).post('/api/v1/eventos').set('X-Api-Key', casa.apiKey).send(loteEjemplo(ctx));

    expect((await get(casa.juegoId, 'sesiones')).body.datos).toMatchObject({
      sesiones: 1,
      jugadores: 1,
      promedioMs: 10000,
      medianaMs: 10000,
      inferidas: 0,
    });
    expect((await get(casa.juegoId, 'embudo')).body.datos).toEqual([
      { paso: 'casa_abandonada', jugadores: 1, porcentaje: 100 },
      { paso: 'hospital_cuarto', jugadores: 0, porcentaje: 0 },
      { paso: 'habitacion_llamas', jugadores: 0, porcentaje: 0 },
      { paso: 'terminaron', jugadores: 0, porcentaje: 0 },
    ]);
    expect((await get(casa.juegoId, 'tiempo-nivel')).body.datos[0]).toEqual({
      nivelId: 'casa_abandonada',
      completado: { intentos: 1, promedioMs: 150000, medianaMs: 150000 },
      muerte: { intentos: 1, promedioMs: 95000, medianaMs: 95000 },
      abandono: { intentos: 0, promedioMs: null, medianaMs: null },
    });
    expect((await get(casa.juegoId, 'muertes')).body.datos).toEqual([
      { nivelId: 'casa_abandonada', causa: 'fantasma', muertes: 1, jugadores: 1, muertesPorJugador: 1 },
    ]);
    const logros = (await get(casa.juegoId, 'logros')).body.datos as { logroId: string; porcentaje: number }[];
    expect(logros).toHaveLength(5);
    expect(logros.filter((l) => l.porcentaje === 100).map((l) => l.logroId)).toEqual(['tutorial_superado', 'casa_abandonada_completada']);

    // Reintentos: murió en el intento 1 y completó en el 2 → pasó con 2 intentos.
    expect((await get(casa.juegoId, 'reintentos')).body.datos[0]).toEqual({
      nivelId: 'casa_abandonada',
      pasaron: { sesiones: 1, promedioIntentos: 2, maxIntentos: 2 },
      seRindieron: { sesiones: 0, promedioIntentos: null, maxIntentos: null },
    });
    // Mapa de calor: una muerte por fantasma en (12.5, -3.2) → celda (12, -4) con celda 1; (10, -5) con celda 5.
    expect((await get(casa.juegoId, 'mapa-calor', { nivelId: 'casa_abandonada' })).body.datos).toMatchObject({
      totalMuertes: 1,
      celdas: [{ x: 12, y: -4, causa: 'fantasma', muertes: 1 }],
    });
    expect((await get(casa.juegoId, 'mapa-calor', { nivelId: 'casa_abandonada', celda: '5' })).body.datos.celdas).toEqual([
      { x: 10, y: -5, causa: 'fantasma', muertes: 1 },
    ]);
  });

  it('una sesión todavía activa (sin sesion_fin y recién recibida) no entra en la duración', async () => {
    const casa = await juegoConSeed('la-casa-del-bosque', null);
    const get = consultar(app, await tokenAdmin(app));
    const ctx = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    await request(app).post('/api/v1/eventos').set('X-Api-Key', casa.apiKey).send(loteEjemplo(ctx).slice(0, 5));

    expect((await get(casa.juegoId, 'sesiones')).body.datos).toMatchObject({ sesiones: 0, medianaMs: null });
    // El embudo sí cuenta al jugador: empezó el primer nivel.
    expect((await get(casa.juegoId, 'embudo')).body.datos[0]).toEqual({ paso: 'casa_abandonada', jugadores: 1, porcentaje: 100 });
  });
});

describe('datos reales y seed juntos', () => {
  it('origen=todos suma ambos; origen=real y origen=seed los separan', async () => {
    const casa = await juegoConSeed('la-casa-del-bosque', 30);
    const get = consultar(app, await tokenAdmin(app));
    const ctx = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    await request(app).post('/api/v1/eventos').set('X-Api-Key', casa.apiKey).send(loteEjemplo(ctx));

    const soloSeed = oraculoEmbudo(casa.datos, casa.catalogo, {})[0]!.jugadores;
    const primerPaso = async (origen: string) => ((await get(casa.juegoId, 'embudo', { origen })).body.datos as { jugadores: number }[])[0]!.jugadores;
    expect(await primerPaso('todos')).toBe(soloSeed + 1);
    expect(await primerPaso('seed')).toBe(soloSeed);
    expect(await primerPaso('real')).toBe(1);
  });
});

describe('permisos', () => {
  it('403 sin acceso al juego y 404 si el juego permitido ya no existe', async () => {
    const casa = await juegoConSeed('la-casa-del-bosque', null);
    const faro = await juegoConSeed('faro-nocturno-demo', null);
    const get = consultar(app, await tokenAdmin(app));
    const fantasma = randomUUID();
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { juegosPermitidos: [faro.juegoId, fantasma] });

    const sinPermiso = await get(casa.juegoId, 'embudo');
    expect(sinPermiso.status).toBe(403);
    expect(sinPermiso.body.error.codigo).toBe('SIN_PERMISO');
    expect((await get(fantasma, 'embudo')).body.error.codigo).toBe('JUEGO_NO_ENCONTRADO');
  });
});
