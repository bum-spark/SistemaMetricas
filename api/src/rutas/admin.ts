import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import {
  esquemaAdmin,
  esquemaDetalleJuego,
  esquemaListaJuegos,
  esquemaConsultaJuegos,
  esquemaParamsJuego,
  esquemaParamsJugador,
  esquemaRespuestaBorrado,
  esquemaRespuestaLogin,
  esquemaSolicitudLogin,
} from '../admin/esquemas';
import { borrarJugador, detalleJuego, iniciarSesion, listarJuegos } from '../admin/servicio';
import { describirIssue } from '../dominio/zodEs';
import { AppError, esquemaRespuestaError } from '../errores';
import { adminAutenticado, crearAutenticarAdmin, verificarAccesoJuego } from '../middlewares/autenticarAdmin';
import { refEsquema, type RutasOpenApi } from '../openapi/registro';

function validar<T extends z.ZodType>(esquema: T, valor: unknown, que: string): z.infer<T> {
  const resultado = esquema.safeParse(valor);
  if (!resultado.success) {
    throw new AppError(400, 'VALIDACION_FALLIDA', `${que} no es válido.`, resultado.error.issues.map((i) => describirIssue(i)));
  }
  return resultado.data;
}

export function crearRutasAdmin(opciones: { jwtSecret: string; limiteLogin: RequestHandler }): Router {
  const router = Router();
  const autenticar = crearAutenticarAdmin(opciones.jwtSecret);

  router.post('/auth/login', opciones.limiteLogin, async (req, res) => {
    const { email, password } = validar(esquemaSolicitudLogin, req.body, 'El cuerpo del login');
    res.json(await iniciarSesion(email, password, opciones.jwtSecret));
  });

  router.get('/auth/yo', autenticar, (_req, res) => {
    res.json(adminAutenticado(res));
  });

  router.get('/juegos', autenticar, async (req, res) => {
    const { pagina, limite, origen } = validar(esquemaConsultaJuegos, req.query, 'La consulta');
    res.json(await listarJuegos(adminAutenticado(res), pagina, limite, origen));
  });

  router.get('/juegos/:juegoId', autenticar, async (req, res) => {
    const { juegoId } = validar(esquemaParamsJuego, req.params, 'El juegoId');
    verificarAccesoJuego(adminAutenticado(res), juegoId);
    res.json(await detalleJuego(juegoId));
  });

  router.delete('/jugadores/:juegoId/:playerId', autenticar, async (req, res) => {
    const { juegoId, playerId } = validar(esquemaParamsJugador, req.params, 'La ruta');
    verificarAccesoJuego(adminAutenticado(res), juegoId);
    res.json(await borrarJugador(juegoId, playerId));
  });

  return router;
}

const error = (descripcion: string) => ({
  description: descripcion,
  content: { 'application/json': { schema: refEsquema(esquemaRespuestaError) } },
});
const ok = (descripcion: string, esquema: z.ZodType) => ({
  description: descripcion,
  content: { 'application/json': { schema: refEsquema(esquema) } },
});
const noAutenticado = error('NO_AUTENTICADO: falta el token, es inválido o expiró.');
const sinPermiso = error('SIN_PERMISO: el juego no está en juegosPermitidos del admin.');
const paramJuego = { name: 'juegoId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const seguridad = [{ BearerAuth: [] }];

export const openApiAdmin: RutasOpenApi = {
  '/auth/login': {
    post: {
      tags: ['Administración'],
      summary: 'Inicia sesión de admin y devuelve un JWT (8 h)',
      description: 'Sin registro público: el primer admin se crea con el script crear-admin. Máximo 5 intentos fallidos por IP cada 15 min.',
      requestBody: { required: true, content: { 'application/json': { schema: refEsquema(esquemaSolicitudLogin) } } },
      responses: {
        '200': ok('Sesión iniciada.', esquemaRespuestaLogin),
        '400': error('VALIDACION_FALLIDA'),
        '401': error('CREDENCIALES_INVALIDAS: correo o contraseña incorrectos (mismo mensaje en todos los casos).'),
        '429': error('LIMITE_EXCEDIDO: demasiados intentos fallidos.'),
      },
    },
  },
  '/auth/yo': {
    get: {
      tags: ['Administración'],
      summary: 'Datos del admin autenticado',
      security: seguridad,
      responses: { '200': ok('Admin autenticado.', esquemaAdmin), '401': noAutenticado },
    },
  },
  '/juegos': {
    get: {
      tags: ['Administración'],
      summary: 'Juegos permitidos al admin, con resumen',
      security: seguridad,
      parameters: [
        { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        {
          name: 'origen',
          in: 'query',
          description: 'Datos que cuenta el resumen: real (ingesta), seed (prueba) o todos.',
          schema: { type: 'string', enum: ['real', 'seed', 'todos'], default: 'todos' },
        },
      ],
      responses: { '200': ok('Lista paginada.', esquemaListaJuegos), '400': error('VALIDACION_FALLIDA'), '401': noAutenticado },
    },
  },
  '/juegos/{juegoId}': {
    get: {
      tags: ['Administración'],
      summary: 'Detalle de un juego: catálogo y valores para los filtros',
      security: seguridad,
      parameters: [paramJuego],
      responses: {
        '200': ok('Juego.', esquemaDetalleJuego),
        '400': error('VALIDACION_FALLIDA: juegoId no es UUID v4.'),
        '401': noAutenticado,
        '403': sinPermiso,
        '404': error('JUEGO_NO_ENCONTRADO'),
      },
    },
  },
  '/jugadores/{juegoId}/{playerId}': {
    delete: {
      tags: ['Administración'],
      summary: 'Borra todos los datos de un jugador (privacidad)',
      description: 'Elimina el jugador y sus sesiones, eventos y logros en ese juego.',
      security: seguridad,
      parameters: [paramJuego, { name: 'playerId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': ok('Datos eliminados.', esquemaRespuestaBorrado),
        '400': error('VALIDACION_FALLIDA'),
        '401': noAutenticado,
        '403': sinPermiso,
        '404': error('JUGADOR_NO_ENCONTRADO'),
      },
    },
  },
};
