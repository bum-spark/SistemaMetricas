import { EventoModelo, JuegoModelo, LogroObtenidoModelo } from '../../src/modelos';
import { crearJuego } from '../../src/scripts/crearJuego';
import { quitarLogroDelCatalogo } from '../../src/scripts/quitarDelCatalogo';
import { sincronizarCatalogo } from '../../src/scripts/sincronizarCatalogo';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { datosEvento, uuid } from '../modelos/fixtures';

usarBdPrueba();

const SLUG = 'la-casa-del-bosque';
const catalogo = async () => (await JuegoModelo.findOne({ slug: SLUG }).lean())!.catalogo;
const TUTORIAL = { logroId: 'tutorial_superado', nombre: 'Tutorial superado', descripcion: 'Completa el tutorial de controles.', nivelId: 'casa_abandonada' };

// Juego como está en Atlas: creado antes de S-71, todavía con tutorial_superado, y con 2 jugadores
// que lo obtuvieron (2 eventos "logro" + 2 logros obtenidos).
async function juegoConTutorialSuperado() {
  const { juegoId } = await crearJuego({ slug: SLUG });
  await JuegoModelo.updateOne({ slug: SLUG }, { $push: { 'catalogo.logros': { $each: [TUTORIAL], $position: 0 } } });
  for (let i = 0; i < 2; i++) {
    const playerId = uuid();
    const sessionId = uuid();
    await EventoModelo.create(datosEvento({ juegoId, playerId, sessionId, tipo: 'logro', data: { logroId: 'tutorial_superado' } }));
    await LogroObtenidoModelo.create({ juegoId, playerId, sessionId, logroId: 'tutorial_superado', obtenidoEn: new Date() });
  }
  // Otro logro, para comprobar que no se cuenta ni se toca.
  await LogroObtenidoModelo.create({ juegoId, playerId: uuid(), sessionId: uuid(), logroId: 'casa_abandonada_completada', obtenidoEn: new Date() });
  return juegoId;
}

describe('quitar-del-catalogo --logro', () => {
  it('quita solo ese logro, informa jugadores y eventos afectados y no borra datos', async () => {
    await juegoConTutorialSuperado();
    const antes = await catalogo();

    const r = await quitarLogroDelCatalogo(SLUG, 'tutorial_superado');

    expect(r).toMatchObject({
      logroId: 'tutorial_superado',
      nombre: 'Tutorial superado',
      antes: ['tutorial_superado', 'casa_abandonada_completada', 'hospital_cuarto_completado', 'habitacion_llamas_completada', 'la_verdad'],
      despues: ['casa_abandonada_completada', 'hospital_cuarto_completado', 'habitacion_llamas_completada', 'la_verdad'],
      jugadoresConLogro: 2,
      eventosConLogro: 2,
      escrito: true,
    });
    const despues = await catalogo();
    expect(despues.logros.map((l) => l.logroId)).toEqual(r.despues);
    const { logros: _a, ...restoAntes } = antes;
    const { logros: _d, ...restoDespues } = despues;
    expect(restoDespues).toEqual(restoAntes);
    // Los datos se conservan.
    expect(await LogroObtenidoModelo.countDocuments({ logroId: 'tutorial_superado' })).toBe(2);
    expect(await EventoModelo.countDocuments({ 'data.logroId': 'tutorial_superado' })).toBe(2);
  });

  it('--simular informa lo mismo y no escribe', async () => {
    await juegoConTutorialSuperado();
    const antes = await catalogo();
    const r = await quitarLogroDelCatalogo(SLUG, 'tutorial_superado', { simular: true });
    expect(r).toMatchObject({ jugadoresConLogro: 2, eventosConLogro: 2, escrito: false });
    expect(await catalogo()).toEqual(antes);
  });

  it('se niega si el logro sigue en la constante del catálogo (sincronizar-catalogo lo volvería a agregar)', async () => {
    await juegoConTutorialSuperado();
    const antes = await catalogo();
    await expect(quitarLogroDelCatalogo(SLUG, 'la_verdad')).rejects.toThrow(/sigue en la constante.*sincronizar-catalogo lo volvería a agregar/);
    expect(await catalogo()).toEqual(antes);
  });

  it('después de quitarlo, sincronizar-catalogo no lo vuelve a agregar', async () => {
    await juegoConTutorialSuperado();
    await quitarLogroDelCatalogo(SLUG, 'tutorial_superado');
    const r = await sincronizarCatalogo(SLUG);
    expect(r.agregados.logros).toEqual([]);
    expect((await catalogo()).logros.map((l) => l.logroId)).not.toContain('tutorial_superado');
  });

  it('rechaza un logro que no está en la base y un juego que no existe', async () => {
    await expect(quitarLogroDelCatalogo(SLUG, 'tutorial_superado')).rejects.toThrow(/No existe un juego/);
    await crearJuego({ slug: SLUG });
    await expect(quitarLogroDelCatalogo(SLUG, 'tutorial_superado')).rejects.toThrow(/no está en el catálogo.*casa_abandonada_completada/);
  });
});
