import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Config } from './config';
import { crearManejadorErrores, rutaNoEncontrada } from './middlewares/manejoErrores';
import { crearDocumentoOpenApi } from './openapi/documento';
import { crearRutasSalud } from './rutas/salud';

export interface OpcionesApp {
  registrarError?: (err: unknown) => void;
}

export function crearApp(config: Config, opciones: OpcionesApp = {}): Express {
  const app = express();
  const registrarError = opciones.registrarError ?? ((err: unknown) => console.error(err));

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigenes }));
  app.use(express.json({ limit: '100kb' }));

  const v1 = express.Router();
  v1.use(crearRutasSalud());

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
