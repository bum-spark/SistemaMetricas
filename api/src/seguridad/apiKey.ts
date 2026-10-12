import { createHash, randomBytes } from 'node:crypto';

// API key por juego (ESQUEMA_EVENTOS.md §8, S-19): "ak_" + 32 bytes aleatorios en base64url.
// Solo se guarda su SHA-256: la key es larga y aleatoria, así que no hace falta bcrypt
// y el hash se puede buscar por índice en cada petición de ingesta.

export const PREFIJO_API_KEY = 'ak_';

export function generarApiKey(): string {
  return `${PREFIJO_API_KEY}${randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}
