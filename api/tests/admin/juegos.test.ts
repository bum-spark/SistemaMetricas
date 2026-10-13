import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminModelo, EventoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../../src/modelos';
import { crearAdmin } from '../../src/scripts/crearAdmin';
import { crearAppDePrueba } from '../helpers';
import { abrirSesion, evento, loteEjemplo, prepararJuego, type JuegoPrueba } from '../ingesta/helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const PASSWORD = 'contraseña-del-admin-larga';
const { app } = crearAppDePrueba();
let casa: JuegoPrueba;
let faro: JuegoPrueba;
let token: string;

beforeEach(async () => {
  casa = await prepararJuego('la-casa-del-bosque');
  faro = await prepararJuego('faro-nocturno-demo');
  await crearAdmin({ email: 'admin@xolos.mx', password: PASSWORD, nombre: 'Admin' }); // acceso a los dos
  token = (await request(app).post('/api/v1/auth/login').send({ email: 'admin@xolos.mx', password: PASSWORD })).body.token as string;
});

const get = (ruta: string) => request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
const enviar = (juego: JuegoPrueba, cuerpo: unknown) => request(app).post('/api/v1/eventos').set('X-Api-Key', juego.apiKey).send(cuerpo as object);

describe('GET /api/v1/juegos', () => {
  it('lista los juegos permitidos con su resumen (jugadores, sesiones, tasa de completado)', async () => {
    // Dos jugadores en La Casa del Bosque; solo uno llega a completar el último nivel.
    const a = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    const b = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    await enviar(casa, [...loteEjemplo(a), evento(a, 20, 'nivel_fin', { nivelId: 'habitacion_llamas', intento: 1, resultado: 'completado', duracionMs: 9 })]);
    await enviar(casa, loteEjemplo(b));

    const res = await get('/juegos');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pagina: 1, limite: 20, total: 2 });
    const lcdb = (res.body.datos as { slug: string; resumen: unknown }[]).find((j) => j.slug === 'la-casa-del-bosque');
    expect(lcdb).toMatchObject({ juegoId: casa.juegoId, nombre: 'La Casa del Bosque', versionActual: '1.0.0', activo: true });
    expect(lcdb?.resumen).toEqual({ jugadores: 2, sesiones: 2, tasaCompletado: 0.5 });
  });

  it('incluye logoUrl: la ruta del dashboard o null si el juego no tiene logo', async () => {
    const res = await get('/juegos');
    const logos = Object.fromEntries((res.body.datos as { slug: string; logoUrl: string | null }[]).map((j) => [j.slug, j.logoUrl]));
    expect(logos).toEqual({ 'la-casa-del-bosque': '/juegos/la-casa-del-bosque/logo.png', 'faro-nocturno-demo': null });
  });

  it('un juego sin datos tiene resumen en cero', async () => {
    const res = await get('/juegos');
    const demo = (res.body.datos as { slug: string; resumen: unknown }[]).find((j) => j.slug === 'faro-nocturno-demo');
    expect(demo?.resumen).toEqual({ jugadores: 0, sesiones: 0, tasaCompletado: 0 });
  });

  it('solo muestra los juegos de juegosPermitidos', async () => {
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { juegosPermitidos: [faro.juegoId] });
    const res = await get('/juegos');
    expect((res.body.datos as { slug: string }[]).map((j) => j.slug)).toEqual(['faro-nocturno-demo']);
    expect(res.body.total).toBe(1);
  });

  it('pagina con pagina y limite', async () => {
    const primera = await get('/juegos?pagina=1&limite=1');
    const segunda = await get('/juegos?pagina=2&limite=1');
    expect(primera.body).toMatchObject({ pagina: 1, limite: 1, total: 2 });
    expect(primera.body.datos).toHaveLength(1);
    expect(segunda.body.datos).toHaveLength(1);
    expect(primera.body.datos[0].slug).not.toBe(segunda.body.datos[0].slug);
  });

  it('valida la paginación (400) y exige token (401)', async () => {
    expect((await get('/juegos?limite=500')).status).toBe(400);
    expect((await request(app).get('/api/v1/juegos')).status).toBe(401);
  });
});

