import request from 'supertest';
import { duracionesDeSesiones } from '../../src/estadisticas/duracionSesiones';
import { AdminModelo, EventoModelo, JuegoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../../src/modelos';
import { crearAdmin } from '../../src/scripts/crearAdmin';
import { crearJuego } from '../../src/scripts/crearJuego';
import { ejecutarSeed, referenciaPorDefecto } from '../../src/scripts/seedDatos';
import { crearAppDePrueba } from '../helpers';
import { abrirSesion, loteEjemplo } from '../ingesta/helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const OPCIONES = { semilla: 42, referencia: new Date('2026-10-12T00:00:00.000Z'), jugadores: 40 };

describe('seed-datos contra la base', () => {
  it('crea los dos juegos si no existen (sin API key) e inserta todo con origen seed', async () => {
    const resumen = await ejecutarSeed(OPCIONES);

    expect(resumen.map((r) => [r.slug, r.juegoCreado])).toEqual([
      ['la-casa-del-bosque', true],
      ['faro-nocturno-demo', true],
    ]);
    expect(resumen[1]!.insertados.jugadores).toBe(20); // Faro recibe la mitad
    for (const r of resumen) {
      const juego = (await JuegoModelo.findOne({ slug: r.slug }).lean())!;
      expect(juego.apiKeyHash).toBeNull();
      const filtro = { juegoId: juego.juegoId };
      expect(await JugadorModelo.countDocuments({ ...filtro, origen: 'seed' })).toBe(r.insertados.jugadores);
      expect(await SesionModelo.countDocuments({ ...filtro, origen: 'seed' })).toBe(r.insertados.sesiones);
      expect(await EventoModelo.countDocuments({ ...filtro, origen: 'seed' })).toBe(r.insertados.eventos);
      expect(await LogroObtenidoModelo.countDocuments(filtro)).toBe(r.insertados.logros);
      expect(await EventoModelo.countDocuments({ ...filtro, origen: { $ne: 'seed' } })).toBe(0);
      // Imágenes y límites provisionales en el catálogo (A-07).
      expect(juego.catalogo.niveles.every((n) => n.imagenUrl?.startsWith(`/niveles/${r.slug}/`) && n.limites)).toBe(true);
    }
    const logos = await JuegoModelo.find({}, { slug: 1, logoUrl: 1, _id: 0 }).sort({ slug: 1 }).lean();
    expect(logos).toEqual([{ slug: 'faro-nocturno-demo' }, { slug: 'la-casa-del-bosque', logoUrl: '/juegos/la-casa-del-bosque/logo.png' }]);
  });

  it('es idempotente y determinista: correrlo dos veces deja exactamente los mismos datos', async () => {
    await ejecutarSeed(OPCIONES);
    const primera = (await EventoModelo.find({}, { eventoId: 1, _id: 0 }).lean()).map((e) => e.eventoId).sort();

    const segunda = await ejecutarSeed(OPCIONES);
    const ids = (await EventoModelo.find({}, { eventoId: 1, _id: 0 }).lean()).map((e) => e.eventoId).sort();

    expect(segunda[0]!.juegoCreado).toBe(false);
    expect(segunda[0]!.borrados.eventos).toBe(segunda[0]!.insertados.eventos);
    expect(ids).toEqual(primera);
  });

  it('no toca los datos reales ni la API key de un juego creado con crear-juego, y completa su logo e imágenes', async () => {
    const { juegoId, apiKey } = await crearJuego({ slug: 'la-casa-del-bosque' });
    // Simula un juego dado de alta antes de tener imágenes/límites provisionales.
    await JuegoModelo.updateOne({ juegoId }, { $unset: { logoUrl: '', 'catalogo.niveles.$[].imagenUrl': '', 'catalogo.niveles.$[].limites': '' } });
    const { app } = crearAppDePrueba();
    const real = { juegoId, ...(await abrirSesion(app, { juegoId, apiKey })) };
    await request(app).post('/api/v1/eventos').set('X-Api-Key', apiKey).send(loteEjemplo(real));

    await ejecutarSeed(OPCIONES);
    await ejecutarSeed(OPCIONES);

    expect(await EventoModelo.countDocuments({ juegoId, origen: 'real' })).toBe(11);
    const juego = (await JuegoModelo.findOne({ juegoId }).lean())!;
    expect(juego.apiKeyHash).not.toBeNull();
    expect(juego.catalogo.niveles.every((n) => n.imagenUrl && n.limites)).toBe(true);
    expect(juego.logoUrl).toBe('/juegos/la-casa-del-bosque/logo.png');
  });

  it('da acceso a Faro Nocturno (demo) a los admins activos cuando lo crea', async () => {
    await crearAdmin({ email: 'admin@xolos.mx', password: 'contraseña-larga-de-prueba', nombre: 'Admin' });
    await ejecutarSeed(OPCIONES);
    const faro = (await JuegoModelo.findOne({ slug: 'faro-nocturno-demo' }).lean())!;
    expect((await AdminModelo.findOne({ email: 'admin@xolos.mx' }).lean())?.juegosPermitidos).toContain(faro.juegoId);
  });

  it('los datos sirven para las métricas: duraciones de sesión y resumen con origen=seed', async () => {
    await crearAdmin({ email: 'admin@xolos.mx', password: 'contraseña-larga-de-prueba', nombre: 'Admin' });
    const [casa] = await ejecutarSeed(OPCIONES);
    const juego = (await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean())!;

    const duraciones = await duracionesDeSesiones(juego.juegoId, OPCIONES.referencia);
    expect(duraciones.length).toBeGreaterThan(casa!.insertados.sesiones * 0.8);
    expect(duraciones.some((d) => d.finInferido)).toBe(true);

    const { app } = crearAppDePrueba();
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'admin@xolos.mx', password: 'contraseña-larga-de-prueba' });
    const res = await request(app).get('/api/v1/juegos?origen=seed').set('Authorization', `Bearer ${login.body.token as string}`);
    const lcdb = (res.body.datos as { slug: string; resumen: { jugadores: number; tasaCompletado: number } }[]).find((j) => j.slug === 'la-casa-del-bosque');
    expect(lcdb?.resumen.jugadores).toBe(casa!.insertados.jugadores);
    expect(lcdb?.resumen.tasaCompletado).toBeGreaterThan(0);
  });

  it('la referencia por defecto es la medianoche UTC de hoy', () => {
    expect(referenciaPorDefecto(new Date('2026-10-12T17:45:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });
});
