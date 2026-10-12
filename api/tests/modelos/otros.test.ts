import { AdminModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../../src/modelos';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { datosSesion, LLAVE_DUPLICADA, uuid } from './fixtures';

usarBdPrueba();

describe('modelo Jugador', () => {
  const datos = () => ({
    juegoId: uuid(),
    playerId: uuid(),
    consentimiento: true,
    primeraVez: new Date(),
    ultimaVez: new Date(),
  });

  it('deja cuentaId en null (reservado para el foro)', async () => {
    const jugador = await JugadorModelo.create(datos());
    expect(jugador.cuentaId).toBeNull();
  });

  it('identifica al jugador por juegoId + playerId', async () => {
    const base = datos();
    await JugadorModelo.create(base);
    await expect(JugadorModelo.create({ ...datos(), playerId: base.playerId })).resolves.toBeDefined();
    await expect(JugadorModelo.create({ ...base })).rejects.toMatchObject({ code: LLAVE_DUPLICADA });
  });
});

describe('modelo Sesion', () => {
  it('empieza sin inicio ni fin', async () => {
    const sesion = await SesionModelo.create(datosSesion());
    expect(sesion.inicio).toBeNull();
    expect(sesion.fin).toBeNull();
  });

  it('no permite sessionId repetido', async () => {
    const base = datosSesion();
    await SesionModelo.create(base);
    await expect(SesionModelo.create({ ...datosSesion(), sessionId: base.sessionId })).rejects.toMatchObject({
      code: LLAVE_DUPLICADA,
    });
  });

  it('rechaza una plataforma fuera del catálogo de plataformas', async () => {
    await expect(SesionModelo.create(datosSesion({ plataforma: 'switch' }))).rejects.toThrow(/plataforma/);
  });
});

describe('modelo LogroObtenido (colección logros)', () => {
  it('cuenta cada logro una sola vez por jugador', async () => {
    const base = { juegoId: uuid(), playerId: uuid(), logroId: 'la_verdad', sessionId: uuid(), obtenidoEn: new Date() };
    await LogroObtenidoModelo.create(base);
    await expect(LogroObtenidoModelo.create({ ...base, sessionId: uuid() })).rejects.toMatchObject({
      code: LLAVE_DUPLICADA,
    });
    await expect(LogroObtenidoModelo.create({ ...base, playerId: uuid() })).resolves.toBeDefined();
  });
});

describe('modelo Admin', () => {
  const datos = (email = 'Admin@Xolos.MX') => ({
    email,
    passwordHash: '$2b$10$hashdeprueba',
    nombre: 'Admin',
    juegosPermitidos: [uuid()],
  });

  it('guarda el email en minúsculas y no expone passwordHash ni _id', async () => {
    const admin = await AdminModelo.create(datos());
    expect(admin.email).toBe('admin@xolos.mx');
    const json = admin.toJSON() as Record<string, unknown>;
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('_id');
    expect(admin.ultimoLogin).toBeNull();
  });

  it('no permite el mismo email aunque cambien mayúsculas', async () => {
    await AdminModelo.create(datos('admin@xolos.mx'));
    await expect(AdminModelo.create(datos('ADMIN@xolos.mx'))).rejects.toMatchObject({ code: LLAVE_DUPLICADA });
  });

  it('exige que juegosPermitidos contenga UUID v4', async () => {
    await expect(AdminModelo.create({ ...datos(), juegosPermitidos: ['la-casa'] })).rejects.toThrow(/UUID v4/);
  });
});
