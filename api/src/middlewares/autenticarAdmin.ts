import type { RequestHandler, Response } from 'express';
import { AppError } from '../errores';
import { AdminModelo } from '../modelos';
import { verificarToken } from '../seguridad/jwt';

export interface AdminAutenticado {
  email: string;
  nombre: string;
  juegosPermitidos: string[];
}

// Rutas del dashboard: `Authorization: Bearer <JWT>`. El admin se relee de la base en cada
// petición (activo y juegosPermitidos al día, S-42).
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
    const admin = await AdminModelo.findOne({ email: resultado.email, activo: true }, { email: 1, nombre: 1, juegosPermitidos: 1 }).lean();
    if (!admin) {
      throw new AppError(401, 'NO_AUTENTICADO', 'El admin no existe o está desactivado.');
    }
    const autenticado: AdminAutenticado = { email: admin.email, nombre: admin.nombre, juegosPermitidos: admin.juegosPermitidos };
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

export function verificarAccesoJuego(admin: AdminAutenticado, juegoId: string): void {
  if (!admin.juegosPermitidos.includes(juegoId)) {
    throw new AppError(403, 'SIN_PERMISO', 'No tienes acceso a este juego.');
  }
}
