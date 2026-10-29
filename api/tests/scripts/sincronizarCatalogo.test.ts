import { JuegoModelo } from '../../src/modelos';
import { actualizarJuego } from '../../src/scripts/actualizarJuego';
import { crearJuego } from '../../src/scripts/crearJuego';
import { resumenConteos, sincronizarCatalogo } from '../../src/scripts/sincronizarCatalogo';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const SLUG = 'la-casa-del-bosque';
const catalogo = async () => (await JuegoModelo.findOne({ slug: SLUG }).lean())!.catalogo;

// Juego como quedó en Atlas antes de fuego: creado con el catálogo actual y sin esa causa.
async function juegoSinFuego() {
  await crearJuego({ slug: SLUG });
  await JuegoModelo.updateOne({ slug: SLUG }, { $pull: { 'catalogo.causasMuerte': { causa: 'fuego' } } });
}

describe('sincronizar-catalogo', () => {
  it('agrega fuego al final de las causas y no cambia nada más', async () => {
    await juegoSinFuego();
    const antes = await catalogo();
    expect(antes.causasMuerte.map((c) => c.causa)).toEqual(['fantasma', 'lava', 'caida']);

    const r = await sincronizarCatalogo(SLUG);

    expect(r.agregados).toEqual({ causasMuerte: ['fuego (Fuego)'], niveles: [], logros: [], coleccionables: [], tiposEvento: [] });
    expect(r.total).toBe(1);
    expect(r.escrito).toBe(true);
    expect(r.avisos).toEqual([]);
    expect(resumenConteos(r)).toBe('1 causa, 0 niveles, 0 logros, 0 coleccionables, 0 tipos de evento');
    const despues = await catalogo();
    expect(despues.causasMuerte).toEqual([...antes.causasMuerte, { causa: 'fuego', nombre: 'Fuego' }]);
    const { causasMuerte: _a, ...restoAntes } = antes;
    const { causasMuerte: _d, ...restoDespues } = despues;
    expect(restoDespues).toEqual(restoAntes);
  });

  it('NUNCA toca imagenUrl ni limites de un nivel que ya existe, aunque difieran de la constante', async () => {
    await juegoSinFuego();
    // Captura real puesta con actualizar-juego --nivel (distinta de la provisional de la constante).
    await actualizarJuego(SLUG, {
      nivel: { nivelId: 'casa_abandonada', imagenUrl: '/niveles/la-casa-del-bosque/casa_abandonada.webp', limites: { minX: -2, maxX: 118, minY: 0, maxY: 30 } },
    });
    // Otro nivel sin imagen ni límites en la base (la constante sí los trae).
    await JuegoModelo.updateOne(
      { slug: SLUG },
      { $unset: { 'catalogo.niveles.$[n].imagenUrl': '', 'catalogo.niveles.$[n].limites': '' } },
      { arrayFilters: [{ 'n.nivelId': 'hospital_cuarto' }] },
    );
    const nivelesAntes = (await catalogo()).niveles;

    const r = await sincronizarCatalogo(SLUG);

    expect(r.agregados.causasMuerte).toEqual(['fuego (Fuego)']);
    expect((await catalogo()).niveles).toEqual(nivelesAntes);
    const casa = (await catalogo()).niveles.find((n) => n.nivelId === 'casa_abandonada')!;
    expect(casa.imagenUrl).toBe('/niveles/la-casa-del-bosque/casa_abandonada.webp');
    expect(casa.limites).toMatchObject({ minX: -2, maxX: 118, minY: 0, maxY: 30 });
    const hospital = (await catalogo()).niveles.find((n) => n.nivelId === 'hospital_cuarto')!;
    expect(hospital.imagenUrl).toBeUndefined();
    expect(hospital.limites).toBeUndefined();
    // Se avisa cada diferencia, aclarando que se conserva la de la base.
    const deNiveles = r.avisos.filter((a) => a.startsWith('niveles:'));
    expect(deNiveles).toHaveLength(4);
    expect(deNiveles.every((a) => a.includes('nunca se tocan'))).toBe(true);
    expect(deNiveles.some((a) => a.includes('casa_abandonada.imagenUrl'))).toBe(true);
    expect(deNiveles.some((a) => a.includes('hospital_cuarto.limites'))).toBe(true);
  });

  it('un valor distinto se avisa y se conserva; lo que no está en la constante no se quita', async () => {
    await juegoSinFuego();
    await JuegoModelo.updateOne({ slug: SLUG }, { $set: { 'catalogo.causasMuerte.$[c].nombre': 'Caer' } }, { arrayFilters: [{ 'c.causa': 'caida' }] });
    await JuegoModelo.updateOne({ slug: SLUG }, { $push: { 'catalogo.causasMuerte': { causa: 'pinchos', nombre: 'Pinchos' } } });

    const r = await sincronizarCatalogo(SLUG);

    expect((await catalogo()).causasMuerte.map((c) => `${c.causa}:${c.nombre}`)).toEqual([
      'fantasma:Fantasma',
      'lava:Lava',
      'caida:Caer',
      'pinchos:Pinchos',
      'fuego:Fuego',
    ]);
    expect(r.avisos).toEqual(
      expect.arrayContaining([expect.stringMatching(/causasMuerte: caida\.nombre difiere.*no se toca/), expect.stringMatching(/pinchos está en la base y no en la constante; no se quita/)]),
    );
  });

  it('dos veces seguidas: la segunda no tiene nada que agregar y no escribe', async () => {
    await juegoSinFuego();
    await sincronizarCatalogo(SLUG);
    const antes = await catalogo();
    const r = await sincronizarCatalogo(SLUG);
    expect(r.total).toBe(0);
    expect(r.escrito).toBe(false);
    expect(resumenConteos(r)).toBe('0 causas, 0 niveles, 0 logros, 0 coleccionables, 0 tipos de evento');
    expect(await catalogo()).toEqual(antes);
  });

  it('--simular muestra lo que agregaría y no escribe', async () => {
    await juegoSinFuego();
    const antes = await catalogo();
    const r = await sincronizarCatalogo(SLUG, { simular: true });
    expect(r.agregados.causasMuerte).toEqual(['fuego (Fuego)']);
    expect(r.escrito).toBe(false);
    expect(await catalogo()).toEqual(antes);
  });

  it('agrega niveles, logros, coleccionables, tipos de evento y duración que falten', async () => {
    await crearJuego({ slug: SLUG });
    await JuegoModelo.updateOne(
      { slug: SLUG },
      {
        $pull: {
          'catalogo.niveles': { nivelId: 'habitacion_llamas' },
          'catalogo.logros': { nivelId: 'habitacion_llamas' },
          'catalogo.coleccionables': { nivelId: 'habitacion_llamas' },
          'catalogo.tiposEvento': 'rendimiento',
        },
        $unset: { 'catalogo.duracionEsperadaMs': '' },
      },
    );

    const r = await sincronizarCatalogo(SLUG);

    expect(r.agregados.niveles).toEqual(['habitacion_llamas (Habitación en llamas)']);
    expect(r.agregados.logros).toHaveLength(2);
    expect(r.agregados.coleccionables).toHaveLength(4);
    expect(r.agregados.tiposEvento).toEqual(['rendimiento']);
    expect(r.duracionAgregada).toBe(1200000);
    const c = await catalogo();
    expect(c.niveles.at(-1)?.nivelId).toBe('habitacion_llamas');
    expect(c.duracionEsperadaMs).toBe(1200000);
  });

  it('si el resultado fuera inválido (orden de nivel repetido) no escribe nada', async () => {
    await crearJuego({ slug: SLUG });
    await JuegoModelo.updateOne(
      { slug: SLUG },
      {
        $pull: {
          'catalogo.niveles': { nivelId: 'habitacion_llamas' },
          'catalogo.logros': { nivelId: 'habitacion_llamas' },
          'catalogo.coleccionables': { nivelId: 'habitacion_llamas' },
          'catalogo.causasMuerte': { causa: 'fuego' },
        },
      },
    );
    await JuegoModelo.updateOne({ slug: SLUG }, { $set: { 'catalogo.niveles.$[n].orden': 3 } }, { arrayFilters: [{ 'n.nivelId': 'hospital_cuarto' }] });
    const antes = await catalogo();

    await expect(sincronizarCatalogo(SLUG)).rejects.toThrow(/quedaría inválido; no se escribió nada.*niveles/);
    expect(await catalogo()).toEqual(antes);
  });

  it('valida el slug y que el juego exista en la base', async () => {
    await expect(sincronizarCatalogo('no-existe')).rejects.toThrow(/No hay catálogo constante.*la-casa-del-bosque/);
    await expect(sincronizarCatalogo(SLUG)).rejects.toThrow(/No existe un juego.*crear-juego/);
  });

  it('un juego recién creado no tiene nada que agregar', async () => {
    await crearJuego({ slug: 'faro-nocturno-demo' });
    const r = await sincronizarCatalogo('faro-nocturno-demo');
    expect(r.total).toBe(0);
    expect(r.avisos).toEqual([]);
  });
});
