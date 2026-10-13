import { Router } from 'express';
import { z } from 'zod';
import { esquemaParamsJuego } from '../admin/esquemas';
import { esquemaCatalogo } from '../dominio/catalogo';
import { PLATAFORMAS } from '../dominio/constantes';
import { describirIssue } from '../dominio/zodEs';
import { AppError, esquemaRespuestaError } from '../errores';
import type { ContextoEstadistica } from '../estadisticas/contexto';
import { esquemaFiltrosEstadisticas, esquemaFiltrosMapaCalor, ORIGENES_FILTRO, type FiltrosEstadisticas, type FiltrosMapaCalor } from '../estadisticas/filtros';
import {
  esquemaDatosEmbudo,
  esquemaDatosLogros,
  esquemaDatosMuertes,
  esquemaDatosSesiones,
  esquemaDatosTiempoNivel,
  estadisticaEmbudo,
  estadisticaLogros,
  estadisticaMuertes,
  estadisticaSesiones,
  estadisticaTiempoNivel,
} from '../estadisticas/imprescindibles';
import { esquemaDatosMapaCalor, esquemaDatosReintentos, estadisticaMapaCalor, estadisticaReintentos } from '../estadisticas/mapaCalorReintentos';
import { adminAutenticado, crearAutenticarAdmin, verificarAccesoJuego } from '../middlewares/autenticarAdmin';
import { JuegoModelo } from '../modelos';
import { refEsquema, type RutasOpenApi } from '../openapi/registro';

// GET /estadisticas/:juegoId/<métrica> (ESQUEMA_EVENTOS.md §7.2 y §10).
// Todas: JWT, acceso al juego, filtros comunes (incluido origen) y respuesta
// `{ juegoId, filtros, datos }`.

export interface DefinicionEstadistica {
  ruta: string;
  resumen: string;
  pregunta: string;
  seccion: string;
  esquemaDatos: z.ZodType;
  // Esquema de la query: los filtros comunes, o una extensión con parámetros propios.
  consulta?: z.ZodType<FiltrosEstadisticas>;
  parametrosExtra?: Record<string, unknown>[];
  calcular: (ctx: ContextoEstadistica) => Promise<unknown>;
}

export const ESTADISTICAS: DefinicionEstadistica[] = [
  { ruta: 'sesiones', resumen: 'Sesiones y duración', pregunta: '¿Cuánto juega la gente comparado con lo esperado?', seccion: '10.1', esquemaDatos: esquemaDatosSesiones, calcular: estadisticaSesiones },
  { ruta: 'tiempo-nivel', resumen: 'Tiempo por nivel (por intento)', pregunta: '¿Qué nivel está largo o confuso?', seccion: '10.2', esquemaDatos: esquemaDatosTiempoNivel, calcular: estadisticaTiempoNivel },
  { ruta: 'embudo', resumen: 'Embudo de progresión', pregunta: '¿Dónde se pierde la gente?', seccion: '10.3', esquemaDatos: esquemaDatosEmbudo, calcular: estadisticaEmbudo },
  { ruta: 'muertes', resumen: 'Muertes por nivel y causa', pregunta: '¿Qué está injusto o mal diseñado?', seccion: '10.4', esquemaDatos: esquemaDatosMuertes, calcular: estadisticaMuertes },
  { ruta: 'logros', resumen: 'Logros (% de jugadores)', pregunta: '¿Qué es muy fácil o muy difícil?', seccion: '10.5', esquemaDatos: esquemaDatosLogros, calcular: estadisticaLogros },
  {
    ruta: 'mapa-calor',
    resumen: 'Mapa de calor de muertes de un nivel',
    pregunta: '¿En qué punto exacto fallan?',
    seccion: '10.6',
    esquemaDatos: esquemaDatosMapaCalor,
    consulta: esquemaFiltrosMapaCalor,
    parametrosExtra: [
      { name: 'nivelId', in: 'query', required: true, description: 'Nivel del catálogo.', schema: { type: 'string' } },
      { name: 'celda', in: 'query', description: 'Tamaño de celda en unidades de mundo (> 0, máx. 1000).', schema: { type: 'number', default: 1 } },
    ],
    calcular: (ctx) => estadisticaMapaCalor(ctx as ContextoEstadistica<FiltrosMapaCalor>),
  },
  { ruta: 'reintentos', resumen: 'Reintentos por nivel', pregunta: '¿Dónde se frustran antes de pasar o rendirse?', seccion: '10.7', esquemaDatos: esquemaDatosReintentos, calcular: estadisticaReintentos },
];

