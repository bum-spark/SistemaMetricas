import { AdminModelo, JuegoModelo } from '../../src/modelos';
import { revocarApiKey, rotarApiKey } from '../../src/scripts/apiKeys';
import { crearJuego } from '../../src/scripts/crearJuego';
import { hashApiKey } from '../../src/seguridad/apiKey';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { uuid } from '../modelos/fixtures';

usarBdPrueba();

async function crearAdminDirecto(activo = true) {
  return AdminModelo.create({ email: `${uuid().slice(0, 8)}@x.mx`, passwordHash: 'x', nombre: 'A', activo });
}

describe('crearJuego', () => {
  it('crea La Casa del Bosque con su catálogo y guarda solo el hash de la key', async () => {
    const r = await crearJuego({ slug: 'la-casa-del-bosque' });

    expect(r.apiKey).toMatch(/^ak_/);
    const juego = await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean();
    expect(juego).toMatchObject({ juegoId: r.juegoId, nombre: 'La Casa del Bosque', versionActual: '1.0.0', activo: true });
    expect(juego?.apiKeyHash).toBe(hashApiKey(r.apiKey));
    expect(JSON.stringify(juego)).not.toContain(r.apiKey);
    expect(juego?.catalogo.niveles.map((n) => n.nivelId)).toEqual(['casa_abandonada', 'hospital_cuarto', 'habitacion_llamas']);
    expect(juego?.catalogo.duracionEsperadaMs).toBe(1200000);
    expect(juego?.logoUrl).toBe('/juegos/la-casa-del-bosque/logo.png');
  });

  it('acepta --version y da acceso solo a los admins activos', async () => {
    const activo = await crearAdminDirecto(true);
    const inactivo = await crearAdminDirecto(false);

    const r = await crearJuego({ slug: 'faro-nocturno-demo', versionActual: '0.9.0' });

    expect(r.adminsConAcceso).toBe(1);
    expect((await AdminModelo.findById(activo._id).lean())?.juegosPermitidos).toEqual([r.juegoId]);
    expect((await AdminModelo.findById(inactivo._id).lean())?.juegosPermitidos).toEqual([]);
    const faro = await JuegoModelo.findOne({ juegoId: r.juegoId }).lean();
    expect(faro?.versionActual).toBe('0.9.0');
    expect(faro?.logoUrl).toBeUndefined();
  });

  it('con --sin-acceso no modifica a los admins', async () => {
    await crearAdminDirecto();
    const r = await crearJuego({ slug: 'faro-nocturno-demo', darAccesoAAdmins: false });
    expect(r.adminsConAcceso).toBe(0);
  });

  it('no sobrescribe un juego existente', async () => {
    const primero = await crearJuego({ slug: 'la-casa-del-bosque' });
    await expect(crearJuego({ slug: 'la-casa-del-bosque' })).rejects.toThrow(/ya existe.*rotar-api-key/);
    expect((await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean())?.apiKeyHash).toBe(hashApiKey(primero.apiKey));
  });

  it('falla con la lista de catálogos disponibles si el slug no tiene catálogo', async () => {
    await expect(crearJuego({ slug: 'otro-juego' })).rejects.toThrow(
      'No hay catálogo para "otro-juego". Disponibles: la-casa-del-bosque, faro-nocturno-demo.',
    );
  });
});

describe('rotar y revocar la API key', () => {
  it('rotar reemplaza el hash: la key anterior deja de corresponder', async () => {
    const { apiKey: vieja } = await crearJuego({ slug: 'la-casa-del-bosque' });
    const { apiKey: nueva } = await rotarApiKey('la-casa-del-bosque');

    expect(nueva).not.toBe(vieja);
    const juego = await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean();
    expect(juego?.apiKeyHash).toBe(hashApiKey(nueva));
    expect(juego?.apiKeyHash).not.toBe(hashApiKey(vieja));
  });

  it('revocar deja el hash en null, conserva el juego y avisa si ya estaba revocada', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    await expect(revocarApiKey('la-casa-del-bosque')).resolves.toEqual({ slug: 'la-casa-del-bosque', yaEstabaRevocada: false });
    await expect(revocarApiKey('la-casa-del-bosque')).resolves.toEqual({ slug: 'la-casa-del-bosque', yaEstabaRevocada: true });
    expect((await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean())?.apiKeyHash).toBeNull();
  });

  it('rotar después de revocar vuelve a habilitar el juego', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    await revocarApiKey('la-casa-del-bosque');
    const { apiKey } = await rotarApiKey('la-casa-del-bosque');
    expect((await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean())?.apiKeyHash).toBe(hashApiKey(apiKey));
  });

  it('fallan con un mensaje claro si el juego no existe', async () => {
    await expect(rotarApiKey('no-existe')).rejects.toThrow('No existe un juego con slug "no-existe".');
    await expect(revocarApiKey('no-existe')).rejects.toThrow('No existe un juego con slug "no-existe".');
  });
});
