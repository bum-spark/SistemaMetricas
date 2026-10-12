import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { crearJuego } from '../../src/scripts/crearJuego';
import { crearAppDePrueba } from '../helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const sesion = (juegoId: string) => ({ juegoId, playerId: randomUUID(), buildVersion: '1.0.0', plataforma: 'windows', consentimiento: true });

describe('rate limits', () => {
  it('por IP: al pasar el límite responde 429 LIMITE_EXCEDIDO con el formato uniforme', async () => {
    const { app } = crearAppDePrueba({ RATE_LIMIT_INGESTA_IP: '3' });
    const { juegoId, apiKey } = await crearJuego({ slug: 'la-casa-del-bosque' });

    for (let i = 0; i < 3; i++) {
      const ok = await request(app).post('/api/v1/sesiones').set('X-Api-Key', apiKey).send(sesion(juegoId));
      expect(ok.status).toBe(201);
    }
    const res = await request(app).post('/api/v1/sesiones').set('X-Api-Key', apiKey).send(sesion(juegoId));
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: { codigo: 'LIMITE_EXCEDIDO', mensaje: 'Demasiadas peticiones; espera un momento y reintenta.', detalles: [] },
    });
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });

  it('por API key: cada key tiene su propio contador', async () => {
    const { app } = crearAppDePrueba({ RATE_LIMIT_INGESTA_KEY: '2', RATE_LIMIT_INGESTA_IP: '100' });
    const casa = await crearJuego({ slug: 'la-casa-del-bosque' });
    const faro = await crearJuego({ slug: 'faro-nocturno-demo' });

    await request(app).post('/api/v1/sesiones').set('X-Api-Key', casa.apiKey).send(sesion(casa.juegoId));
    await request(app).post('/api/v1/sesiones').set('X-Api-Key', casa.apiKey).send(sesion(casa.juegoId));
    const bloqueada = await request(app).post('/api/v1/sesiones').set('X-Api-Key', casa.apiKey).send(sesion(casa.juegoId));
    const otraKey = await request(app).post('/api/v1/sesiones').set('X-Api-Key', faro.apiKey).send(sesion(faro.juegoId));

    expect(bloqueada.status).toBe(429);
    expect(otraKey.status).toBe(201);
  });

  it('/salud tiene su propio límite, independiente de la ingesta', async () => {
    const { app } = crearAppDePrueba({ RATE_LIMIT_PUBLICO_IP: '2', RATE_LIMIT_INGESTA_IP: '1' });
    expect((await request(app).get('/api/v1/salud')).status).toBe(200);
    expect((await request(app).get('/api/v1/salud')).status).toBe(200);
    expect((await request(app).get('/api/v1/salud')).status).toBe(429);
  });
});
