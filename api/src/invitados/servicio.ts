import type { z } from 'zod';
import { AppError } from '../errores';
import type { AdminAutenticado } from '../middlewares/autenticarAdmin';
import { AdminModelo, JuegoModelo } from '../modelos';
import { hashPassword, problemaDePassword } from '../seguridad/password';
import {
  enlaceInvitacion,
  generarTokenInvitacion,
  hashTokenInvitacion,
  PATRON_TOKEN_INVITACION,
  VIGENCIA_INVITACION_MS,
} from '../seguridad/invitacion';
import type { esquemaInvitado } from './esquemas';

// Invitados del dashboard (S-67). Solo un admin los gestiona; estas funciones solo ven
// documentos con rol "invitado" (un admin, con o sin campo rol, no aparece ni se modifica).

type Invitado = z.infer<typeof esquemaInvitado>;

interface DocInvitado {
  email: string;
  nombre: string;
  passwordHash?: string | null;
  juegosPermitidos: string[];
  activo: boolean;
  ultimoLogin?: Date | null;
  invitadoPor?: string | null;
  invitadoEn?: Date | null;
  tokenInvitacionExpiraEn?: Date | null;
}

const SOLO_INVITADOS = { rol: 'invitado' } as const;

// Mismo error para token inexistente, con formato inválido, vencido, ya usado, invalidado o de
// una cuenta desactivada: no se revela cuál fue.
const invitacionInvalida = () =>
  new AppError(400, 'INVITACION_INVALIDA', 'El enlace no es válido o ya venció. Pide uno nuevo a quien te invitó.');

function aRespuesta(doc: DocInvitado, ahora: Date): Invitado {
  const expira = doc.tokenInvitacionExpiraEn;
  return {
    email: doc.email,
    nombre: doc.nombre,
    estado: !doc.activo ? 'desactivado' : doc.passwordHash ? 'activo' : 'pendiente',
    juegos: doc.juegosPermitidos,
    invitadoPor: doc.invitadoPor ?? null,
    invitadoEn: doc.invitadoEn?.toISOString() ?? null,
    ultimoAcceso: doc.ultimoLogin?.toISOString() ?? null,
    enlaceExpiraEn: expira && expira > ahora ? expira.toISOString() : null,
  };
}

// El admin solo asigna juegos que él mismo tiene, y que existen.
async function verificarJuegosAsignables(admin: AdminAutenticado, juegos: string[]): Promise<void> {
  const ajenos = juegos.filter((id) => !admin.juegosPermitidos.includes(id));
  if (ajenos.length > 0) {
    throw new AppError(403, 'SIN_PERMISO', 'Solo puedes asignar juegos a los que tienes acceso.', ajenos.map((id) => `juegos: sin acceso a ${id}`));
  }
  const existentes = await JuegoModelo.find({ juegoId: { $in: juegos } }, { juegoId: 1 }).lean();
  const faltantes = juegos.filter((id) => !existentes.some((j) => j.juegoId === id));
  if (faltantes.length > 0) {
    throw new AppError(400, 'VALIDACION_FALLIDA', 'Algunos juegos no existen.', faltantes.map((id) => `juegos: no existe ${id}`));
  }
}

function nuevoEnlace(dashboardUrl: string, ahora: Date) {
  const token = generarTokenInvitacion();
  const expiraEn = new Date(ahora.getTime() + VIGENCIA_INVITACION_MS);
  return {
    enlace: enlaceInvitacion(dashboardUrl, token),
    expiraEn,
    campos: { tokenInvitacionHash: hashTokenInvitacion(token), tokenInvitacionExpiraEn: expiraEn },
  };
}

// Busca un invitado sobre el que el admin puede actuar: nunca sobre sí mismo ni sobre un admin.
async function buscarInvitado(admin: AdminAutenticado, email: string): Promise<DocInvitado> {
  if (email === admin.email) {
    throw new AppError(403, 'SIN_PERMISO', 'No puedes modificar tu propia cuenta desde aquí.');
  }
  const doc = await AdminModelo.findOne({ email, ...SOLO_INVITADOS }).lean();
  if (!doc) {
    throw new AppError(404, 'INVITADO_NO_ENCONTRADO', 'No existe un invitado con ese correo.');
  }
  return doc;
}

export async function invitar(
  admin: AdminAutenticado,
  datos: { email: string; nombre?: string | undefined; juegos: string[] },
  dashboardUrl: string,
  ahora = new Date(),
) {
  const juegos = [...new Set(datos.juegos)];
  await verificarJuegosAsignables(admin, juegos);
  if (await AdminModelo.exists({ email: datos.email })) {
    throw new AppError(409, 'CORREO_YA_REGISTRADO', 'Ya existe un usuario con ese correo.');
  }
  const { enlace, expiraEn, campos } = nuevoEnlace(dashboardUrl, ahora);
  try {
    const doc = await AdminModelo.create({
      email: datos.email,
      rol: 'invitado',
      nombre: datos.nombre ?? '',
      passwordHash: null,
      juegosPermitidos: juegos,
      invitadoPor: admin.email,
      invitadoEn: ahora,
      ...campos,
    });
    return { invitado: aRespuesta(doc.toObject(), ahora), enlace, expiraEn: expiraEn.toISOString() };
  } catch (err) {
    // Dos invitaciones simultáneas al mismo correo: la segunda choca con el índice único.
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'CORREO_YA_REGISTRADO', 'Ya existe un usuario con ese correo.');
    }
    throw err;
  }
}

