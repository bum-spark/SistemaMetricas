import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Config } from './config';
import './dominio/zodEs';
import { crearLimitadores } from './middlewares/limites';
import { crearManejadorErrores, rutaNoEncontrada } from './middlewares/manejoErrores';
import { crearDocumentoOpenApi } from './openapi/documento';
import { crearRutasIngesta } from './rutas/ingesta';
import { crearRutasSalud } from './rutas/salud';

export interface OpcionesApp {
  registrarError?: (err: unknown) => void;
}

export function crearApp(config: Config, opciones: OpcionesApp = {}): Express {
  const app = express();
  const registrarError = opciones.registrarError ?? ((err: unknown) => console.error(err));

  app.disable('x-powered-by');
  // IP real del jugador detrás del proxy del hosting (R-05, S-23).
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigenes }));
  app.use(express.json({ limit: '100kb' }));

  const limitadores = crearLimitadores(config);
  const v1 = express.Router();
  v1.use(['/salud', '/docs'], limitadores.publicoPorIp);
  v1.use(crearRutasSalud());
  v1.use(crearRutasIngesta(limitadores));

  const documento = crearDocumentoOpenApi(config);
  v1.get('/docs/openapi.json', (_req, res) => {
    res.json(documento);
  });
  v1.use('/docs', swaggerUi.serve, swaggerUi.setup(documento));

  app.use('/api/v1', v1);
  app.use(rutaNoEncontrada);
  app.use(crearManejadorErrores({ registrar: registrarError }));

  return app;
}
