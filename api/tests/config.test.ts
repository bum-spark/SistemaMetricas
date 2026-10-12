import { cargarConfig, ConfigInvalidaError } from '../src/config';

describe('cargarConfig', () => {
  it('usa valores por defecto cuando no hay variables', () => {
    expect(cargarConfig({})).toEqual({
      entorno: 'development',
      puerto: 3000,
      appName: 'Estudio Xolos',
      corsOrigenes: ['http://localhost:4200'],
    });
  });

  it('lee y convierte las variables de entorno', () => {
    const config = cargarConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      APP_NAME: 'Otro Estudio',
      CORS_ORIGIN: 'https://dash.ejemplo.com, https://otro.ejemplo.com',
    });
    expect(config).toEqual({
      entorno: 'production',
      puerto: 8080,
      appName: 'Otro Estudio',
      corsOrigenes: ['https://dash.ejemplo.com', 'https://otro.ejemplo.com'],
    });
  });

  it('rechaza un puerto inválido indicando la variable', () => {
    expect(() => cargarConfig({ PORT: 'abc' })).toThrow(ConfigInvalidaError);
    expect(() => cargarConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => cargarConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
