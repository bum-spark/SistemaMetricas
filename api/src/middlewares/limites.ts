import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../config';
import { AppError } from '../errores';
import { hashApiKey } from '../seguridad/apiKey';

// Rate limits (ESQUEMA_EVENTOS.md §1.5). Contadores en memoria por instancia: si la API
// escala a varias instancias hay que pasarlos a Redis (ARQUITECTURA.md, "Cómo crece").
// La IP solo se usa en memoria para contar; no se guarda.

const VENTANA_MS = 60_000;

const responder429: Parameters<typeof rateLimit>[0] = {
  windowMs: VENTANA_MS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(new AppError(429, 'LIMITE_EXCEDIDO', 'Demasiadas peticiones; espera un momento y reintenta.').aRespuesta());
  },
};

export interface Limitadores {
  ingestaPorIp: RequestHandler;
  ingestaPorKey: RequestHandler;
  publicoPorIp: RequestHandler;
  loginPorIp: RequestHandler;
  invitacionPorIp: RequestHandler;
}

export function crearLimitadores(config: Config): Limitadores {
  return {
    // Varios jugadores pueden compartir IP (redes de la universidad): límite alto (R-10).
    ingestaPorIp: rateLimit({ ...responder429, limit: config.limites.ingestaPorIp }),
    // La key la comparten todos los jugadores de un juego: tope alto contra keys filtradas o bucles (R-05).
    ingestaPorKey: rateLimit({
      ...responder429,
      limit: config.limites.ingestaPorKey,
      keyGenerator: (req) => `key:${hashApiKey(req.get('X-Api-Key') ?? '')}`,
      skip: (req) => !req.get('X-Api-Key'),
    }),
    // /salud y /docs: límite laxo (S-26).
    publicoPorIp: rateLimit({ ...responder429, limit: config.limites.publicoPorIp }),
    // Login: intentos FALLIDOS por IP en 15 min (S-18); los exitosos no cuentan.
    loginPorIp: rateLimit({
      ...responder429,
      windowMs: 15 * 60_000,
      limit: config.limites.loginPorIp,
      skipSuccessfulRequests: true,
    }),
    // Validar y aceptar invitaciones: TODOS los intentos por IP en 15 min (S-67), contra
    // quien pruebe tokens al azar.
    invitacionPorIp: rateLimit({
      ...responder429,
      windowMs: 15 * 60_000,
      limit: config.limites.invitacionPorIp,
    }),
  };
}
