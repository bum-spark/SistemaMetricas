import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminModelo } from '../../src/modelos';
import { crearAdmin } from '../../src/scripts/crearAdmin';
import { baseEnlacesInvitacion } from '../../src/rutas/invitados';
import { hashTokenInvitacion } from '../../src/seguridad/invitacion';
import * as password from '../../src/seguridad/password';
import { crearAppDePrueba } from '../helpers';
import { prepararJuego, type JuegoPrueba } from '../ingesta/helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const DASHBOARD = 'https://panel.ejemplo.mx';
const PASSWORD_ADMIN = 'contraseña-del-admin-larga';
const PASSWORD_INVITADO = 'contraseña-del-invitado';
const { app, erroresRegistrados } = crearAppDePrueba({ DASHBOARD_URL: DASHBOARD, RATE_LIMIT_INVITACION_IP: '1000', RATE_LIMIT_LOGIN_IP: '1000' });

let casa: JuegoPrueba;
let faro: JuegoPrueba;
let tokenAdmin: string;

const login = (email: string, pass: string) => request(app).post('/api/v1/auth/login').send({ email, password: pass });
const conToken = (token: string) => ({
  get: (ruta: string) => request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`),
  post: (ruta: string, cuerpo: object = {}) => request(app).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`).send(cuerpo),
  patch: (ruta: string, cuerpo: object) => request(app).patch(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`).send(cuerpo),
  delete: (ruta: string) => request(app).delete(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`),
});
const admin = () => conToken(tokenAdmin);
const validar = (token: string) => request(app).get('/api/v1/auth/invitacion/validar').set('X-Invitacion-Token', token);
const aceptar = (token: string, pass = PASSWORD_INVITADO) => request(app).post('/api/v1/auth/invitacion/aceptar').send({ token, password: pass });
const tokenDe = (enlace: string) => new URL(enlace).hash.replace('#token=', '');

async function invitar(email: string, juegos: string[] = [casa.juegoId], quien = admin()) {
  const res = await quien.post('/invitados', { email, juegos });
  if (res.status !== 201) {
    throw new Error(`No se pudo invitar: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { res, token: tokenDe(res.body.enlace as string) };
}

// Invita, acepta y entra: devuelve el JWT del invitado.
async function invitadoActivo(email: string, juegos: string[] = [casa.juegoId]) {
  const { token } = await invitar(email, juegos);
  expect((await aceptar(token)).status).toBe(200);
  return (await login(email, PASSWORD_INVITADO)).body.token as string;
}

const INVALIDA = {
  codigo: 'INVITACION_INVALIDA',
  mensaje: 'El enlace no es válido o ya venció. Pide uno nuevo a quien te invitó.',
  detalles: [],
};

beforeEach(async () => {
  casa = await prepararJuego('la-casa-del-bosque');
  faro = await prepararJuego('faro-nocturno-demo');
  await crearAdmin({ email: 'admin@xolos.mx', password: PASSWORD_ADMIN, nombre: 'Admin' }); // los dos juegos
  tokenAdmin = (await login('admin@xolos.mx', PASSWORD_ADMIN)).body.token as string;
});

describe('POST /invitados (invitar)', () => {
  it('crea la cuenta pendiente y responde el enlace una vez; en la base solo queda el SHA-256', async () => {
    const antes = Date.now();
    const { res, token } = await invitar('Ana@Ejemplo.MX', [casa.juegoId, casa.juegoId]);

    expect(res.body.enlace).toBe(`${DASHBOARD}/invitacion#token=${token}`);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const vigencia = new Date(res.body.expiraEn as string).getTime() - antes;
    expect(vigencia).toBeGreaterThan(72 * 3600e3 - 5000);
    expect(vigencia).toBeLessThanOrEqual(72 * 3600e3 + 5000);
    expect(res.body.invitado).toMatchObject({
      email: 'ana@ejemplo.mx',
      nombre: '',
      estado: 'pendiente',
      juegos: [casa.juegoId],
      invitadoPor: 'admin@xolos.mx',
      ultimoAcceso: null,
      enlaceExpiraEn: res.body.expiraEn,
    });

    const doc = await AdminModelo.findOne({ email: 'ana@ejemplo.mx' }).lean();
    expect(doc).toMatchObject({ rol: 'invitado', passwordHash: null, activo: true });
    expect(doc?.tokenInvitacionHash).toBe(hashTokenInvitacion(token));
    expect(JSON.stringify(doc)).not.toContain(token);
  });

  it('409 si el correo ya existe (invitado o admin)', async () => {
    await invitar('ana@ejemplo.mx');
    for (const email of ['ANA@ejemplo.mx', 'admin@xolos.mx']) {
      const res = await admin().post('/invitados', { email, juegos: [casa.juegoId] });
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CORREO_YA_REGISTRADO');
    }
  });

  it('el admin solo asigna juegos que él tiene (403) y que existen (400)', async () => {
    await AdminModelo.updateOne({ email: 'admin@xolos.mx' }, { juegosPermitidos: [casa.juegoId, randomUUID()] });
    const ajeno = await admin().post('/invitados', { email: 'a@ejemplo.mx', juegos: [faro.juegoId] });
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.error.codigo).toBe('SIN_PERMISO');

    const fantasma = (await AdminModelo.findOne({ email: 'admin@xolos.mx' }).lean())!.juegosPermitidos[1]!;
    const noExiste = await admin().post('/invitados', { email: 'a@ejemplo.mx', juegos: [fantasma] });
    expect(noExiste.status).toBe(400);
    expect(await AdminModelo.exists({ email: 'a@ejemplo.mx' })).toBeNull();
  });

  it.each([
    ['sin juegos', { email: 'a@ejemplo.mx', juegos: [] }],
    ['correo inválido', { email: 'no-es-correo', juegos: ['x'] }],
    ['campo desconocido', { email: 'a@ejemplo.mx', juegos: [], rol: 'admin' }],
  ])('valida el cuerpo: %s (400)', async (_caso, cuerpo) => {
    const res = await admin().post('/invitados', cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION_FALLIDA');
  });
});