export async function listarInvitados(pagina: number, limite: number, ahora = new Date()) {
  const [total, docs] = await Promise.all([
    AdminModelo.countDocuments(SOLO_INVITADOS),
    AdminModelo.find(SOLO_INVITADOS).sort({ invitadoEn: -1, email: 1 }).skip((pagina - 1) * limite).limit(limite).lean(),
  ]);
  return { datos: docs.map((d) => aRespuesta(d, ahora)), pagina, limite, total };
}

export async function actualizarInvitado(
  admin: AdminAutenticado,
  email: string,
  cambios: { juegos?: string[] | undefined; activo?: boolean | undefined },
  ahora = new Date(),
): Promise<Invitado> {
  const doc = await buscarInvitado(admin, email);
  const set: Record<string, unknown> = {};
  if (cambios.juegos !== undefined) {
    const pedidos = [...new Set(cambios.juegos)];
    await verificarJuegosAsignables(admin, pedidos);
    // Los juegos que el admin no tiene (los asignó otro admin) se conservan: no puede quitar
    // lo que no puede ver.
    const ajenos = doc.juegosPermitidos.filter((id) => !admin.juegosPermitidos.includes(id));
    set.juegosPermitidos = [...new Set([...pedidos, ...ajenos])];
  }
  if (cambios.activo === false) {
    // Desactivar corta al instante su sesión (el JWT se relee en cada petición) y su enlace:
    // si se reactiva, el enlace viejo no revive.
    Object.assign(set, { activo: false, tokenInvitacionHash: null, tokenInvitacionExpiraEn: null });
  } else if (cambios.activo === true) {
    set.activo = true;
  }
  const actualizado = await AdminModelo.findOneAndUpdate({ email, ...SOLO_INVITADOS }, { $set: set }, { returnDocument: 'after' }).lean();
  if (!actualizado) {
    throw new AppError(404, 'INVITADO_NO_ENCONTRADO', 'No existe un invitado con ese correo.');
  }
  return aRespuesta(actualizado, ahora);
}

// Genera un enlace nuevo y deja sin efecto el anterior (se sobrescribe su hash). La
// contraseña actual, si existe, sigue valiendo hasta que se use el enlace nuevo.
export async function restablecerInvitado(admin: AdminAutenticado, email: string, dashboardUrl: string, ahora = new Date()) {
  const doc = await buscarInvitado(admin, email);
  if (!doc.activo) {
    throw new AppError(409, 'INVITADO_DESACTIVADO', 'Activa al invitado antes de generar un enlace.');
  }
  const { enlace, expiraEn, campos } = nuevoEnlace(dashboardUrl, ahora);
  const actualizado = await AdminModelo.findOneAndUpdate(
    { email, activo: true, ...SOLO_INVITADOS },
    { $set: campos },
    { returnDocument: 'after' },
  ).lean();
  if (!actualizado) {
    throw new AppError(409, 'INVITADO_DESACTIVADO', 'Activa al invitado antes de generar un enlace.');
  }
  return { invitado: aRespuesta(actualizado, ahora), enlace, expiraEn: expiraEn.toISOString() };
}

// Condición de un enlace usable: el hash coincide, no venció y la cuenta sigue activa.
function filtroEnlaceVigente(token: string, ahora: Date) {
  return {
    ...SOLO_INVITADOS,
    tokenInvitacionHash: hashTokenInvitacion(token),
    tokenInvitacionExpiraEn: { $gt: ahora },
    activo: true,
  };
}

export async function validarInvitacion(token: string, ahora = new Date()) {
  if (!PATRON_TOKEN_INVITACION.test(token)) {
    throw invitacionInvalida();
  }
  const doc = await AdminModelo.findOne(filtroEnlaceVigente(token, ahora), { email: 1, nombre: 1, tokenInvitacionExpiraEn: 1 }).lean();
  if (!doc?.tokenInvitacionExpiraEn) {
    throw invitacionInvalida();
  }
  return { email: doc.email, nombre: doc.nombre, expiraEn: doc.tokenInvitacionExpiraEn.toISOString() };
}

// Crea (o reemplaza) la contraseña y consume el enlace en la MISMA operación atómica: dos
// peticiones simultáneas con el mismo token no pueden usarlo las dos.
export async function aceptarInvitacion(token: string, password: string, ahora = new Date()) {
  const problema = problemaDePassword(password);
  if (problema) {
    throw new AppError(400, 'VALIDACION_FALLIDA', 'La contraseña no es válida.', [`password: ${problema}`]);
  }
  // bcrypt antes de mirar el token: un token inválido tarda lo mismo que uno válido.
  const passwordHash = await hashPassword(password);
  if (!PATRON_TOKEN_INVITACION.test(token)) {
    throw invitacionInvalida();
  }
  const doc = await AdminModelo.findOneAndUpdate(
    filtroEnlaceVigente(token, ahora),
    { $set: { passwordHash, passwordCambiadaEn: ahora, tokenInvitacionHash: null, tokenInvitacionExpiraEn: null } },
    { returnDocument: 'after', projection: { email: 1 } },
  ).lean();
  if (!doc) {
    throw invitacionInvalida();
  }
  return { email: doc.email };
}
