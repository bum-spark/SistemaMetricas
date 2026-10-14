import { model, Schema, type InferSchemaType } from 'mongoose';
import { PATRON_UUID_V4 } from '../dominio/constantes';
import { opcionesEsquema } from './comun';

export const ROLES = ['admin', 'invitado'] as const;
export type Rol = (typeof ROLES)[number];

// Usuarios del dashboard. `rol`: "admin" o "invitado" (S-67); los documentos sin `rol`
// (creados antes de los invitados) cuentan como admin, sin migración.
// Un invitado se crea sin contraseña (pendiente) y la pone con el enlace de invitación.
const esquemaAdmin = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    rol: { type: String, enum: ROLES },
    // null = invitación pendiente (todavía no crea su contraseña).
    passwordHash: { type: String, default: null },
    nombre: { type: String, trim: true, default: '' },
    juegosPermitidos: {
      type: [{ type: String, match: [PATRON_UUID_V4, 'juegosPermitidos debe contener UUID v4'] }],
      default: [],
    },
    activo: { type: Boolean, default: true },
    creadoEn: { type: Date, default: () => new Date() },
    ultimoLogin: { type: Date, default: null },
    // Invitación: quién y cuándo, y el enlace vigente (solo su SHA-256).
    invitadoPor: { type: String, default: null },
    invitadoEn: { type: Date, default: null },
    tokenInvitacionHash: { type: String, default: null },
    tokenInvitacionExpiraEn: { type: Date, default: null },
    // Los JWT emitidos antes de esta fecha dejan de servir (al crear o cambiar la contraseña).
    passwordCambiadaEn: { type: Date, default: null },
  },
  opcionesEsquema('admins', ['passwordHash', 'tokenInvitacionHash']),
);

esquemaAdmin.index(
  { tokenInvitacionHash: 1 },
  { unique: true, partialFilterExpression: { tokenInvitacionHash: { $type: 'string' } } },
);

export type Admin = InferSchemaType<typeof esquemaAdmin>;
export const AdminModelo = model('Admin', esquemaAdmin);

export function rolDe(admin: { rol?: string | null }): Rol {
  return admin.rol === 'invitado' ? 'invitado' : 'admin';
}

// Admins activos (no invitados): reciben acceso a cada juego nuevo. Un invitado solo ve los
// juegos que un admin le asigna (S-67).
export const FILTRO_ADMINS_ACTIVOS = { activo: true, rol: { $ne: 'invitado' as const } };
