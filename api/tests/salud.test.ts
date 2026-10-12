import request from 'supertest';
import { crearAppDePrueba } from './helpers';

describe('GET /api/v1/salud', () => {
  it('responde 200 { estado: "ok" } sin autenticación', async () => {
    const { app } = crearAppDePrueba();
    const res = await request(app).get('/api/v1/salud');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok' });
  });

  it('incluye headers de seguridad y no expone x-powered-by', async () => {
    const { app } = crearAppDePrueba();
    const res = await request(app).get('/api/v1/salud');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('permite CORS solo al origen configurado', async () => {
    const { app } = crearAppDePrueba({ CORS_ORIGIN: 'https://dash.ejemplo.com' });
    const permitido = await request(app).get('/api/v1/salud').set('Origin', 'https://dash.ejemplo.com');
    expect(permitido.headers['access-control-allow-origin']).toBe('https://dash.ejemplo.com');

    const ajeno = await request(app).get('/api/v1/salud').set('Origin', 'https://malicioso.com');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });
});