describe('login con cuenta pendiente', () => {
  it('mismo 401 genérico que una contraseña incorrecta, comparando contra un hash bcrypt igual de caro', async () => {
    await invitar('ana@ejemplo.mx');
    const espia = jest.spyOn(password, 'verificarPassword');

    const pendiente = await login('ana@ejemplo.mx', PASSWORD_INVITADO);
    const incorrecta = await login('admin@xolos.mx', 'otra-contraseña-larga');

    expect(pendiente.status).toBe(401);
    expect(pendiente.body).toEqual(incorrecta.body);
    // Las dos comparan una vez contra un hash bcrypt de 12 rondas: mismo costo, mismo tiempo.
    expect(espia).toHaveBeenCalledTimes(2);
    for (const [, hash] of espia.mock.calls) {
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
    }
    espia.mockRestore();
  });
});

describe('aceptar la invitación', () => {
  it('valida el enlace, crea la contraseña (bcrypt 12) y el invitado entra con rol invitado', async () => {
    const { token } = await invitar('ana@ejemplo.mx');

    const v = await validar(token);
    expect(v.status).toBe(200);
    expect(v.body).toEqual({ email: 'ana@ejemplo.mx', nombre: '', expiraEn: expect.any(String) as unknown });

    const corta = await aceptar(token, 'corta123');
    expect(corta.status).toBe(400);
    expect(corta.body.error.codigo).toBe('VALIDACION_FALLIDA');
    expect((await validar(token)).status).toBe(200); // una contraseña corta no consume el enlace

    const ok = await aceptar(token);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ email: 'ana@ejemplo.mx' });
    const doc = await AdminModelo.findOne({ email: 'ana@ejemplo.mx' }).lean();
    expect(doc?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(doc?.tokenInvitacionHash).toBeNull();

    const entrada = await login('ana@ejemplo.mx', PASSWORD_INVITADO);
    expect(entrada.status).toBe(200);
    expect(entrada.body.admin).toEqual({ email: 'ana@ejemplo.mx', nombre: '', rol: 'invitado', juegosPermitidos: [casa.juegoId] });
  });

  it('un enlace reutilizado, vencido, inventado o con formato inválido da el mismo error', async () => {
    const usado = (await invitar('usado@ejemplo.mx')).token;
    expect((await aceptar(usado)).status).toBe(200);
    const vencido = (await invitar('vencido@ejemplo.mx')).token;
    await AdminModelo.updateOne({ email: 'vencido@ejemplo.mx' }, { tokenInvitacionExpiraEn: new Date(Date.now() - 1000) });
    const inventado = Buffer.alloc(32, 7).toString('base64url');

    for (const token of [usado, vencido, inventado, 'abc', '']) {
      const a = await aceptar(token);
      expect(a.status).toBe(400);
      expect(a.body.error).toEqual(INVALIDA);
      const v = await validar(token);
      expect(v.status).toBe(400);
      expect(v.body.error).toEqual(INVALIDA);
    }
    // El vencido no recibió contraseña.
    expect((await AdminModelo.findOne({ email: 'vencido@ejemplo.mx' }).lean())?.passwordHash).toBeNull();
  });

  it('el enlace de un usuario no sirve para otro', async () => {
    const deAna = (await invitar('ana@ejemplo.mx')).token;
    await invitar('beto@ejemplo.mx');

    expect((await aceptar(deAna)).body).toEqual({ email: 'ana@ejemplo.mx' });
    expect((await AdminModelo.findOne({ email: 'beto@ejemplo.mx' }).lean())?.passwordHash).toBeNull();
    expect((await login('beto@ejemplo.mx', PASSWORD_INVITADO)).status).toBe(401);
  });

  it('se consume en la misma operación: dos peticiones simultáneas, solo una gana', async () => {
    const { token } = await invitar('ana@ejemplo.mx');
    const respuestas = await Promise.all([aceptar(token, 'primera-contraseña-larga'), aceptar(token, 'segunda-contraseña-larga')]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('tiene rate limit propio por IP (validar y aceptar cuentan juntos)', async () => {
    const { app: limitada } = crearAppDePrueba({ RATE_LIMIT_INVITACION_IP: '3' });
    const t = Buffer.alloc(32, 1).toString('base64url');
    expect((await request(limitada).get('/api/v1/auth/invitacion/validar').set('X-Invitacion-Token', t)).status).toBe(400);
    expect((await request(limitada).post('/api/v1/auth/invitacion/aceptar').send({ token: t, password: PASSWORD_INVITADO })).status).toBe(400);
    expect((await request(limitada).get('/api/v1/auth/invitacion/validar').set('X-Invitacion-Token', t)).status).toBe(400);
    const bloqueado = await request(limitada).post('/api/v1/auth/invitacion/aceptar').send({ token: t, password: PASSWORD_INVITADO });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.codigo).toBe('LIMITE_EXCEDIDO');
  });
});

describe('restablecer', () => {
  it('genera un enlace nuevo e invalida el anterior', async () => {
    const viejo = (await invitar('ana@ejemplo.mx')).token;
    const res = await admin().post('/invitados/ana@ejemplo.mx/restablecer');
    expect(res.status).toBe(200);
    const nuevo = tokenDe(res.body.enlace as string);
    expect(nuevo).not.toBe(viejo);

    expect((await aceptar(viejo)).body.error).toEqual(INVALIDA);
    expect((await aceptar(nuevo)).status).toBe(200);
  });

  it('con una cuenta activa: la contraseña vieja sirve hasta usar el enlace; después, ni ella ni su sesión', async () => {
    const jwtViejo = await invitadoActivo('ana@ejemplo.mx');
    const nuevo = tokenDe((await admin().post('/invitados/ana@ejemplo.mx/restablecer')).body.enlace as string);
    expect((await login('ana@ejemplo.mx', PASSWORD_INVITADO)).status).toBe(200);

    // Un segundo de diferencia: el iat del JWT va en segundos.
    await new Promise((r) => setTimeout(r, 1100));
    expect((await aceptar(nuevo, 'contraseña-nueva-larga')).status).toBe(200);
    expect((await login('ana@ejemplo.mx', PASSWORD_INVITADO)).status).toBe(401);
    expect((await login('ana@ejemplo.mx', 'contraseña-nueva-larga')).status).toBe(200);
    expect((await conToken(jwtViejo).get('/auth/yo')).status).toBe(401);
  });

  it('409 si el invitado está desactivado', async () => {
    await invitar('ana@ejemplo.mx');
    await admin().patch('/invitados/ana@ejemplo.mx', { activo: false });
    const res = await admin().post('/invitados/ana@ejemplo.mx/restablecer');
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INVITADO_DESACTIVADO');
  });
});

describe('PATCH /invitados/:email', () => {
  it('desactivar corta al instante el enlace ya emitido, y reactivar no lo revive', async () => {
    const { token } = await invitar('ana@ejemplo.mx');
    const res = await admin().patch('/invitados/ana@ejemplo.mx', { activo: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'desactivado', enlaceExpiraEn: null });

    expect((await validar(token)).body.error).toEqual(INVALIDA);
    expect((await aceptar(token)).body.error).toEqual(INVALIDA);
    await admin().patch('/invitados/ana@ejemplo.mx', { activo: true });
    expect((await aceptar(token)).body.error).toEqual(INVALIDA);
  });

  it('desactivar corta al instante la sesión de un invitado activo', async () => {
    const jwt = await invitadoActivo('ana@ejemplo.mx');
    expect((await conToken(jwt).get('/juegos')).status).toBe(200);
    await admin().patch('/invitados/ana@ejemplo.mx', { activo: false });
    expect((await conToken(jwt).get('/juegos')).status).toBe(401);
    expect((await login('ana@ejemplo.mx', PASSWORD_INVITADO)).status).toBe(401);
  });

  it('cambia los juegos; conserva los que asignó otro admin y que este admin no tiene', async () => {
    await invitar('ana@ejemplo.mx', [casa.juegoId, faro.juegoId]);
    await crearAdmin({ email: 'otro@xolos.mx', password: PASSWORD_ADMIN, nombre: 'Otro', juegos: ['la-casa-del-bosque'] });
    const otro = conToken((await login('otro@xolos.mx', PASSWORD_ADMIN)).body.token as string);

    expect((await otro.patch('/invitados/ana@ejemplo.mx', { juegos: [faro.juegoId] })).status).toBe(403);
    const res = await otro.patch('/invitados/ana@ejemplo.mx', { juegos: [casa.juegoId] });
    expect(res.status).toBe(200);
    expect([...(res.body.juegos as string[])].sort()).toEqual([casa.juegoId, faro.juegoId].sort());

    const solo = await admin().patch('/invitados/ana@ejemplo.mx', { juegos: [faro.juegoId] });
    expect(solo.body.juegos).toEqual([faro.juegoId]);
  });

  it('valida el cuerpo (400 sin cambios)', async () => {
    await invitar('ana@ejemplo.mx');
    expect((await admin().patch('/invitados/ana@ejemplo.mx', {})).status).toBe(400);
    expect((await admin().patch('/invitados/ana@ejemplo.mx', { activo: 'no' })).status).toBe(400);
  });
});

describe('límites del admin sobre las cuentas', () => {
  it('no puede actuar sobre sí mismo (403) ni sobre otros admins (404: estos endpoints solo ven invitados)', async () => {
    await crearAdmin({ email: 'otro@xolos.mx', password: PASSWORD_ADMIN, nombre: 'Otro' });
    await AdminModelo.collection.insertOne({ email: 'viejo@xolos.mx', passwordHash: 'x', nombre: 'Viejo', juegosPermitidos: [], activo: true });

    for (const [email, status] of [['admin@xolos.mx', 403], ['otro@xolos.mx', 404], ['viejo@xolos.mx', 404]] as const) {
      expect((await admin().patch(`/invitados/${email}`, { activo: false })).status).toBe(status);
      expect((await admin().post(`/invitados/${email}/restablecer`)).status).toBe(status);
    }
    expect(await AdminModelo.countDocuments({ activo: false })).toBe(0);
    expect(await AdminModelo.countDocuments({ tokenInvitacionHash: { $type: 'string' } })).toBe(0);
  });

  it('GET /invitados solo lista invitados, con su estado y sin enlaces ni hashes', async () => {
    const pendiente = (await invitar('pendiente@ejemplo.mx')).token;
    const jwt = await invitadoActivo('activo@ejemplo.mx');
    await invitar('baja@ejemplo.mx');
    await admin().patch('/invitados/baja@ejemplo.mx', { activo: false });
    expect(jwt).toBeTruthy();

    const res = await admin().get('/invitados');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pagina: 1, limite: 20, total: 3 });
    const estados = Object.fromEntries((res.body.datos as { email: string; estado: string }[]).map((i) => [i.email, i.estado]));
    expect(estados).toEqual({ 'pendiente@ejemplo.mx': 'pendiente', 'activo@ejemplo.mx': 'activo', 'baja@ejemplo.mx': 'desactivado' });
    const activo = (res.body.datos as { email: string; ultimoAcceso: string | null }[]).find((i) => i.email === 'activo@ejemplo.mx');
    expect(activo?.ultimoAcceso).toEqual(expect.any(String));

    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain(pendiente);
    expect(texto).not.toContain(hashTokenInvitacion(pendiente));
    expect(texto).not.toMatch(/invitacion#token|passwordHash|tokenInvitacionHash/);
  });
});

