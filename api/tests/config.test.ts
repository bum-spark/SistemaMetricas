import { cargarConfig, ConfigInvalidaError } from '../src/config';

const URI = 'mongodb://localhost:27017/metricas';

describe('cargarConfig', () => {
  it('usa valores por defecto cuando solo está la URI de Mongo', () => {
    expect(cargarConfig({ MONGODB_URI: URI })).toEqual({
      entorno: 'development',
      puerto: 3000,
      appName: 'Estudio Xolos',
      corsOrigenes: ['http://localhost:4200'],
      mongoUri: URI,
    });
  });

  it('lee y convierte las variables de entorno', () => {
    const config = cargarConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      APP_NAME: 'Otro Estudio',
      CORS_ORIGIN: 'https://dash.ejemplo.com, https://otro.ejemplo.com',
      MONGODB_URI: 'mongodb+srv://u:p@cluster.mongodb.net/metricas',
    });
    expect(config).toEqual({
      entorno: 'production',
      puerto: 8080,
      appName: 'Otro Estudio',
      corsOrigenes: ['https://dash.ejemplo.com', 'https://otro.ejemplo.com'],
      mongoUri: 'mongodb+srv://u:p@cluster.mongodb.net/metricas',
    });
  });

  it('exige MONGODB_URI', () => {
    expect(() => cargarConfig({})).toThrow(ConfigInvalidaError);
    expect(() => cargarConfig({})).toThrow(/MONGODB_URI: es obligatoria/);
  });

  it('rechaza una URI que no es de MongoDB', () => {
    expect(() => cargarConfig({ MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/);
  });

  it('rechaza un puerto inválido indicando la variable', () => {
    expect(() => cargarConfig({ MONGODB_URI: URI, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => cargarConfig({ MONGODB_URI: URI, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
