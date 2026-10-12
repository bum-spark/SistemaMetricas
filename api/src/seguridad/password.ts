import bcrypt from 'bcryptjs';

// Contraseñas de admin con bcrypt (CLAUDE.md §5).
export const RONDAS_BCRYPT = 12;
export const LONGITUD_MINIMA_PASSWORD = 12;

export function problemaDePassword(password: string): string | null {
  if (password.length < LONGITUD_MINIMA_PASSWORD) {
    return `la contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, RONDAS_BCRYPT);
}

export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
