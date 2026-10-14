import type { RequestHandler, Response } from 'express';
import { AppError } from '../errores';
import { AdminModelo } from '../modelos';
import { rolDe, type Rol } from '../modelos/admin';
import { verificarToken } from '../seguridad/jwt';

export interface AdminAutenticado {
  email: string;
  nombre: string;
  rol: Rol;
  juegosPermitidos: string[];
}

// Rutas del dashboard: `Authorization: Bearer <JWT>`. El usuario se relee de la base en cada
// petición (activo, rol y juegosPermitidos al día, S-42). Un token emitido antes del último
// cambio de contraseña ya no sirve (S-67).
export function crearAutenticarAdmin(jwtSecret: string): RequestHandler {
  return async (req, res, next) => {
    const encabezado = req.get('Authorization') ?? '';
    const [esquema, token] = encabezado.split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw new AppError(401, 'NO_AUTENTICADO', 'Falta el token: usa el header Authorization: Bearer <token>.');
    }
    const resultado = verificarToken(token, jwtSecret);
    if (!resultado.ok) {
      throw new AppError(
        401,
        'NO_AUTENTICADO',
        resultado.motivo === 'expirado' ? 'La sesión expiró; vuelve a iniciar sesión.' : 'El token no es válido.',
      );
    }
    const admin = await AdminModelo.findOne(
      { email: resultado.email, activo: true },
      { email: 1, nombre: 1, rol: 1, juegosPermitidos: 1, passwordHash: 1, passwordCambiadaEn: 1 },
    ).lean();
    if (!admin?.passwordHash) {
      throw new AppError(401, 'NO_AUTENTICADO', 'El usuario no existe o está desactivado.');
    }
    // iat va en segundos: un token del mismo segundo que el cambio sigue valiendo.
    if (admin.passwordCambiadaEn && resultado.emitidoEn < Math.floor(admin.passwordCambiadaEn.getTime() / 1000)) {
      throw new AppError(401, 'NO_AUTENTICADO', 'La contraseña cambió; vuelve a iniciar sesión.');
    }
    const autenticado: AdminAutenticado = {
      email: admin.email,
      nombre: admin.nombre,
      rol: rolDe(admin),
      juegosPermitidos: admin.juegosPermitidos,
    };
    res.locals.admin = autenticado;
    next();
  };
}

export function adminAutenticado(res: Response): AdminAutenticado {
  const admin = res.locals.admin as AdminAutenticado | undefined;
  if (!admin) {
    throw new Error('autenticarAdmin debe ejecutarse antes de esta ruta.');
  }
  return admin;
}

// Solo rol admin (S-67): un invitado es de solo lectura sobre sus juegos.
export const exigirRolAdmin: RequestHandler = (_req, res, next) => {
  if (adminAutenticado(res).rol !== 'admin') {
    throw new AppError(403, 'SIN_PERMISO', 'Esta acción es solo para admins.');
  }
  next();
};

export function verificarAccesoJuego(admin: AdminAutenticado, juegoId: string): void {
  if (!admin.juegosPermitidos.includes(juegoId)) {
    throw new AppError(403, 'SIN_PERMISO', 'No tienes acceso a este juego.');
  }
}
