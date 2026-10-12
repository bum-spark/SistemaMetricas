import express from 'express';
import request from 'supertest';
import { crearManejadorErrores } from '../src/middlewares/manejoErrores';
import { crearAppDePrueba } from './helpers';

describe('formato uniforme de errores', () => {
  it('responde 404 RUTA_NO_ENCONTRADA para rutas inexistentes', async () => {
    const { app } = crearAppDePrueba();
    const res = await request(app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        codigo: 'RUTA_NO_ENCONTRADA',
        mensaje: 'No existe la ruta GET /api/v1/no-existe.',
        detalles: [],
      },
    });
  });

  it('responde 400 VALIDACION_FALLIDA si el body no es JSON válido', async () => {
    const { app } = crearAppDePrueba();
    const res = await request(app)
      .post('/api/v1/salud')
      .set('Content-Type', 'application/json')
      .send('{"roto": ');
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION_FALLIDA');
  });

  it('responde 413 PAYLOAD_DEMASIADO_GRANDE si el body pasa de 100 KB', async () => {
    const { app } = crearAppDePrueba();
    const res = await request(app)
      .post('/api/v1/salud')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ relleno: 'x'.repeat(101 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.codigo).toBe('PAYLOAD_DEMASIADO_GRANDE');
  });

  it('responde 500 ERROR_INTERNO sin filtrar detalles y registra el error', async () => {
    const registrados: unknown[] = [];
    const app = express();
    app.get('/explota', () => {
      throw new Error('detalle interno secreto');
    });
    app.use(crearManejadorErrores({ registrar: (err) => registrados.push(err) }));

    const res = await request(app).get('/explota');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.', detalles: [] },
    });
    expect(JSON.stringify(res.body)).not.toContain('secreto');
    expect(registrados).toHaveLength(1);
  });
});
