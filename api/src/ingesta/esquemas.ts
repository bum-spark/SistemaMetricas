import { z } from 'zod';
import { CODIGOS_RECHAZO } from '../dominio/eventos';
import { PATRON_UUID_V4, PLATAFORMAS } from '../dominio/constantes';
import { registrarEsquema } from '../openapi/registro';

// Cuerpos y respuestas de la ingesta (ESQUEMA_EVENTOS.md §7.1).

const uuidV4 = z.string().regex(PATRON_UUID_V4, 'debe ser un UUID v4');

export const MAX_EVENTOS_POR_LOTE = 100;

export const esquemaSolicitudSesion = registrarEsquema(
  'SolicitudSesion',
  z.strictObject({
    juegoId: uuidV4,
    playerId: uuidV4,
    buildVersion: z.string().min(1).max(32),
    plataforma: z.enum(PLATAFORMAS),
    consentimiento: z.boolean(),
  }),
);
export type SolicitudSesion = z.infer<typeof esquemaSolicitudSesion>;

export const esquemaSesionCreada = registrarEsquema('SesionCreada', z.object({ sessionId: uuidV4 }));

export const esquemaSesionSinConsentimiento = registrarEsquema(
  'SesionSinConsentimiento',
  z.object({ sessionId: z.null(), consentimiento: z.literal(false) }),
);

export const esquemaRespuestaEventos = registrarEsquema(
  'RespuestaEventos',
  z.object({
    aceptados: z.number().int().min(0),
    rechazados: z.array(
      z.object({
        indice: z.number().int().min(0),
        codigo: z.enum(CODIGOS_RECHAZO),
        mensaje: z.string(),
      }),
    ),
  }),
);
