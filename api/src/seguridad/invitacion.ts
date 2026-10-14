import { createHash, randomBytes } from 'node:crypto';

// Enlace de invitación (S-67): 32 bytes aleatorios en base64url, de un solo uso y con
// vigencia de 72 h. Solo se guarda su SHA-256 (como las API keys: es largo y aleatorio, así
// que no hace falta bcrypt y se puede buscar por índice). El token va en el FRAGMENTO del
// enlace (#token=…), que el navegador no manda al servidor ni deja en los logs de acceso.

export const VIGENCIA_INVITACION_MS = 72 * 60 * 60 * 1000;
export const PATRON_TOKEN_INVITACION = /^[A-Za-z0-9_-]{43}$/;

export function generarTokenInvitacion(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTokenInvitacion(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function enlaceInvitacion(dashboardUrl: string, token: string): string {
  return `${dashboardUrl}/invitacion#token=${token}`;
}
