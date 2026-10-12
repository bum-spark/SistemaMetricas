import type { Config } from '../config';
import { openApiIngesta } from '../rutas/ingesta';
import { openApiSalud } from '../rutas/salud';
import { generarComponentes, type RutasOpenApi } from './registro';
// Registra el esquema de error aunque ninguna ruta lo importe todavía.
import '../errores';

// Cada módulo de rutas agrega aquí su fragmento de `paths`.
const fragmentos: RutasOpenApi[] = [openApiSalud, openApiIngesta];

export function crearDocumentoOpenApi(config: Config): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: `API de métricas — ${config.appName}`,
      version: '1.0.0',
      description:
        'Ingesta de eventos de los juegos y estadísticas para el dashboard. ' +
        'El contrato completo está en docs/ESQUEMA_EVENTOS.md.',
    },
    servers: [{ url: '/api/v1' }],
    paths: Object.assign({}, ...fragmentos) as RutasOpenApi,
    components: {
      schemas: generarComponentes(),
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key', description: 'API key del juego (una por juego).' },
      },
    },
  };
}
