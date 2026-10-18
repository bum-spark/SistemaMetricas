import request from 'supertest';
import { AdminModelo } from '../../src/modelos';
import { crearAdmin } from '../../src/scripts/crearAdmin';
import { cambiarEstadoAdmin } from '../../src/scripts/estadoAdmin';
import { crearAppDePrueba } from '../helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const PASSWORD = 'contraseña-del-admin-larga';
// Límite de login alto: este archivo provoca varios 401 a propósito.
const { app } = crearAppDePrueba({ RATE_LIMIT_LOGIN_IP: '1000' });
const login = (email: string) => request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
const yo = (token: string) => request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  await crearAdmin({ email: 'admin@xolos.mx', password: PASSWORD, nombre: 'Admin' });
  await crearAdmin({ email: 'otro@xolos.mx', password: PASSWORD, nombre: 'Otro' });
});

describe('desactivar-admin / reactivar-admin', () => {
  it('un admin desactivado no puede entrar y su token deja de servir al instante', async () => {
    const token = (await login('otro@xolos.mx')).body.token as string;
    expect((await yo(token)).status).toBe(200);

    const r = await cambiarEstadoAdmin(' OTRO@xolos.mx ', false);
    expect(r).toEqual({ email: 'otro@xolos.mx', cambiado: true, adminsActivos: 1 });

    expect((await yo(token)).status).toBe(401);
    const entrar = await login('otro@xolos.mx');
    expect(entrar.status).toBe(401);
    expect(entrar.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    // El otro admin no se tocó.
    expect((await login('admin@xolos.mx')).status).toBe(200);
  });

  it('reactivar conserva la contraseña y los juegos; repetir no cambia nada', async () => {
    const antes = (await AdminModelo.findOne({ email: 'otro@xolos.mx' }).lean())!;
    await cambiarEstadoAdmin('otro@xolos.mx', false);
    expect((await cambiarEstadoAdmin('otro@xolos.mx', false)).cambiado).toBe(false);

    expect((await cambiarEstadoAdmin('otro@xolos.mx', true)).cambiado).toBe(true);
    expect((await login('otro@xolos.mx')).status).toBe(200);
    const despues = (await AdminModelo.findOne({ email: 'otro@xolos.mx' }).lean())!;
    expect(despues.passwordHash).toBe(antes.passwordHash);
    expect(despues.juegosPermitidos).toEqual(antes.juegosPermitidos);
  });

  it('cuenta los admins activos que quedan (para avisar si no queda ninguno)', async () => {
    await cambiarEstadoAdmin('otro@xolos.mx', false);
    expect((await cambiarEstadoAdmin('admin@xolos.mx', false)).adminsActivos).toBe(0);
  });

  it('sirve para admins sin campo rol, pero no para invitados', async () => {
    await AdminModelo.collection.insertOne({ email: 'viejo@xolos.mx', passwordHash: 'x', nombre: 'Viejo', juegosPermitidos: [], activo: true });
    expect((await cambiarEstadoAdmin('viejo@xolos.mx', false)).cambiado).toBe(true);

    await AdminModelo.create({ email: 'inv@ejemplo.mx', rol: 'invitado', nombre: 'Inv' });
    await expect(cambiarEstadoAdmin('inv@ejemplo.mx', false)).rejects.toThrow(/invitado.*pantalla Invitados/);
    expect((await AdminModelo.findOne({ email: 'inv@ejemplo.mx' }).lean())?.activo).toBe(true);
  });

  it('valida el correo y que el admin exista', async () => {
    await expect(cambiarEstadoAdmin('no-es-correo', false)).rejects.toThrow(/no es un correo válido/);
    await expect(cambiarEstadoAdmin('nadie@xolos.mx', false)).rejects.toThrow(/No existe un admin/);
  });
});
