import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { EventoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../../src/modelos';
import { crearAppDePrueba } from '../helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { abrirSesion, evento, loteEjemplo, prepararJuego, type Contexto, type JuegoPrueba } from './helpers';

usarBdPrueba();

const { app } = crearAppDePrueba();
let juego: JuegoPrueba;
let ctx: Contexto;

beforeEach(async () => {
  juego = await prepararJuego();
  const sesion = await abrirSesion(app, juego);
  ctx = { juegoId: juego.juegoId, ...sesion };
});

const enviar = (cuerpo: unknown) => request(app).post('/api/v1/eventos').set('X-Api-Key', juego.apiKey).send(cuerpo as object);

describe('POST /api/v1/eventos: lote válido', () => {
  it('acepta la partida de ejemplo completa y la guarda con recibidoEn y origen real', async () => {
    const lote = loteEjemplo(ctx);
    const res = await enviar(lote);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ aceptados: 11, rechazados: [] });
    const guardados = await EventoModelo.find({ sessionId: ctx.sessionId }).sort({ secuencia: 1 }).lean();
    expect(guardados.map((e) => e.tipo)).toEqual(lote.map((e) => e.tipo));
    expect(guardados.every((e) => e.origen === 'real' && e.recibidoEn instanceof Date)).toBe(true);
    expect(guardados[4]?.data).toEqual({ nivelId: 'casa_abandonada', intento: 1, causa: 'fantasma', x: 12.5, y: -3.2 });
  });

  it('actualiza la sesión: inicio, fin y ultimoEventoEn con el reloj del cliente; ultimoRecibidoEn con el del servidor', async () => {
    const lote = loteEjemplo(ctx);
    const antes = Date.now();
    await enviar(lote);
    const sesion = await SesionModelo.findOne({ sessionId: ctx.sessionId }).lean();
    expect(sesion?.inicio?.toISOString()).toBe(lote[0]!.timestamp);
    expect(sesion?.fin?.toISOString()).toBe(lote[10]!.timestamp);
    expect(sesion?.ultimoEventoEn?.toISOString()).toBe(lote[10]!.timestamp);
    expect(sesion!.ultimoRecibidoEn!.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('registra los logros (una vez por jugador)', async () => {
    await enviar(loteEjemplo(ctx));
    const logros = await LogroObtenidoModelo.find({ playerId: ctx.playerId }).lean();
    expect(logros.map((l) => l.logroId).sort()).toEqual(['casa_abandonada_completada', 'tutorial_superado']);

    // El mismo logro en otra sesión no suma otro registro.
    const otra = await abrirSesion(app, juego, ctx.playerId);
    const res = await enviar(evento({ ...ctx, sessionId: otra.sessionId }, 1, 'logro', { logroId: 'tutorial_superado' }));
    expect(res.body).toEqual({ aceptados: 1, rechazados: [] });
    expect(await LogroObtenidoModelo.countDocuments({ playerId: ctx.playerId })).toBe(2);
  });

  it('acepta un solo evento enviado como objeto', async () => {
    const res = await enviar(evento(ctx, 1, 'sesion_inicio'));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ aceptados: 1, rechazados: [] });
  });

  it('ultimoEventoEn no retrocede si llega un lote con timestamps más viejos', async () => {
    await enviar(evento(ctx, 50, 'pausa', { duracionMs: 1000 }));
    const antes = (await SesionModelo.findOne({ sessionId: ctx.sessionId }).lean())!.ultimoEventoEn;
    await enviar(evento(ctx, 2, 'pausa', { duracionMs: 1000 }));
    expect((await SesionModelo.findOne({ sessionId: ctx.sessionId }).lean())!.ultimoEventoEn).toEqual(antes);
  });
});