describe('un invitado es de solo lectura sobre sus juegos', () => {
  let invitado: ReturnType<typeof conToken>;

  beforeEach(async () => {
    invitado = conToken(await invitadoActivo('ana@ejemplo.mx', [casa.juegoId]));
  });

  it('/juegos solo lista sus juegos y /auth/yo dice su rol', async () => {
    const juegos = await invitado.get('/juegos');
    expect((juegos.body.datos as { juegoId: string }[]).map((j) => j.juegoId)).toEqual([casa.juegoId]);
    expect((await invitado.get('/auth/yo')).body).toMatchObject({ rol: 'invitado', juegosPermitidos: [casa.juegoId] });
  });

  it('no ve juegos no asignados (403) y sí las estadísticas de los suyos', async () => {
    expect((await invitado.get(`/juegos/${faro.juegoId}`)).status).toBe(403);
    expect((await invitado.get(`/estadisticas/${faro.juegoId}/embudo`)).status).toBe(403);
    expect((await invitado.get(`/juegos/${casa.juegoId}`)).status).toBe(200);
    expect((await invitado.get(`/estadisticas/${casa.juegoId}/embudo`)).status).toBe(200);
  });

  it('no puede borrar jugadores (403, aunque sea de su juego)', async () => {
    const res = await invitado.delete(`/jugadores/${casa.juegoId}/${randomUUID()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('no puede usar ningún endpoint de /invitados (403)', async () => {
    const respuestas = await Promise.all([
      invitado.get('/invitados'),
      invitado.post('/invitados', { email: 'x@ejemplo.mx', juegos: [casa.juegoId] }),
      invitado.patch('/invitados/ana@ejemplo.mx', { juegos: [faro.juegoId] }),
      invitado.post('/invitados/ana@ejemplo.mx/restablecer'),
    ]);
    for (const r of respuestas) {
      expect(r.status).toBe(403);
      expect(r.body.error.codigo).toBe('SIN_PERMISO');
    }
    expect(await AdminModelo.exists({ email: 'x@ejemplo.mx' })).toBeNull();
    expect((await AdminModelo.findOne({ email: 'ana@ejemplo.mx' }).lean())?.juegosPermitidos).toEqual([casa.juegoId]);
  });
});

describe('admin sin campo rol (creado antes de los invitados)', () => {
  it('sigue siendo admin: entra, ve su rol, invita y puede borrar jugadores', async () => {
    const hash = await password.hashPassword(PASSWORD_ADMIN);
    await AdminModelo.collection.insertOne({
      email: 'viejo@xolos.mx',
      passwordHash: hash,
      nombre: 'Viejo',
      juegosPermitidos: [casa.juegoId],
      activo: true,
      creadoEn: new Date(),
      ultimoLogin: null,
    });
    const entrada = await login('viejo@xolos.mx', PASSWORD_ADMIN);
    expect(entrada.status).toBe(200);
    expect(entrada.body.admin.rol).toBe('admin');
    const viejo = conToken(entrada.body.token as string);

    expect((await viejo.get('/auth/yo')).body.rol).toBe('admin');
    expect((await viejo.post('/invitados', { email: 'nuevo@ejemplo.mx', juegos: [casa.juegoId] })).status).toBe(201);
    // 404 = pasó el control de rol (el jugador no existe).
    expect((await viejo.delete(`/jugadores/${casa.juegoId}/${randomUUID()}`)).status).toBe(404);
  });
});

describe('el enlace no queda en logs ni en respuestas posteriores', () => {
  it('ni en la consola ni en los errores registrados, y no se puede volver a consultar', async () => {
    const salidas: string[] = [];
    const espias = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        salidas.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      }),
    );
    try {
      const { token } = await invitar('ana@ejemplo.mx');
      const otro = tokenDe((await admin().post('/invitados/ana@ejemplo.mx/restablecer')).body.enlace as string);
      await validar(token);
      await aceptar(token);
      await validar(otro);
      await aceptar(otro);
      const jwt = (await login('ana@ejemplo.mx', PASSWORD_INVITADO)).body.token as string;

      const posteriores = await Promise.all([
        admin().get('/invitados'),
        admin().patch('/invitados/ana@ejemplo.mx', { juegos: [faro.juegoId] }),
        conToken(jwt).get('/auth/yo'),
        login('ana@ejemplo.mx', PASSWORD_INVITADO),
      ]);
      for (const r of posteriores) {
        const texto = JSON.stringify(r.body);
        expect(texto).not.toContain(token);
        expect(texto).not.toContain(otro);
        expect(texto).not.toContain('#token=');
      }
      const todo = [...salidas, ...erroresRegistrados.map((e) => String(e))].join('\n');
      expect(todo).not.toContain(token);
      expect(todo).not.toContain(otro);
    } finally {
      espias.forEach((e) => e.mockRestore());
    }
  });
});

describe('DASHBOARD_URL en producción', () => {
  const appProduccion = (dashboardUrl?: string) =>
    crearAppDePrueba({ NODE_ENV: 'production', CORS_ORIGIN: 'http://localhost:4200', ...(dashboardUrl ? { DASHBOARD_URL: dashboardUrl } : {}) }).app;
  const tokenEn = async (a: ReturnType<typeof appProduccion>) =>
    (await request(a).post('/api/v1/auth/login').send({ email: 'admin@xolos.mx', password: PASSWORD_ADMIN })).body.token as string;

  it.each([
    ['falta', undefined],
    ['es localhost', 'http://localhost:4200'],
    ['es 127.0.0.1', 'http://127.0.0.1:4200'],
  ])('si %s, invitar y restablecer responden 500 claro y no crean nada', async (_caso, url) => {
    const prod = appProduccion(url);
    const jwt = await tokenEn(prod);
    const { token: original } = await invitar('ana@ejemplo.mx'); // creado con la app de desarrollo
    const hashAntes = (await AdminModelo.findOne({ email: 'ana@ejemplo.mx' }).lean())?.tokenInvitacionHash;

    const inv = await request(prod).post('/api/v1/invitados').set('Authorization', `Bearer ${jwt}`).send({ email: 'beto@ejemplo.mx', juegos: [casa.juegoId] });
    expect(inv.status).toBe(500);
    expect(inv.body.error.codigo).toBe('DASHBOARD_URL_NO_CONFIGURADA');
    expect(inv.body.error.mensaje).toContain('DASHBOARD_URL');
    expect(JSON.stringify(inv.body)).not.toContain('localhost');
    expect(await AdminModelo.exists({ email: 'beto@ejemplo.mx' })).toBeNull();

    const rest = await request(prod).post('/api/v1/invitados/ana@ejemplo.mx/restablecer').set('Authorization', `Bearer ${jwt}`);
    expect(rest.status).toBe(500);
    expect(rest.body.error.codigo).toBe('DASHBOARD_URL_NO_CONFIGURADA');
    // El enlace vigente no se tocó.
    expect((await AdminModelo.findOne({ email: 'ana@ejemplo.mx' }).lean())?.tokenInvitacionHash).toBe(hashAntes);
    expect((await validar(original)).status).toBe(200);
  });

  it('con un dominio público, el enlace usa ese dominio', async () => {
    const prod = appProduccion('https://panel.ejemplo.mx');
    const jwt = await tokenEn(prod);
    const res = await request(prod).post('/api/v1/invitados').set('Authorization', `Bearer ${jwt}`).send({ email: 'beto@ejemplo.mx', juegos: [casa.juegoId] });
    expect(res.status).toBe(201);
    expect(res.body.enlace).toMatch(/^https:\/\/panel\.ejemplo\.mx\/invitacion#token=/);
  });

  it('en desarrollo, sin DASHBOARD_URL usa el primer origen de CORS', () => {
    expect(baseEnlacesInvitacion({ entorno: 'development', dashboardUrl: undefined, corsOrigenes: ['http://localhost:4200', 'https://b.mx'] })).toBe('http://localhost:4200');
    expect(baseEnlacesInvitacion({ entorno: 'production', dashboardUrl: 'https://a.mx', corsOrigenes: ['http://localhost:4200'] })).toBe('https://a.mx');
  });
});
