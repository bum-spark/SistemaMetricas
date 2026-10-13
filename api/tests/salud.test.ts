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

  it('con varios orígenes en CORS_ORIGIN permite cada uno (también en el preflight) y ninguno más', async () => {
    const { app } = crearAppDePrueba({ CORS_ORIGIN: 'https://xolos.vercel.app, http://localhost:4200' });
    for (const origen of ['https://xolos.vercel.app', 'http://localhost:4200']) {
      const res = await request(app).get('/api/v1/salud').set('Origin', origen);
      expect(res.headers['access-control-allow-origin']).toBe(origen);
      const preflight = await request(app)
        .options('/api/v1/juegos')
        .set('Origin', origen)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization');
      expect(preflight.status).toBe(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(origen);
    }
    const ajeno = await request(app).get('/api/v1/salud').set('Origin', 'https://xolos.vercel.app.malicioso.com');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });
});
