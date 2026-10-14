import { z } from 'zod';
import { uuidV4 } from '../admin/esquemas';
import { registrarEsquema } from '../openapi/registro';

// Invitados del dashboard (ESQUEMA_EVENTOS.md §7.3, S-67).

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'no es un correo válido');

// Al menos uno (para quitarle todo el acceso, se desactiva). Los repetidos se quitan en el
// servicio (un transform no se puede publicar en OpenAPI).
const juegos = z.array(uuidV4).min(1, 'asigna al menos un juego').max(100);

export const ESTADOS_INVITADO = ['pendiente', 'activo', 'desactivado'] as const;

export const esquemaSolicitudInvitado = registrarEsquema(
  'SolicitudInvitado',
  z.strictObject({ email, nombre: z.string().trim().max(100).optional(), juegos }),
);

export const esquemaActualizacionInvitado = registrarEsquema(
  'ActualizacionInvitado',
  z
    .strictObject({ juegos: juegos.optional(), activo: z.boolean().optional() })
    .refine((c) => c.juegos !== undefined || c.activo !== undefined, 'indica juegos o activo'),
);

export const esquemaParamsInvitado = z.object({ email });

export const esquemaInvitado = registrarEsquema(
  'Invitado',
  z.object({
    email: z.string(),
    nombre: z.string(),
    // desactivado > pendiente (sin contraseña) > activo.
    estado: z.enum(ESTADOS_INVITADO),
    juegos: z.array(uuidV4),
    invitadoPor: z.string().nullable(),
    invitadoEn: z.iso.datetime().nullable(),
    ultimoAcceso: z.iso.datetime().nullable(),
    // Vencimiento del enlace vigente; null si ya se usó, venció o se invalidó. Nunca el enlace.
    enlaceExpiraEn: z.iso.datetime().nullable(),
  }),
);

export const esquemaListaInvitados = registrarEsquema(
  'ListaInvitados',
  z.object({ datos: z.array(esquemaInvitado), pagina: z.number().int(), limite: z.number().int(), total: z.number().int() }),
);

// El enlace se responde UNA sola vez (al invitar o restablecer); no se puede volver a consultar.
export const esquemaInvitacionEmitida = registrarEsquema(
  'InvitacionEmitida',
  z.object({ invitado: esquemaInvitado, enlace: z.string(), expiraEn: z.iso.datetime() }),
);

export const esquemaInvitacionValida = registrarEsquema(
  'InvitacionValida',
  z.object({ email: z.string(), nombre: z.string(), expiraEn: z.iso.datetime() }),
);

export const esquemaSolicitudAceptarInvitacion = registrarEsquema(
  'SolicitudAceptarInvitacion',
  z.strictObject({ token: z.string().max(200), password: z.string().max(200) }),
);

export const esquemaInvitacionAceptada = registrarEsquema('InvitacionAceptada', z.object({ email: z.string() }));
