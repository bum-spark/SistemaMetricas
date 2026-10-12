import { model, Schema, type InferSchemaType } from 'mongoose';
import { PATRON_UUID_V4 } from '../dominio/constantes';
import { opcionesEsquema } from './comun';

const esquemaAdmin = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    passwordHash: { type: String, required: true },
    nombre: { type: String, required: true, trim: true },
    juegosPermitidos: {
      type: [{ type: String, match: [PATRON_UUID_V4, 'juegosPermitidos debe contener UUID v4'] }],
      default: [],
    },
    activo: { type: Boolean, default: true },
    creadoEn: { type: Date, default: () => new Date() },
    ultimoLogin: { type: Date, default: null },
  },
  opcionesEsquema('admins', ['passwordHash']),
);

export type Admin = InferSchemaType<typeof esquemaAdmin>;
export const AdminModelo = model('Admin', esquemaAdmin);
