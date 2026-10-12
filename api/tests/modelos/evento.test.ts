import { EventoModelo } from '../../src/modelos';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { datosEvento, LLAVE_DUPLICADA, uuid } from './fixtures';

usarBdPrueba();

describe('modelo Evento', () => {
  it('guarda un evento válido y conserva data vacío', async () => {
    const evento = await EventoModelo.create(datosEvento());
    const leido = await EventoModelo.findOne({ eventoId: evento.eventoId }).lean();
    expect(leido?.data).toEqual({});
    expect(leido?.secuencia).toBe(1);
  });

  it('rechaza un eventoId repetido dentro del mismo juego', async () => {
    const juegoId = uuid();
    const eventoId = uuid();
    await EventoModelo.create(datosEvento({ juegoId, eventoId }));
    await expect(EventoModelo.create(datosEvento({ juegoId, eventoId, secuencia: 2 }))).rejects.toMatchObject({
      code: LLAVE_DUPLICADA,
    });
  });

  it('permite el mismo eventoId en juegos distintos', async () => {
    const eventoId = uuid();
    await EventoModelo.create(datosEvento({ eventoId }));
    await expect(EventoModelo.create(datosEvento({ eventoId }))).resolves.toBeDefined();
  });

  it('no exige que la secuencia sea única (los duplicados se detectan solo por eventoId)', async () => {
    const sessionId = uuid();
    const juegoId = uuid();
    await EventoModelo.create(datosEvento({ juegoId, sessionId, secuencia: 5 }));
    await expect(EventoModelo.create(datosEvento({ juegoId, sessionId, secuencia: 5 }))).resolves.toBeDefined();
  });

  it.each([
    ['secuencia menor a 1', { secuencia: 0 }, /secuencia/],
    ['tipo desconocido', { tipo: 'palanca_activada' }, /tipo/],
    ['plataforma desconocida', { plataforma: 'ps5' }, /plataforma/],
    ['versionEsquema desconocida', { versionEsquema: 2 }, /versionEsquema/],
    ['playerId que no es UUID v4', { playerId: '123' }, /playerId debe ser un UUID v4/],
  ])('rechaza %s', async (_caso, extra, mensaje) => {
    await expect(EventoModelo.create(datosEvento(extra))).rejects.toThrow(mensaje);
  });
});
