import { esquemaCatalogo } from '../dominio/catalogo';
import { AppError } from '../errores';
import type { AdminAutenticado } from '../middlewares/autenticarAdmin';
import { AdminModelo, EventoModelo, JuegoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../modelos';
import { firmarToken, type TokenFirmado } from '../seguridad/jwt';
import { hashPassword, verificarPassword } from '../seguridad/password';

// ---------- Login ----------

// Hash de una contraseña cualquiera para comparar cuando el email no existe: así la respuesta
// tarda lo mismo y no revela qué correos están registrados.
let hashFalso: Promise<string> | undefined;
const obtenerHashFalso = () => (hashFalso ??= hashPassword('contraseña-que-nunca-coincide'));

export async function iniciarSesion(email: string, password: string, jwtSecret: string): Promise<TokenFirmado & { admin: AdminAutenticado }> {
  const admin = await AdminModelo.findOne({ email: email.trim().toLowerCase() }).lean();
  const hash = admin?.passwordHash ?? (await obtenerHashFalso());
  const coincide = await verificarPassword(password, hash);
  if (!admin || !coincide || !admin.activo) {
    // Mismo mensaje para email inexistente, contraseña incorrecta o admin desactivado.
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');
  }
  await AdminModelo.updateOne({ email: admin.email }, { $set: { ultimoLogin: new Date() } });
  return {
    ...firmarToken(admin.email, jwtSecret),
    admin: { email: admin.email, nombre: admin.nombre, juegosPermitidos: admin.juegosPermitidos },
  };
}

// ---------- Juegos ----------

async function resumenDeJuego(juegoId: string, ultimoNivelId: string | undefined) {
  const [jugadores, sesiones, completaron] = await Promise.all([
    JugadorModelo.countDocuments({ juegoId }),
    SesionModelo.countDocuments({ juegoId }),
    ultimoNivelId === undefined
      ? Promise.resolve([] as string[])
      : EventoModelo.distinct('playerId', { juegoId, tipo: 'nivel_fin', 'data.nivelId': ultimoNivelId, 'data.resultado': 'completado' }),
  ]);
  return { jugadores, sesiones, tasaCompletado: jugadores === 0 ? 0 : Math.min(1, completaron.length / jugadores) };
}

export async function listarJuegos(admin: AdminAutenticado, pagina: number, limite: number) {
  const filtro = { juegoId: { $in: admin.juegosPermitidos } };
  const [total, juegos] = await Promise.all([
    JuegoModelo.countDocuments(filtro),
    JuegoModelo.find(filtro, { juegoId: 1, nombre: 1, slug: 1, versionActual: 1, activo: 1, catalogo: 1 })
      .sort({ nombre: 1 })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .lean(),
  ]);
  const datos = await Promise.all(
    juegos.map(async (j) => {
      const ultimo = [...j.catalogo.niveles].sort((a, b) => b.orden - a.orden)[0]?.nivelId;
      return {
        juegoId: j.juegoId,
        nombre: j.nombre,
        slug: j.slug,
        versionActual: j.versionActual,
        activo: j.activo,
        resumen: await resumenDeJuego(j.juegoId, ultimo),
      };
    }),
  );
  return { datos, pagina, limite, total };
}

export async function detalleJuego(juegoId: string) {
  const juego = await JuegoModelo.findOne({ juegoId }, { juegoId: 1, nombre: 1, slug: 1, versionActual: 1, activo: 1, catalogo: 1 }).lean();
  if (!juego) {
    throw new AppError(404, 'JUEGO_NO_ENCONTRADO', 'El juego no existe.');
  }
  const [buildVersions, plataformas] = await Promise.all([
    SesionModelo.distinct('buildVersion', { juegoId }),
    SesionModelo.distinct('plataforma', { juegoId }),
  ]);
  return {
    juegoId: juego.juegoId,
    nombre: juego.nombre,
    slug: juego.slug,
    versionActual: juego.versionActual,
    activo: juego.activo,
    catalogo: esquemaCatalogo.parse(juego.catalogo),
    filtros: { buildVersions: [...buildVersions].sort(), plataformas: [...plataformas].sort() },
  };
}

// ---------- Privacidad: borrado de un jugador ----------

// Elimina todo lo del jugador en ese juego (CLAUDE.md §5 Privacidad, ESQUEMA_EVENTOS.md §6).
export async function borrarJugador(juegoId: string, playerId: string) {
  const filtro = { juegoId, playerId };
  if (!(await JugadorModelo.exists(filtro))) {
    throw new AppError(404, 'JUGADOR_NO_ENCONTRADO', 'El jugador no existe en este juego.');
  }
  const logros = (await LogroObtenidoModelo.deleteMany(filtro)).deletedCount;
  const eventos = (await EventoModelo.deleteMany(filtro)).deletedCount;
  const sesiones = (await SesionModelo.deleteMany(filtro)).deletedCount;
  const jugador = (await JugadorModelo.deleteOne(filtro)).deletedCount;
  return { eliminados: { jugador, sesiones, eventos, logros } };
}
