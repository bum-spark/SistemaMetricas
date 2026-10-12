import { createHash } from 'node:crypto';
import { JuegoModelo } from '../../src/modelos';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { catalogoMinimo, datosJuego, LLAVE_DUPLICADA } from './fixtures';

usarBdPrueba();

const hash = (texto: string) => createHash('sha256').update(texto).digest('hex');

describe('modelo Juego', () => {
  it('guarda un juego válido con valores por defecto', async () => {
    const juego = await JuegoModelo.create(datosJuego());
    expect(juego.activo).toBe(true);
    expect(juego.apiKeyHash).toBeNull();
    expect(juego.fechaCreacion).toBeInstanceOf(Date);
    expect(juego.catalogo.duracionEsperadaMs).toBe(600000);
  });

  it('no expone _id ni apiKeyHash al serializar', async () => {
    const juego = await JuegoModelo.create(datosJuego({ apiKeyHash: hash('ak_secreta') }));
    const json = juego.toJSON() as Record<string, unknown>;
    expect(json).not.toHaveProperty('_id');
    expect(json).not.toHaveProperty('apiKeyHash');
    expect(json).toHaveProperty('juegoId', juego.juegoId);
  });

  it('acepta un catálogo sin duracionEsperadaMs', async () => {
    const { duracionEsperadaMs: _omitida, ...catalogo } = catalogoMinimo();
    const juego = await JuegoModelo.create(datosJuego({ catalogo }));
    expect(juego.catalogo.duracionEsperadaMs).toBeUndefined();
  });

  it('rechaza un catálogo inconsistente con el mensaje de zod', async () => {
    const catalogo = catalogoMinimo();
    catalogo.coleccionables = [{ coleccionableId: 'gema_1', nivelId: 'no_existe', nombre: 'Gema' }];
    await expect(JuegoModelo.create(datosJuego({ catalogo }))).rejects.toThrow(
      /Catálogo inválido: coleccionables\.0\.nivelId: nivel inexistente: no_existe/,
    );
  });

  it('valida juegoId UUID v4 y slug', async () => {
    await expect(JuegoModelo.create(datosJuego({ juegoId: 'no-es-uuid' }))).rejects.toThrow(/juegoId debe ser un UUID v4/);
    await expect(JuegoModelo.create(datosJuego({ slug: 'Con Espacios' }))).rejects.toThrow(/slug/);
  });

  it('no permite slugs ni juegoId repetidos', async () => {
    const base = await JuegoModelo.create(datosJuego());
    await expect(JuegoModelo.create(datosJuego({ slug: base.slug }))).rejects.toMatchObject({ code: LLAVE_DUPLICADA });
    await expect(JuegoModelo.create(datosJuego({ juegoId: base.juegoId }))).rejects.toMatchObject({ code: LLAVE_DUPLICADA });
  });

  it('permite varios juegos con la key revocada (null) pero no dos con el mismo hash', async () => {
    await JuegoModelo.create(datosJuego());
    await JuegoModelo.create(datosJuego());
    await JuegoModelo.create(datosJuego({ apiKeyHash: hash('ak_uno') }));
    await expect(JuegoModelo.create(datosJuego({ apiKeyHash: hash('ak_uno') }))).rejects.toMatchObject({
      code: LLAVE_DUPLICADA,
    });
    expect(await JuegoModelo.countDocuments()).toBe(3);
  });
});
