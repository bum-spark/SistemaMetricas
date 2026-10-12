import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JuegoModelo, JugadorModelo, SesionModelo } from '../../src/modelos';
import { revocarApiKey } from '../../src/scripts/apiKeys';
import { crearAppDePrueba } from '../helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { abrirSesion, prepararJuego, type JuegoPrueba } from './helpers';

usarBdPrueba();

const { app } = crearAppDePrueba();
let juego: JuegoPrueba;

beforeEach(async () => {
  juego = await prepararJuego();
});

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  juegoId: juego.juegoId,
  playerId: randomUUID(),
  buildVersion: '1.0.0',
  plataforma: 'windows',
  consentimiento: true,
  ...extra,
});

describe('autenticación por X-Api-Key', () => {
  it('sin header responde 401 API_KEY_INVALIDA', async () => {
    const res = await request(app).post('/api/v1/sesiones').send(cuerpo());
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ codigo: 'API_KEY_INVALIDA', mensaje: 'Falta el header X-Api-Key.' });
  });

  it('con una key inexistente responde 401', async () => {
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', 'ak_inventada').send(cuerpo());
    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('API_KEY_INVALIDA');
  });

  it('con una key revocada responde 401', async () => {
    await revocarApiKey('la-casa-del-bosque');
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', juego.apiKey).send(cuerpo());
    expect(res.status).toBe(401);
  });

  it('con el juego inactivo responde 401', async () => {
    await JuegoModelo.updateOne({ juegoId: juego.juegoId }, { activo: false });
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', juego.apiKey).send(cuerpo());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/sesiones', () => {
  it('con consentimiento crea jugador y sesión (origen real) y responde 201 con un sessionId UUID v4', async () => {
    const datos = cuerpo();
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', juego.apiKey).send(datos);

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const jugador = await JugadorModelo.findOne({ juegoId: juego.juegoId, playerId: datos.playerId }).lean();
    expect(jugador).toMatchObject({ consentimiento: true, origen: 'real', cuentaId: null });
    const sesion = await SesionModelo.findOne({ sessionId: res.body.sessionId }).lean();
    expect(sesion).toMatchObject({ juegoId: juego.juegoId, playerId: datos.playerId, plataforma: 'windows', origen: 'real', inicio: null, fin: null });
    // Sin eventos todavía: los dos relojes en null (R-34).
    expect(sesion?.ultimoEventoEn).toBeNull();
    expect(sesion?.ultimoRecibidoEn).toBeNull();
  });

  it('genera un sessionId nuevo en cada arranque y conserva primeraVez del jugador', async () => {
    const primera = await abrirSesion(app, juego);
    const antes = await JugadorModelo.findOne({ playerId: primera.playerId }).lean();
    const segunda = await abrirSesion(app, juego, primera.playerId);

    expect(segunda.sessionId).not.toBe(primera.sessionId);
    const despues = await JugadorModelo.findOne({ playerId: primera.playerId }).lean();
    expect(despues?.primeraVez).toEqual(antes?.primeraVez);
    expect(despues!.ultimaVez.getTime()).toBeGreaterThanOrEqual(antes!.ultimaVez.getTime());
    expect(await JugadorModelo.countDocuments()).toBe(1);
  });

  it('sin consentimiento y jugador nuevo: 200 con sessionId null y no guarda nada', async () => {
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', juego.apiKey).send(cuerpo({ consentimiento: false }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessionId: null, consentimiento: false });
    expect(await JugadorModelo.countDocuments()).toBe(0);
    expect(await SesionModelo.countDocuments()).toBe(0);
  });

  it('sin consentimiento y jugador existente: solo marca consentimiento false, sin sesión nueva', async () => {
    const { playerId } = await abrirSesion(app, juego);
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', juego.apiKey).send(cuerpo({ playerId, consentimiento: false }));
    expect(res.status).toBe(200);
    expect((await JugadorModelo.findOne({ playerId }).lean())?.consentimiento).toBe(false);
    expect(await SesionModelo.countDocuments()).toBe(1);
  });

  it('juegoId distinto al de la key responde 403 JUEGO_NO_COINCIDE', async () => {
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', juego.apiKey).send(cuerpo({ juegoId: randomUUID() }));
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('JUEGO_NO_COINCIDE');
  });

  it.each([
    ['falta consentimiento', { consentimiento: undefined }, /consentimiento/],
    ['plataforma desconocida', { plataforma: 'switch' }, /plataforma/],
    ['playerId que no es UUID v4', { playerId: '123' }, /playerId: debe ser un UUID v4/],
    ['campo desconocido (origen)', { origen: 'seed' }, /origen/],
  ])('responde 400 VALIDACION_FALLIDA si %s', async (_caso, extra, detalle) => {
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', juego.apiKey).send(cuerpo(extra));
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION_FALLIDA');
    expect((res.body.error.detalles as string[]).join(' ')).toMatch(detalle);
    expect(await SesionModelo.countDocuments()).toBe(0);
  });
});