// Eco de los filtros aplicados: los comunes siempre (null si no se usaron) y los extras de la ruta.
function filtrosRespuesta(f: FiltrosEstadisticas) {
  return { desde: null, hasta: null, buildVersion: null, plataforma: null, ...f };
}

export function crearRutasEstadisticas(jwtSecret: string, definiciones: DefinicionEstadistica[] = ESTADISTICAS): Router {
  const router = Router();
  const autenticar = crearAutenticarAdmin(jwtSecret);

  for (const def of definiciones) {
    router.get(`/estadisticas/:juegoId/${def.ruta}`, autenticar, async (req, res) => {
      const params = esquemaParamsJuego.safeParse(req.params);
      if (!params.success) {
        throw new AppError(400, 'VALIDACION_FALLIDA', 'El juegoId no es válido.', params.error.issues.map((i) => describirIssue(i)));
      }
      const { juegoId } = params.data;
      verificarAccesoJuego(adminAutenticado(res), juegoId);
      const filtros = (def.consulta ?? esquemaFiltrosEstadisticas).safeParse(req.query);
      if (!filtros.success) {
        throw new AppError(400, 'VALIDACION_FALLIDA', 'Los filtros no son válidos.', filtros.error.issues.map((i) => describirIssue(i)));
      }
      const juego = await JuegoModelo.findOne({ juegoId }, { catalogo: 1 }).lean();
      if (!juego) {
        throw new AppError(404, 'JUEGO_NO_ENCONTRADO', 'El juego no existe.');
      }
      const ctx: ContextoEstadistica = { juegoId, catalogo: esquemaCatalogo.parse(juego.catalogo), filtros: filtros.data, ahora: new Date() };
      res.json({ juegoId, filtros: filtrosRespuesta(filtros.data), datos: await def.calcular(ctx) });
    });
  }
  return router;
}

// ---------- OpenAPI ----------

const parametrosFiltros = [
  { name: 'juegoId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  { name: 'desde', in: 'query', description: 'Inicio del rango (ISO 8601 UTC, incluido).', schema: { type: 'string', format: 'date-time' } },
  { name: 'hasta', in: 'query', description: 'Fin del rango (ISO 8601 UTC, excluido).', schema: { type: 'string', format: 'date-time' } },
  { name: 'buildVersion', in: 'query', schema: { type: 'string' } },
  { name: 'plataforma', in: 'query', schema: { type: 'string', enum: [...PLATAFORMAS] } },
  { name: 'origen', in: 'query', description: 'real (ingesta), seed (datos de prueba) o todos.', schema: { type: 'string', enum: [...ORIGENES_FILTRO], default: 'todos' } },
];

const error = (descripcion: string) => ({ description: descripcion, content: { 'application/json': { schema: refEsquema(esquemaRespuestaError) } } });

export function openApiEstadisticas(definiciones: DefinicionEstadistica[] = ESTADISTICAS): RutasOpenApi {
  return Object.fromEntries(
    definiciones.map((def) => [
      `/estadisticas/{juegoId}/${def.ruta}`,
      {
        get: {
          tags: ['Estadísticas'],
          summary: def.resumen,
          description: `${def.pregunta} Ver docs/ESQUEMA_EVENTOS.md §${def.seccion}.`,
          security: [{ BearerAuth: [] }],
          parameters: [...parametrosFiltros, ...(def.parametrosExtra ?? [])],
          responses: {
            '200': {
              description: 'Resultado con los filtros aplicados.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['juegoId', 'filtros', 'datos'],
                    properties: {
                      juegoId: { type: 'string', format: 'uuid' },
                      filtros: {
                        type: 'object',
                        properties: {
                          desde: { type: ['string', 'null'] },
                          hasta: { type: ['string', 'null'] },
                          buildVersion: { type: ['string', 'null'] },
                          plataforma: { type: ['string', 'null'] },
                          origen: { type: 'string', enum: [...ORIGENES_FILTRO] },
                        },
                      },
                      datos: refEsquema(def.esquemaDatos),
                    },
                  },
                },
              },
            },
            '400': error('VALIDACION_FALLIDA: juegoId o filtros inválidos.'),
            '401': error('NO_AUTENTICADO'),
            '403': error('SIN_PERMISO'),
            '404': error('JUEGO_NO_ENCONTRADO'),
          },
        },
      },
    ]),
  );
}
