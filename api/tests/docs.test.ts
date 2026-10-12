import request from 'supertest';
import { crearAppDePrueba } from './helpers';

describe('documentación OpenAPI', () => {
  it('sirve el documento OpenAPI 3.1 con el nombre del estudio de la configuración', async () => {
    const { app } = crearAppDePrueba({ APP_NAME: 'Estudio de Prueba' });
    const res = await request(app).get('/api/v1/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toContain('Estudio de Prueba');
  });

  it('documenta /salud con el esquema generado desde zod', async () => {
    const { app } = crearAppDePrueba();
    const res = await request(app).get('/api/v1/docs/openapi.json');
    const esquema = res.body.paths['/salud'].get.responses['200'].content['application/json'].schema;
    expect(esquema).toEqual({ $ref: '#/components/schemas/Salud' });

    const salud = res.body.components.schemas.Salud;
    expect(salud).toMatchObject({
      type: 'object',
      properties: { estado: { const: 'ok' } },
      required: ['estado'],
    });
    expect(salud.$schema).toBeUndefined();
    expect(salud.$id).toBeUndefined();
    expect(res.body.components.schemas.Error.properties.error.required).toEqual(
      expect.arrayContaining(['codigo', 'mensaje', 'detalles']),
    );
  });

  it('sirve la interfaz Swagger UI en /api/v1/docs/', async () => {
    const { app } = crearAppDePrueba();
    const res = await request(app).get('/api/v1/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });
});
