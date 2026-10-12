import { Router } from 'express';
import { z } from 'zod';
import { refEsquema, registrarEsquema, type RutasOpenApi } from '../openapi/registro';

export const esquemaRespuestaSalud = registrarEsquema('Salud', z.object({ estado: z.literal('ok') }));

export function crearRutasSalud(): Router {
  const router = Router();
  router.get('/salud', (_req, res) => {
    const respuesta: z.infer<typeof esquemaRespuestaSalud> = { estado: 'ok' };
    res.json(respuesta);
  });
  return router;
}

export const openApiSalud: RutasOpenApi = {
  '/salud': {
    get: {
      tags: ['Salud'],
      summary: 'Comprueba que la API está viva',
      description: 'Sin autenticación. Lo usa el health check del hosting.',
      responses: {
        '200': {
          description: 'La API responde.',
          content: { 'application/json': { schema: refEsquema(esquemaRespuestaSalud) } },
        },
      },
    },
  },
};
