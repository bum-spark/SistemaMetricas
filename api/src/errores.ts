import { z } from 'zod';
import { registrarEsquema } from './openapi/registro';

// Formato uniforme de error (CLAUDE.md §6, ESQUEMA_EVENTOS.md §9).
export const esquemaRespuestaError = registrarEsquema(
  'Error',
  z.object({
    error: z.object({
      codigo: z.string(),
      mensaje: z.string(),
      detalles: z.array(z.unknown()),
    }),
  }),
);

export type RespuestaError = z.infer<typeof esquemaRespuestaError>;

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles: unknown[] = [],
  ) {
    super(mensaje);
    this.name = 'AppError';
  }

  aRespuesta(): RespuestaError {
    return { error: { codigo: this.codigo, mensaje: this.message, detalles: this.detalles } };
  }
}
