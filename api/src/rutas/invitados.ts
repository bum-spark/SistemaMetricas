import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import { esquemaPaginacion } from '../admin/esquemas';
import { esquemaRespuestaError } from '../errores';
import {
  esquemaActualizacionInvitado,
  esquemaInvitacionAceptada,
  esquemaInvitacionEmitida,
  esquemaInvitacionValida,
  esquemaInvitado,
  esquemaListaInvitados,
  esquemaParamsInvitado,
  esquemaSolicitudAceptarInvitacion,
  esquemaSolicitudInvitado,
} from '../invitados/esquemas';
import {
  aceptarInvitacion,
  actualizarInvitado,
  invitar,
  listarInvitados,
  restablecerInvitado,
  validarInvitacion,
} from '../invitados/servicio';
import { adminAutenticado, crearAutenticarAdmin, exigirRolAdmin } from '../middlewares/autenticarAdmin';
import { refEsquema, type RutasOpenApi } from '../openapi/registro';
import { validar } from './admin';

// El token de GET /auth/invitacion/validar va en un header, no en la URL: así no queda en los
// logs de acceso del hosting ni en el historial (S-67).
export const HEADER_TOKEN_INVITACION = 'X-Invitacion-Token';

export function crearRutasInvitados(opciones: { jwtSecret: string; dashboardUrl: string; limiteInvitacion: RequestHandler }): Router {
  const router = Router();
  const soloAdmin = [crearAutenticarAdmin(opciones.jwtSecret), exigirRolAdmin];

  // ---------- Solo rol admin ----------
  router.post('/invitados', ...soloAdmin, async (req, res) => {
    const datos = validar(esquemaSolicitudInvitado, req.body, 'El cuerpo de la invitación');
    res.status(201).json(await invitar(adminAutenticado(res), datos, opciones.dashboardUrl));
  });

  router.get('/invitados', ...soloAdmin, async (req, res) => {
    const { pagina, limite } = validar(esquemaPaginacion, req.query, 'La consulta');
    res.json(await listarInvitados(pagina, limite));
  });

  router.patch('/invitados/:email', ...soloAdmin, async (req, res) => {
    const { email } = validar(esquemaParamsInvitado, req.params, 'El correo');
    const cambios = validar(esquemaActualizacionInvitado, req.body, 'El cuerpo');
    res.json(await actualizarInvitado(adminAutenticado(res), email, cambios));
  });

  router.post('/invitados/:email/restablecer', ...soloAdmin, async (req, res) => {
    const { email } = validar(esquemaParamsInvitado, req.params, 'El correo');
    res.json(await restablecerInvitado(adminAutenticado(res), email, opciones.dashboardUrl));
  });

  // ---------- Públicas (con rate limit propio por IP) ----------
  router.get('/auth/invitacion/validar', opciones.limiteInvitacion, async (req, res) => {
    res.json(await validarInvitacion(req.get(HEADER_TOKEN_INVITACION) ?? ''));
  });

  router.post('/auth/invitacion/aceptar', opciones.limiteInvitacion, async (req, res) => {
    const { token, password } = validar(esquemaSolicitudAceptarInvitacion, req.body, 'El cuerpo');
    res.json(await aceptarInvitacion(token, password));
  });

  return router;
}

// ---------- OpenAPI ----------

const error = (descripcion: string) => ({
  description: descripcion,
  content: { 'application/json': { schema: refEsquema(esquemaRespuestaError) } },
});
const ok = (descripcion: string, esquema: z.ZodType) => ({
  description: descripcion,
  content: { 'application/json': { schema: refEsquema(esquema) } },
});
const cuerpo = (esquema: z.ZodType) => ({ required: true, content: { 'application/json': { schema: refEsquema(esquema) } } });
const seguridad = [{ BearerAuth: [] }];
const paramEmail = { name: 'email', in: 'path', required: true, schema: { type: 'string', format: 'email' } };
const comunes = {
  '401': error('NO_AUTENTICADO'),
  '403': error('SIN_PERMISO: el usuario es invitado, intenta actuar sobre sí mismo o asigna un juego que no tiene.'),
};
const invitacionInvalida = error(
  'INVITACION_INVALIDA: mismo código y mensaje para un enlace inexistente, vencido, ya usado, invalidado o de una cuenta desactivada.',
);
const limite = error('LIMITE_EXCEDIDO: más de 10 intentos por IP en 15 min.');

