import { cargarConfig, ConfigInvalidaError } from '../src/config';
import { baseDeUri } from '../src/mongoUri';

const URI = 'mongodb://localhost:27017';
const BASE = { MONGODB_URI: URI, MONGODB_DB: 'xolos_analytics' };

describe('cargarConfig', () => {
  it('usa valores por defecto cuando solo están la URI y la base de datos', () => {
    expect(cargarConfig(BASE)).toEqual({
      entorno: 'development',
      puerto: 3000,
      appName: 'Estudio Xolos',
      corsOrigenes: ['http://localhost:4200'],
      mongoUri: URI,
      mongoDb: 'xolos_analytics',
      trustProxy: 1,
      limites: { ingestaPorIp: 300, ingestaPorKey: 1000, publicoPorIp: 600, loginPorIp: 5 },
      jwtSecret: undefined,
    });
  });

  it('JWT_SECRET es opcional para los scripts pero, si viene, debe tener al menos 32 caracteres', () => {
    expect(cargarConfig({ ...BASE, JWT_SECRET: 'x'.repeat(32) }).jwtSecret).toBe('x'.repeat(32));
    expect(() => cargarConfig({ ...BASE, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET: debe tener al menos 32/);
  });

  it('permite ajustar trust proxy y los límites (prueba de carga)', () => {
    expect(cargarConfig({ ...BASE, TRUST_PROXY: '0', RATE_LIMIT_INGESTA_IP: '100000' })).toMatchObject({
      trustProxy: 0,
      limites: { ingestaPorIp: 100000 },
    });
    expect(() => cargarConfig({ ...BASE, RATE_LIMIT_INGESTA_IP: '0' })).toThrow(/RATE_LIMIT_INGESTA_IP/);
  });

  it('lee y convierte las variables de entorno', () => {
    const config = cargarConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      APP_NAME: 'Otro Estudio',
      CORS_ORIGIN: 'https://dash.ejemplo.com, https://otro.ejemplo.com',
      MONGODB_URI: 'mongodb+srv://u:p@cluster.mongodb.net/?retryWrites=true',
      MONGODB_DB: 'xolos_analytics',
    });
    expect(config).toMatchObject({
      entorno: 'production',
      puerto: 8080,
      appName: 'Otro Estudio',
      corsOrigenes: ['https://dash.ejemplo.com', 'https://otro.ejemplo.com'],
      mongoDb: 'xolos_analytics',
    });
  });

  it('CORS_ORIGIN acepta una lista separada por comas y rechaza orígenes mal escritos', () => {
    expect(cargarConfig({ ...BASE, CORS_ORIGIN: 'https://xolos.vercel.app,http://localhost:4200' }).corsOrigenes).toEqual([
      'https://xolos.vercel.app',
      'http://localhost:4200',
    ]);
    expect(cargarConfig({ ...BASE, CORS_ORIGIN: ' https://xolos.vercel.app , ' }).corsOrigenes).toEqual(['https://xolos.vercel.app']);
    expect(cargarConfig(BASE).corsOrigenes).toEqual(['http://localhost:4200']);
    expect(() => cargarConfig({ ...BASE, CORS_ORIGIN: 'https://xolos.vercel.app/' })).toThrow(/"https:\/\/xolos\.vercel\.app\/" no es un origen válido/);
    expect(() => cargarConfig({ ...BASE, CORS_ORIGIN: 'xolos.vercel.app' })).toThrow(/CORS_ORIGIN/);
    expect(() => cargarConfig({ ...BASE, CORS_ORIGIN: '*' })).toThrow(/CORS_ORIGIN/);
    expect(() => cargarConfig({ ...BASE, CORS_ORIGIN: 'ftp://x.com' })).toThrow(/CORS_ORIGIN/);
    expect(() => cargarConfig({ ...BASE, CORS_ORIGIN: ' , ' })).toThrow(/CORS_ORIGIN: indica al menos un origen/);
  });

  it('exige MONGODB_URI y MONGODB_DB (sin valor por defecto)', () => {
    expect(() => cargarConfig({})).toThrow(ConfigInvalidaError);
    expect(() => cargarConfig({ MONGODB_DB: 'x' })).toThrow(/MONGODB_URI: es obligatoria/);
    expect(() => cargarConfig({ MONGODB_URI: URI })).toThrow(/MONGODB_DB: es obligatoria/);
  });

  it('valida el nombre de la base de datos', () => {
    expect(() => cargarConfig({ ...BASE, MONGODB_DB: 'con espacio' })).toThrow(/MONGODB_DB/);
    expect(() => cargarConfig({ ...BASE, MONGODB_DB: 'a.b' })).toThrow(/MONGODB_DB/);
  });

  it('acepta una URI que trae la misma base que MONGODB_DB', () => {
    expect(cargarConfig({ MONGODB_URI: `${URI}/xolos_analytics?authSource=admin`, MONGODB_DB: 'xolos_analytics' }).mongoDb).toBe(
      'xolos_analytics',
    );
  });

  it('falla con un error claro si la URI trae una base distinta', () => {
    expect(() =>
      cargarConfig({ MONGODB_URI: 'mongodb+srv://u:p@cluster.net/otro_proyecto?retryWrites=true', MONGODB_DB: 'xolos_analytics' }),
    ).toThrow('MONGODB_DB: la URI apunta a la base "otro_proyecto" pero MONGODB_DB es "xolos_analytics"');
  });

  it('una variable vacía cuenta como no definida (campos en blanco del panel de Render)', () => {
    expect(cargarConfig({ ...BASE, RATE_LIMIT_INGESTA_IP: '', TRUST_PROXY: '  ', APP_NAME: '' })).toMatchObject({
      appName: 'Estudio Xolos',
      trustProxy: 1,
      limites: { ingestaPorIp: 300 },
    });
    expect(() => cargarConfig({ ...BASE, MONGODB_DB: '' })).toThrow(/MONGODB_DB: es obligatoria/);
  });

  it('rechaza una URI que no es de MongoDB', () => {
    expect(() => cargarConfig({ ...BASE, MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/);
  });

  it('rechaza un puerto inválido o un NODE_ENV desconocido', () => {
    expect(() => cargarConfig({ ...BASE, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => cargarConfig({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

describe('baseDeUri', () => {
  it.each([
    ['mongodb://localhost:27017', undefined],
    ['mongodb://localhost:27017/', undefined],
    ['mongodb://localhost:27017/?replicaSet=rs0', undefined],
    ['mongodb://localhost:27017/metricas', 'metricas'],
    ['mongodb+srv://usuario:cl%2Fave@cluster0.net/otro_proyecto?retryWrites=true', 'otro_proyecto'],
    ['mongodb://u:p@a:1,b:2/xolos_analytics?replicaSet=rs0', 'xolos_analytics'],
  ])('%s → %s', (uri, esperado) => {
    expect(baseDeUri(uri)).toBe(esperado);
  });
});
