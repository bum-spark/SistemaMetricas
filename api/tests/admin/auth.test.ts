import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AdminModelo } from '../../src/modelos';
import { crearAdmin } from '../../src/scripts/crearAdmin';
import { crearAppDePrueba } from '../helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const SECRETO = 'secreto-de-pruebas-con-mas-de-32-caracteres';
const PASSWORD = 'contraseña-del-admin-larga';
const { app } = crearAppDePrueba();

beforeEach(async () => {
  await crearAdmin({ email: 'admin@xolos.mx', password: PASSWORD, nombre: 'Admin Xolos' });
});

const login = (email: string, password: string) => request(app).post('/api/v1/auth/login').send({ email, password });

describe('POST /api/v1/auth/login', () => {
  it('con credenciales correctas devuelve un JWT de 8 h y los datos del admin', async () => {
    const antes = Date.now();
    const res = await login('Admin@Xolos.MX', PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.admin).toEqual({ email: 'admin@xolos.mx', nombre: 'Admin Xolos', rol: 'admin', juegosPermitidos: [] });
    const carga = jwt.verify(res.body.token as string, SECRETO, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    expect(carga.sub).toBe('admin@xolos.mx');
    expect(carga).not.toHaveProperty('juegosPermitidos');
    const expira = new Date(res.body.expiraEn as string).getTime();
    expect(expira - antes).toBeGreaterThan(8 * 3600e3 - 5000);
    expect(expira - antes).toBeLessThanOrEqual(8 * 3600e3 + 5000);
    expect((await AdminModelo.findOne({ email: 'admin@xolos.mx' }).lean())?.ultimoLogin).toBeInstanceOf(Date);
  });

  it.each([
    ['contraseña incorrecta', 'admin@xolos.mx', 'otra-contraseña-larga'],
    ['email inexistente', 'nadie@xolos.mx', PASSWORD],
  ])('con %s responde 401 con el mismo mensaje genérico', async (_caso, email, password) => {
    const res = await login(email, password);
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos.', detalles: [] });
  });

  it('un admin desactivado no puede iniciar sesión (mismo mensaje)', async () => {
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { activo: false });
    const res = await login('admin@xolos.mx', PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('valida el cuerpo (400)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@xolos.mx' });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION_FALLIDA');
  });

  it('bloquea con 429 después de 5 intentos fallidos por IP; los exitosos no cuentan', async () => {
    const { app: appLimitada } = crearAppDePrueba({ RATE_LIMIT_LOGIN_IP: '2' });
    const intento = (password: string) => request(appLimitada).post('/api/v1/auth/login').send({ email: 'admin@xolos.mx', password });

    expect((await intento(PASSWORD)).status).toBe(200);
    expect((await intento('mala-1-contraseña')).status).toBe(401);
    expect((await intento(PASSWORD)).status).toBe(200);
    expect((await intento('mala-2-contraseña')).status).toBe(401);
    const bloqueado = await intento(PASSWORD);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.codigo).toBe('LIMITE_EXCEDIDO');
  });
});

describe('rutas protegidas con JWT (GET /auth/yo)', () => {
  const yo = (token?: string) => {
    const r = request(app).get('/api/v1/auth/yo');
    return token === undefined ? r : r.set('Authorization', `Bearer ${token}`);
  };

  it('con un token válido devuelve el admin', async () => {
    const { body } = await login('admin@xolos.mx', PASSWORD);
    const res = await yo(body.token as string);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'admin@xolos.mx', nombre: 'Admin Xolos', rol: 'admin', juegosPermitidos: [] });
  });

  it('sin token responde 401 NO_AUTENTICADO', async () => {
    const res = await yo();
    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('con un token expirado responde 401 y lo dice', async () => {
    const vencido = jwt.sign({ iat: Math.floor(Date.now() / 1000) - 9 * 3600 }, SECRETO, {
      algorithm: 'HS256',
      subject: 'admin@xolos.mx',
      issuer: 'xolos-analytics-api',
      expiresIn: 8 * 3600,
    });
    const res = await yo(vencido);
    expect(res.status).toBe(401);
    expect(res.body.error.mensaje).toMatch(/expiró/);
  });

  it.each([
    ['firmado con otro secreto', () => jwt.sign({}, 'otro-secreto-cualquiera-de-32-caracteres!!', { subject: 'admin@xolos.mx', issuer: 'xolos-analytics-api' })],
    ['sin firma (alg none)', () => jwt.sign({}, '', { algorithm: 'none', subject: 'admin@xolos.mx', issuer: 'xolos-analytics-api' })],
    ['de otro emisor', () => jwt.sign({}, SECRETO, { subject: 'admin@xolos.mx', issuer: 'otro' })],
    ['basura', () => 'no.es.un.jwt'],
  ])('rechaza un token %s', async (_caso, crear) => {
    const res = await yo(crear());
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ codigo: 'NO_AUTENTICADO', mensaje: 'El token no es válido.' });
  });

  it('si el admin se desactiva después del login, su token deja de servir al instante', async () => {
    const { body } = await login('admin@xolos.mx', PASSWORD);
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { activo: false });
    const res = await yo(body.token as string);
    expect(res.status).toBe(401);
  });
});

describe('configuración', () => {
  it('la API no arranca sin JWT_SECRET', () => {
    expect(() => crearAppDePrueba({ JWT_SECRET: '' })).toThrow(/JWT_SECRET: es obligatoria para la API/);
  });
});