describe('GET /api/v1/juegos/:juegoId', () => {
  it('devuelve el catálogo (con duracionEsperadaMs) y los filtros distintos de las sesiones', async () => {
    await abrirSesion(app, casa);
    await request(app)
      .post('/api/v1/sesiones')
      .set('X-Api-Key', casa.apiKey)
      .send({ juegoId: casa.juegoId, playerId: randomUUID(), buildVersion: '1.1.0', plataforma: 'android', consentimiento: true });

    const res = await get(`/juegos/${casa.juegoId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ juegoId: casa.juegoId, slug: 'la-casa-del-bosque', logoUrl: '/juegos/la-casa-del-bosque/logo.png' });
    expect(res.body.catalogo.duracionEsperadaMs).toBe(1200000);
    expect((res.body.catalogo.niveles as { nivelId: string }[]).map((n) => n.nivelId)).toEqual(['casa_abandonada', 'hospital_cuarto', 'habitacion_llamas']);
    expect(res.body.filtros).toEqual({ buildVersions: ['1.0.0', '1.1.0'], plataformas: ['android', 'windows'] });
    expect(res.body).not.toHaveProperty('apiKeyHash');
  });

  it('sin sesiones, los filtros vienen vacíos', async () => {
    const res = await get(`/juegos/${faro.juegoId}`);
    expect(res.body.filtros).toEqual({ buildVersions: [], plataformas: [] });
    expect(res.body.logoUrl).toBeNull();
  });

  it('403 SIN_PERMISO si el juego no está en juegosPermitidos', async () => {
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { juegosPermitidos: [faro.juegoId] });
    const res = await get(`/juegos/${casa.juegoId}`);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('404 JUEGO_NO_ENCONTRADO si está permitido pero ya no existe; 400 si no es UUID', async () => {
    const fantasma = randomUUID();
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { $push: { juegosPermitidos: fantasma } });
    expect((await get(`/juegos/${fantasma}`)).body.error.codigo).toBe('JUEGO_NO_ENCONTRADO');
    expect((await get('/juegos/la-casa-del-bosque')).status).toBe(400);
  });
});

describe('DELETE /api/v1/jugadores/:juegoId/:playerId', () => {
  const borrar = (juegoId: string, playerId: string) =>
    request(app).delete(`/api/v1/jugadores/${juegoId}/${playerId}`).set('Authorization', `Bearer ${token}`);

  it('borra jugador, sesiones, eventos y logros de ese jugador, y nada más', async () => {
    const ctx = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    await enviar(casa, loteEjemplo(ctx));
    await abrirSesion(app, casa, ctx.playerId); // segunda sesión del mismo jugador
    const otro = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    await enviar(casa, loteEjemplo(otro));

    const res = await borrar(casa.juegoId, ctx.playerId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eliminados: { jugador: 1, sesiones: 2, eventos: 11, logros: 2 } });

    const filtro = { playerId: ctx.playerId };
    expect(await JugadorModelo.countDocuments(filtro)).toBe(0);
    expect(await SesionModelo.countDocuments(filtro)).toBe(0);
    expect(await EventoModelo.countDocuments(filtro)).toBe(0);
    expect(await LogroObtenidoModelo.countDocuments(filtro)).toBe(0);
    expect(await EventoModelo.countDocuments({ playerId: otro.playerId })).toBe(11);
  });

  it('404 JUGADOR_NO_ENCONTRADO si no existe; 403 sin permiso; 400 con IDs inválidos', async () => {
    expect((await borrar(casa.juegoId, randomUUID())).body.error.codigo).toBe('JUGADOR_NO_ENCONTRADO');
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { juegosPermitidos: [faro.juegoId] });
    expect((await borrar(casa.juegoId, randomUUID())).status).toBe(403);
    expect((await borrar(casa.juegoId, 'x')).status).toBe(400);
  });

  it('exige token', async () => {
    expect((await request(app).delete(`/api/v1/jugadores/${casa.juegoId}/${randomUUID()}`)).status).toBe(401);
  });
});

describe('OpenAPI de la administración', () => {
  it('documenta las 5 rutas con BearerAuth (salvo login)', async () => {
    const { body } = await request(app).get('/api/v1/docs/openapi.json');
    expect(body.components.securitySchemes.BearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(body.paths['/auth/login'].post.security).toBeUndefined();
    expect(body.paths['/auth/yo'].get.security).toEqual([{ BearerAuth: [] }]);
    expect(body.paths['/juegos/{juegoId}'].get.responses['403']).toBeDefined();
    expect(body.paths['/jugadores/{juegoId}/{playerId}'].delete.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/RespuestaBorrado',
    });
  });
});

describe('filtro origen en GET /juegos y contieneDatosSeed (R-48)', () => {
  // Un jugador seed que completa el último nivel, insertado directo (como seed-datos).
  async function sembrarJugadorSeed(juegoId: string) {
    const playerId = randomUUID();
    const sessionId = randomUUID();
    const ahora = new Date();
    await JugadorModelo.create({ juegoId, playerId, consentimiento: true, primeraVez: ahora, ultimaVez: ahora, origen: 'seed' });
    await SesionModelo.create({ sessionId, juegoId, playerId, buildVersion: '1.0.1', plataforma: 'ios', creadaEn: ahora, origen: 'seed' });
    await EventoModelo.create({
      eventoId: randomUUID(), juegoId, playerId, sessionId, secuencia: 1, timestamp: ahora, buildVersion: '1.0.1', plataforma: 'ios',
      tipo: 'nivel_fin', data: { nivelId: 'habitacion_llamas', intento: 1, resultado: 'completado', duracionMs: 1 },
      versionEsquema: 1, recibidoEn: ahora, origen: 'seed',
    });
  }

  beforeEach(async () => {
    const real = { juegoId: casa.juegoId, ...(await abrirSesion(app, casa)) };
    await enviar(casa, loteEjemplo(real)); // jugador real que no termina
    await sembrarJugadorSeed(casa.juegoId);
  });

  const resumenCasa = async (consulta: string) => {
    const res = await get(`/juegos${consulta}`);
    expect(res.status).toBe(200);
    return { origen: res.body.origen as string, resumen: (res.body.datos as { slug: string; resumen: unknown }[]).find((j) => j.slug === 'la-casa-del-bosque')?.resumen };
  };

  it('por defecto (todos) cuenta datos reales y seed', async () => {
    expect(await resumenCasa('')).toEqual({ origen: 'todos', resumen: { jugadores: 2, sesiones: 2, tasaCompletado: 0.5 } });
  });

  it('origen=real cuenta solo la ingesta real', async () => {
    expect(await resumenCasa('?origen=real')).toEqual({ origen: 'real', resumen: { jugadores: 1, sesiones: 1, tasaCompletado: 0 } });
  });

  it('origen=seed cuenta solo los datos de prueba', async () => {
    expect(await resumenCasa('?origen=seed')).toEqual({ origen: 'seed', resumen: { jugadores: 1, sesiones: 1, tasaCompletado: 1 } });
  });

  it('un origen desconocido responde 400', async () => {
    const res = await get('/juegos?origen=importado');
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION_FALLIDA');
  });

  it('GET /juegos/:juegoId indica si el juego contiene datos seed', async () => {
    expect((await get(`/juegos/${casa.juegoId}`)).body.contieneDatosSeed).toBe(true);
    expect((await get(`/juegos/${faro.juegoId}`)).body.contieneDatosSeed).toBe(false);
  });
});
