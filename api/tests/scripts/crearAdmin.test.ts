import { AdminModelo, JuegoModelo } from '../../src/modelos';
import { crearAdmin } from '../../src/scripts/crearAdmin';
import { verificarPassword } from '../../src/seguridad/password';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { datosJuego } from '../modelos/fixtures';

usarBdPrueba();

const PASSWORD = 'contraseña-de-prueba-larga';

describe('crearAdmin', () => {
  it('crea el admin con la contraseña hasheada y acceso a todos los juegos existentes', async () => {
    const a = await JuegoModelo.create(datosJuego());
    const b = await JuegoModelo.create(datosJuego());

    const r = await crearAdmin({ email: ' Admin@Xolos.MX ', password: PASSWORD, nombre: 'Admin' });

    expect(r).toEqual({ creado: true, email: 'admin@xolos.mx', juegosPermitidos: expect.arrayContaining([a.juegoId, b.juegoId]) });
    const admin = await AdminModelo.findOne({ email: 'admin@xolos.mx' }).lean();
    expect(admin?.passwordHash).not.toContain(PASSWORD);
    await expect(verificarPassword(PASSWORD, admin!.passwordHash!)).resolves.toBe(true);
  });

  it('con --juegos limita el acceso a esos juegos', async () => {
    const a = await JuegoModelo.create(datosJuego());
    await JuegoModelo.create(datosJuego());
    const r = await crearAdmin({ email: 'a@x.mx', password: PASSWORD, nombre: 'A', juegos: [a.slug] });
    expect(r).toMatchObject({ creado: true, juegosPermitidos: [a.juegoId] });
  });

  it('falla si algún juego de --juegos no existe', async () => {
    await expect(crearAdmin({ email: 'a@x.mx', password: PASSWORD, nombre: 'A', juegos: ['fantasma'] })).rejects.toThrow(
      'No existen los juegos: fantasma.',
    );
  });

  it('no modifica nada si el admin ya existe', async () => {
    await crearAdmin({ email: 'a@x.mx', password: PASSWORD, nombre: 'Original' });
    const r = await crearAdmin({ email: 'A@X.MX', password: 'otra-contraseña-distinta', nombre: 'Cambiado' });
    expect(r).toEqual({ creado: false, email: 'a@x.mx' });
    const admin = await AdminModelo.findOne({ email: 'a@x.mx' }).lean();
    expect(admin?.nombre).toBe('Original');
    await expect(verificarPassword(PASSWORD, admin!.passwordHash!)).resolves.toBe(true);
  });

  it.each([
    [{ email: 'no-es-correo', password: PASSWORD, nombre: 'A' }, /ADMIN_EMAIL/],
    [{ email: 'a@x.mx', password: 'corta', nombre: 'A' }, /ADMIN_PASSWORD: la contraseña debe tener al menos 12/],
    [{ email: 'a@x.mx', password: PASSWORD, nombre: '  ' }, /ADMIN_NOMBRE/],
  ])('valida los datos de entrada (%#)', async (datos, mensaje) => {
    await expect(crearAdmin(datos)).rejects.toThrow(mensaje);
    expect(await AdminModelo.countDocuments()).toBe(0);
  });

  it('el mensaje de error de contraseña no incluye la contraseña', async () => {
    const error = await crearAdmin({ email: 'a@x.mx', password: 'secreto1', nombre: 'A' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('secreto1');
  });
});