describe('duplicados por eventoId', () => {
  it('reenviar el mismo lote cuenta todo como aceptado y no guarda nada nuevo', async () => {
    const lote = loteEjemplo(ctx);
    await enviar(lote);
    const res = await enviar(lote);
    expect(res.body).toEqual({ aceptados: 11, rechazados: [] });
    expect(await EventoModelo.countDocuments()).toBe(11);
    expect(await LogroObtenidoModelo.countDocuments()).toBe(2);
  });

  it('un eventoId repetido dentro del mismo lote se guarda una sola vez', async () => {
    const e = evento(ctx, 1, 'sesion_inicio');
    const res = await enviar([e, e]);
    expect(res.body).toEqual({ aceptados: 2, rechazados: [] });
    expect(await EventoModelo.countDocuments()).toBe(1);
  });
});

describe('aceptación parcial', () => {
  it('guarda los válidos y reporta el inválido con su índice (ejemplo de §11)', async () => {
    const lote = loteEjemplo(ctx);
    lote[4] = evento(ctx, 5, 'muerte', { nivelId: 'casa_abandonada', intento: 1, causa: 'agua', x: 1, y: 2 });
    const res = await enviar(lote);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      aceptados: 10,
      rechazados: [{ indice: 4, codigo: 'VALIDACION_FALLIDA', mensaje: "data.causa 'agua' no está en el catálogo del juego." }],
    });
    expect(await EventoModelo.countDocuments()).toBe(10);
  });

  it('responde 201 con aceptados 0 si todos son rechazados, ordenados por índice', async () => {
    const res = await enviar([evento(ctx, 1, 'palanca_activada'), evento(ctx, 2, 'logro', { logroId: 'no_existe' })]);
    expect(res.status).toBe(201);
    expect(res.body.aceptados).toBe(0);
    expect((res.body.rechazados as { indice: number; codigo: string }[]).map((r) => [r.indice, r.codigo])).toEqual([
      [0, 'TIPO_NO_REGISTRADO'],
      [1, 'VALIDACION_FALLIDA'],
    ]);
    expect(await EventoModelo.countDocuments()).toBe(0);
  });
});

