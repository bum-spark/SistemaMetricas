import { Router } from 'express';
import { esquemaEvento } from '../dominio/eventos';
import { describirIssue } from '../dominio/zodEs';
import { AppError } from '../errores';
import {
  esquemaRespuestaEventos,
  esquemaSesionCreada,
  esquemaSesionSinConsentimiento,
  esquemaSolicitudSesion,
  MAX_EVENTOS_POR_LOTE,
} from '../ingesta/esquemas';
import { crearSesion, ingerirEventos } from '../ingesta/servicio';
import { autenticarJuego, juegoAutenticado } from '../middlewares/autenticarJuego';
import type { Limitadores } from '../middlewares/limites';
import { esquemaRespuestaError } from '../errores';
import { refEsquema, type RutasOpenApi } from '../openapi/registro';

export function crearRutasIngesta(limitadores: Limitadores): Router {
  const router = Router();
  router.use(['/sesiones', '/eventos'], limitadores.ingestaPorIp, limitadores.ingestaPorKey, autenticarJuego);

  router.post('/sesiones', async (req, res) => {
    const juego = juegoAutenticado(res);
    const cuerpo = esquemaSolicitudSesion.safeParse(req.body);
    if (!cuerpo.success) {
      throw new AppError(400, 'VALIDACION_FALLIDA', 'El cuerpo de la sesión no es válido.', cuerpo.error.issues.map((i) => describirIssue(i)));
    }
    if (cuerpo.data.juegoId !== juego.juegoId) {
      throw new AppError(403, 'JUEGO_NO_COINCIDE', 'juegoId no corresponde al juego de la API key.');
    }
    const resultado = await crearSesion(juego, cuerpo.data);
    res.status(resultado.estado).json(resultado.cuerpo);
  });

  router.post('/eventos', async (req, res) => {
    const juego = juegoAutenticado(res);
    const cuerpo: unknown = req.body;
    if (typeof cuerpo !== 'object' || cuerpo === null) {
      throw new AppError(400, 'VALIDACION_FALLIDA', 'El cuerpo debe ser un evento (objeto) o un arreglo de eventos.');
    }
    const lote = Array.isArray(cuerpo) ? (cuerpo as unknown[]) : [cuerpo];
    if (lote.length === 0) {
      throw new AppError(400, 'VALIDACION_FALLIDA', 'El lote está vacío.');
    }
    if (lote.length > MAX_EVENTOS_POR_LOTE) {
      throw new AppError(400, 'LOTE_DEMASIADO_GRANDE', `El lote tiene ${lote.length} eventos; el máximo es ${MAX_EVENTOS_POR_LOTE}.`);
    }
    // 201 aunque aceptados sea 0: la petición es válida; el detalle va en `rechazados`.
    res.status(201).json(await ingerirEventos(juego, lote));
  });

  return router;
}

const error = (descripcion: string) => ({
  description: descripcion,
  content: { 'application/json': { schema: refEsquema(esquemaRespuestaError) } },
});

const erroresComunes = {
  '401': error('API_KEY_INVALIDA: falta la X-Api-Key, no existe, fue revocada o el juego está inactivo.'),
  '413': error('PAYLOAD_DEMASIADO_GRANDE: el body supera 100 KB.'),
  '429': error('LIMITE_EXCEDIDO: rate limit por IP o por API key.'),
};

export const openApiIngesta: RutasOpenApi = {
  '/sesiones': {
    post: {
      tags: ['Ingesta'],
      summary: 'Inicia una sesión de juego',
      description:
        'La llama Unity al arrancar. Guarda el consentimiento del jugador. Con consentimiento crea la sesión y ' +
        'devuelve un sessionId nuevo; sin consentimiento no guarda nada (200 con sessionId null).',
      security: [{ ApiKey: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: refEsquema(esquemaSolicitudSesion) } } },
      responses: {
        '201': { description: 'Sesión creada.', content: { 'application/json': { schema: refEsquema(esquemaSesionCreada) } } },
        '200': {
          description: 'Sin consentimiento: no se crea sesión.',
          content: { 'application/json': { schema: refEsquema(esquemaSesionSinConsentimiento) } },
        },
        '400': error('VALIDACION_FALLIDA: el cuerpo no es válido (detalles en `detalles`).'),
        '403': error('JUEGO_NO_COINCIDE: juegoId distinto al de la API key.'),
        ...erroresComunes,
      },
    },
  },
  '/eventos': {
    post: {
      tags: ['Ingesta'],
      summary: 'Envía un evento o un lote de hasta 100',
      description:
        'Aceptación parcial: los eventos válidos se guardan y los inválidos se reportan en `rechazados` (201 aunque ' +
        'aceptados sea 0). Un eventoId repetido se ignora y cuenta como aceptado. El SDK no debe reintentar rechazos.',
      security: [{ ApiKey: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              oneOf: [refEsquema(esquemaEvento), { type: 'array', items: refEsquema(esquemaEvento), minItems: 1, maxItems: MAX_EVENTOS_POR_LOTE }],
            },
          },
        },
      },
      responses: {
        '201': { description: 'Lote procesado.', content: { 'application/json': { schema: refEsquema(esquemaRespuestaEventos) } } },
        '400': error('VALIDACION_FALLIDA (cuerpo vacío o que no es objeto/arreglo) o LOTE_DEMASIADO_GRANDE (más de 100).'),
        ...erroresComunes,
      },
    },
  },
};
