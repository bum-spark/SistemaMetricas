import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errores';

export const rutaNoEncontrada: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'RUTA_NO_ENCONTRADA', `No existe la ruta ${req.method} ${req.path}.`));
};

// Errores que lanza el parser de JSON de Express (body-parser).
function esErrorDeParser(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

function traducir(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  if (esErrorDeParser(err)) {
    if (err.type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_DEMASIADO_GRANDE', 'El body supera el tamaño máximo de 100 KB.');
    }
    if (err.type === 'entity.parse.failed') {
      return new AppError(400, 'VALIDACION_FALLIDA', 'El body no es JSON válido.');
    }
  }
  return new AppError(500, 'ERROR_INTERNO', 'Ocurrió un error inesperado.');
}

export function crearManejadorErrores(opciones: { registrar: (err: unknown) => void }): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const error = traducir(err);
    if (error.status >= 500) {
      opciones.registrar(err);
    }
    res.status(error.status).json(error.aRespuesta());
  };
}