describe('rechazos por evento', () => {
  const casos: [string, () => Record<string, unknown>, string, RegExp][] = [
    ['tipo que la API no conoce', () => evento(ctx, 1, 'palanca_activada'), 'TIPO_NO_REGISTRADO', /palanca_activada/],
    ['juegoId de otro juego', () => evento({ ...ctx, juegoId: randomUUID() }, 1, 'sesion_inicio'), 'JUEGO_NO_COINCIDE', /juegoId/],
    ['sessionId inexistente', () => evento({ ...ctx, sessionId: randomUUID() }, 1, 'sesion_inicio'), 'SESION_NO_ENCONTRADA', /sessionId/],
    ['el cliente manda origen', () => evento(ctx, 1, 'sesion_inicio', {}, { origen: 'seed' }), 'VALIDACION_FALLIDA', /origen/],
    ['el cliente manda recibidoEn', () => evento(ctx, 1, 'sesion_inicio', {}, { recibidoEn: new Date().toISOString() }), 'VALIDACION_FALLIDA', /recibidoEn/],
    ['falta secuencia', () => evento(ctx, 1, 'sesion_inicio', {}, { secuencia: undefined }), 'VALIDACION_FALLIDA', /secuencia/],
    ['secuencia 0', () => evento(ctx, 0, 'sesion_inicio'), 'VALIDACION_FALLIDA', /secuencia/],
    ['timestamp con desfase en vez de Z', () => evento(ctx, 1, 'sesion_inicio', {}, { timestamp: '2026-10-12T18:00:00+02:00' }), 'VALIDACION_FALLIDA', /UTC/],
    ['timestamp a más de 24 h en el futuro', () => evento(ctx, 1, 'sesion_inicio', {}, { timestamp: new Date(Date.now() + 25 * 3600e3).toISOString() }), 'VALIDACION_FALLIDA', /24 h/],
    ['timestamp de hace más de 7 días', () => evento(ctx, 1, 'sesion_inicio', {}, { timestamp: new Date(Date.now() - 8 * 86400e3).toISOString() }), 'VALIDACION_FALLIDA', /7 días/],
    ['versionEsquema 2', () => evento(ctx, 1, 'sesion_inicio', {}, { versionEsquema: 2 }), 'VALIDACION_FALLIDA', /versionEsquema/],
    ['campo desconocido en data', () => evento(ctx, 1, 'sesion_inicio', { nombre: 'Ana' }), 'VALIDACION_FALLIDA', /nombre/],
    ['falta un campo de data', () => evento(ctx, 1, 'nivel_fin', { nivelId: 'casa_abandonada', intento: 1, duracionMs: 5 }), 'VALIDACION_FALLIDA', /data\.resultado/],
    ['nivel fuera del catálogo', () => evento(ctx, 1, 'nivel_inicio', { nivelId: 'sotano', intento: 1 }), 'VALIDACION_FALLIDA', /data\.nivelId 'sotano'/],
    ['coleccionable de otro nivel', () => evento(ctx, 1, 'coleccionable_encontrado', { coleccionableId: 'petalo_1', nivelId: 'habitacion_llamas' }), 'VALIDACION_FALLIDA', /pertenece al nivel 'hospital_cuarto'/],
    ['logro fuera del catálogo (suelo_descubierto sigue abierto)', () => evento(ctx, 1, 'logro', { logroId: 'suelo_descubierto' }), 'VALIDACION_FALLIDA', /suelo_descubierto/],
  ];

  it.each(casos)('rechaza %s', async (_caso, crear, codigo, mensaje) => {
    const res = await enviar([crear()]);
    expect(res.status).toBe(201);
    expect(res.body.aceptados).toBe(0);
    expect(res.body.rechazados).toHaveLength(1);
    expect(res.body.rechazados[0]).toMatchObject({ indice: 0, codigo });
    expect(res.body.rechazados[0].mensaje).toMatch(mensaje);
  });

  it('rechaza eventos con la sesión de otro jugador', async () => {
    const otro = await abrirSesion(app, juego);
    const res = await enviar(evento({ ...ctx, sessionId: otro.sessionId }, 1, 'sesion_inicio'));
    expect(res.body.rechazados[0].codigo).toBe('SESION_NO_ENCONTRADA');
  });

  it('rechaza con SIN_CONSENTIMIENTO los eventos de un jugador que retiró el consentimiento', async () => {
    await JugadorModelo.updateOne({ playerId: ctx.playerId }, { consentimiento: false });
    const res = await enviar(evento(ctx, 1, 'sesion_inicio'));
    expect(res.body.rechazados[0]).toMatchObject({ codigo: 'SIN_CONSENTIMIENTO' });
    expect(await EventoModelo.countDocuments()).toBe(0);
  });
});

describe('errores de toda la petición', () => {
  it('lote vacío: 400 VALIDACION_FALLIDA', async () => {
    const res = await enviar([]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ codigo: 'VALIDACION_FALLIDA', mensaje: 'El lote está vacío.' });
  });

  it('más de 100 eventos: 400 LOTE_DEMASIADO_GRANDE', async () => {
    const lote = Array.from({ length: 101 }, (_, i) => evento(ctx, i + 1, 'pausa', { duracionMs: 1 }));
    const res = await enviar(lote);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('LOTE_DEMASIADO_GRANDE');
    expect(await EventoModelo.countDocuments()).toBe(0);
  });

  it('exactamente 100 eventos sí se aceptan', async () => {
    const lote = Array.from({ length: 100 }, (_, i) => evento(ctx, i + 1, 'pausa', { duracionMs: 1 }));
    const res = await enviar(lote);
    expect(res.body).toEqual({ aceptados: 100, rechazados: [] });
  });

  it('body mayor a 100 KB: 413 PAYLOAD_DEMASIADO_GRANDE', async () => {
    const res = await request(app)
      .post('/api/v1/eventos')
      .set('X-Api-Key', juego.apiKey)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ relleno: 'x'.repeat(101 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.codigo).toBe('PAYLOAD_DEMASIADO_GRANDE');
  });
});
