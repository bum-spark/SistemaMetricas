import jwt from 'jsonwebtoken';

// JWT del dashboard (CLAUDE.md §5). HS256 con JWT_SECRET; expira en 8 h (S-13).
// El token solo lleva el email (`sub`): permisos y estado del admin se releen de la base en
// cada petición, así desactivar un admin o quitarle un juego surte efecto al instante (S-42).

export const DURACION_TOKEN_S = 8 * 60 * 60;
const EMISOR = 'xolos-analytics-api';

export interface TokenFirmado {
  token: string;
  expiraEn: string;
}

export function firmarToken(email: string, secreto: string, ahora = new Date()): TokenFirmado {
  const iat = Math.floor(ahora.getTime() / 1000);
  const token = jwt.sign({ iat }, secreto, {
    algorithm: 'HS256',
    subject: email,
    issuer: EMISOR,
    expiresIn: DURACION_TOKEN_S,
  });
  return { token, expiraEn: new Date((iat + DURACION_TOKEN_S) * 1000).toISOString() };
}

// `emitidoEn`: `iat` en segundos (para invalidar tokens anteriores a un cambio de contraseña).
export type ResultadoToken = { ok: true; email: string; emitidoEn: number } | { ok: false; motivo: 'expirado' | 'invalido' };

export function verificarToken(token: string, secreto: string): ResultadoToken {
  try {
    // Algoritmo fijo: evita que un token con "alg": "none" u otro algoritmo pase.
    const carga = jwt.verify(token, secreto, { algorithms: ['HS256'], issuer: EMISOR });
    if (typeof carga === 'string' || typeof carga.sub !== 'string' || typeof carga.iat !== 'number') {
      return { ok: false, motivo: 'invalido' };
    }
    return { ok: true, email: carga.sub, emitidoEn: carga.iat };
  } catch (err) {
    return { ok: false, motivo: err instanceof jwt.TokenExpiredError ? 'expirado' : 'invalido' };
  }
}