export const openApiInvitados: RutasOpenApi = {
  '/invitados': {
    post: {
      tags: ['Invitados'],
      summary: 'Invita a un usuario de solo lectura y devuelve su enlace (una sola vez)',
      description:
        'Solo rol admin. Crea la cuenta pendiente con los juegos indicados (solo juegos que el admin tiene) y un enlace ' +
        '<dashboard>/invitacion#token=… de un solo uso, vigente 72 h. No se envían correos: el admin copia y comparte el enlace. ' +
        'El enlace no se puede volver a consultar.',
      security: seguridad,
      requestBody: cuerpo(esquemaSolicitudInvitado),
      responses: {
        '201': ok('Invitación creada.', esquemaInvitacionEmitida),
        '400': error('VALIDACION_FALLIDA'),
        ...comunes,
        '409': error('CORREO_YA_REGISTRADO: ya existe un usuario (admin o invitado) con ese correo.'),
      },
    },
    get: {
      tags: ['Invitados'],
      summary: 'Lista los invitados (sin enlaces)',
      description: 'Solo rol admin. Solo devuelve cuentas con rol invitado.',
      security: seguridad,
      parameters: [
        { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: { '200': ok('Lista paginada.', esquemaListaInvitados), '400': error('VALIDACION_FALLIDA'), ...comunes },
    },
  },
  '/invitados/{email}': {
    patch: {
      tags: ['Invitados'],
      summary: 'Cambia los juegos de un invitado o lo activa/desactiva',
      description:
        'Solo rol admin. Desactivar corta al instante su sesión y su enlace pendiente. Los juegos que el admin no tiene se conservan.',
      security: seguridad,
      parameters: [paramEmail],
      requestBody: cuerpo(esquemaActualizacionInvitado),
      responses: {
        '200': ok('Invitado actualizado.', esquemaInvitado),
        '400': error('VALIDACION_FALLIDA'),
        ...comunes,
        '404': error('INVITADO_NO_ENCONTRADO (también si el correo es de un admin).'),
      },
    },
  },
  '/invitados/{email}/restablecer': {
    post: {
      tags: ['Invitados'],
      summary: 'Genera un enlace nuevo (el anterior deja de servir)',
      description: 'Solo rol admin. El admin no edita contraseñas: el invitado crea una nueva con este enlace (72 h, un solo uso).',
      security: seguridad,
      parameters: [paramEmail],
      responses: {
        '200': ok('Enlace nuevo.', esquemaInvitacionEmitida),
        '400': error('VALIDACION_FALLIDA'),
        ...comunes,
        '404': error('INVITADO_NO_ENCONTRADO (también si el correo es de un admin).'),
        '409': error('INVITADO_DESACTIVADO: hay que activarlo antes.'),
      },
    },
  },
  '/auth/invitacion/validar': {
    get: {
      tags: ['Invitados'],
      summary: 'Comprueba un enlace de invitación (público)',
      description: `Sin JWT. El token va en el header ${HEADER_TOKEN_INVITACION} (no en la URL). Máximo 10 intentos por IP cada 15 min.`,
      parameters: [{ name: HEADER_TOKEN_INVITACION, in: 'header', required: true, schema: { type: 'string' } }],
      responses: { '200': ok('Enlace vigente.', esquemaInvitacionValida), '400': invitacionInvalida, '429': limite },
    },
  },
  '/auth/invitacion/aceptar': {
    post: {
      tags: ['Invitados'],
      summary: 'Crea la contraseña con el enlace y lo consume (público)',
      description:
        'Sin JWT. Contraseña de al menos 12 caracteres (bcrypt, 12 rondas). El enlace se consume en la misma operación y las ' +
        'sesiones anteriores del usuario dejan de servir. Máximo 10 intentos por IP cada 15 min.',
      requestBody: cuerpo(esquemaSolicitudAceptarInvitacion),
      responses: {
        '200': ok('Contraseña creada; ya puede iniciar sesión.', esquemaInvitacionAceptada),
        '400': error('VALIDACION_FALLIDA (contraseña corta) o INVITACION_INVALIDA.'),
        '429': limite,
      },
    },
  },
};
