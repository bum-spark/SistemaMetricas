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

describe('OpenAPI de la ingesta', () => {
  it('documenta POST /sesiones y POST /eventos con la API key como seguridad', async () => {
    const { app } = crearAppDePrueba();
    const { body } = await request(app).get('/api/v1/docs/openapi.json');
    expect(body.components.securitySchemes.ApiKey).toEqual(expect.objectContaining({ type: 'apiKey', in: 'header', name: 'X-Api-Key' }));
    for (const ruta of ['/sesiones', '/eventos']) {
      expect(body.paths[ruta].post.security).toEqual([{ ApiKey: [] }]);
    }
    expect(body.paths['/sesiones'].post.requestBody.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/SolicitudSesion' });
    expect(Object.keys(body.paths['/sesiones'].post.responses as object).sort()).toEqual(['200', '201', '400', '401', '403', '413', '429']);
  });

  it('el esquema Evento tiene una variante por cada tipo, generada desde zod', async () => {
    const { app } = crearAppDePrueba();
    const { body } = await request(app).get('/api/v1/docs/openapi.json');
    const evento = body.components.schemas.Evento;
    const variantes = (evento.oneOf ?? evento.anyOf) as { properties: { tipo: { const: string } } }[];
    expect(variantes).toHaveLength(14);
    expect(variantes.map((v) => v.properties.tipo.const)).toContain('flor_recogida');
    const muerte = variantes.find((v) => v.properties.tipo.const === 'muerte') as unknown as { properties: { data: { required: string[] } } };
    expect(muerte.properties.data.required).toEqual(expect.arrayContaining(['nivelId', 'intento', 'causa', 'x', 'y']));
    expect(body.components.schemas.RespuestaEventos.properties.rechazados.items.properties.codigo.enum).toContain('SIN_CONSENTIMIENTO');
  });
});

describe('OpenAPI de invitados', () => {
  it('documenta las rutas de invitados (JWT) y las públicas de la invitación (sin JWT)', async () => {
    const { app } = crearAppDePrueba();
    const { body } = await request(app).get('/api/v1/docs/openapi.json');
    expect(body.paths['/invitados'].post.security).toEqual([{ BearerAuth: [] }]);
    expect(body.paths['/invitados'].post.requestBody.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/SolicitudInvitado' });
    expect(Object.keys(body.paths['/invitados'].post.responses as object).sort()).toEqual(['201', '400', '401', '403', '409']);
    expect(body.paths['/invitados'].get.security).toEqual([{ BearerAuth: [] }]);
    expect(body.paths['/invitados/{email}'].patch).toBeDefined();
    expect(body.paths['/invitados/{email}/restablecer'].post).toBeDefined();
    expect(body.paths['/auth/invitacion/validar'].get.security).toBeUndefined();
    expect(body.paths['/auth/invitacion/validar'].get.parameters[0]).toMatchObject({ name: 'X-Invitacion-Token', in: 'header' });
    expect(body.paths['/auth/invitacion/aceptar'].post.responses['429']).toBeDefined();
    expect(body.components.schemas.Invitado.properties.estado.enum).toEqual(['pendiente', 'activo', 'desactivado']);
    expect(body.components.schemas.Admin.properties.rol.enum).toEqual(['admin', 'invitado']);
    // Ningún esquema de respuesta de la lista expone el enlace.
    expect(Object.keys(body.components.schemas.Invitado.properties as object)).not.toContain('enlace');
  });
});
