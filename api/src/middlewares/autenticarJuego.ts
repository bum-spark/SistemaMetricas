import type { RequestHandler, Response } from 'express';
import { esquemaCatalogo, type Catalogo } from '../dominio/catalogo';
import { AppError } from '../errores';
import { JuegoModelo } from '../modelos';
import { hashApiKey } from '../seguridad/apiKey';

export interface JuegoAutenticado {
  juegoId: string;
  slug: string;
  catalogo: Catalogo;
}

// Identifica el juego por la API key del header X-Api-Key (se busca por su SHA-256).
// Una key inexistente, revocada (hash null) o de un juego inactivo da 401.
export const autenticarJuego: RequestHandler = async (req, res, next) => {
  const apiKey = req.get('X-Api-Key');
  if (!apiKey) {
    throw new AppError(401, 'API_KEY_INVALIDA', 'Falta el header X-Api-Key.');
  }
  const juego = await JuegoModelo.findOne({ apiKeyHash: hashApiKey(apiKey), activo: true }, { juegoId: 1, slug: 1, catalogo: 1 }).lean();
  if (!juego) {
    throw new AppError(401, 'API_KEY_INVALIDA', 'La API key no es válida o fue revocada.');
  }
  const autenticado: JuegoAutenticado = {
    juegoId: juego.juegoId,
    slug: juego.slug,
    catalogo: esquemaCatalogo.parse(juego.catalogo),
  };
  res.locals.juego = autenticado;
  next();
};

export function juegoAutenticado(res: Response): JuegoAutenticado {
  const juego = res.locals.juego as JuegoAutenticado | undefined;
  if (!juego) {
    throw new Error('autenticarJuego debe ejecutarse antes de esta ruta.');
  }
  return juego;
}
