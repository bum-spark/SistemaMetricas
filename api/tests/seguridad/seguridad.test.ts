import { createHash } from 'node:crypto';
import { generarApiKey, hashApiKey } from '../../src/seguridad/apiKey';
import { hashPassword, problemaDePassword, verificarPassword } from '../../src/seguridad/password';

describe('API key', () => {
  it('tiene el formato ak_ + 32 bytes en base64url', () => {
    const key = generarApiKey();
    expect(key).toMatch(/^ak_[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(key.slice(3), 'base64url')).toHaveLength(32);
  });

  it('es distinta cada vez', () => {
    const keys = new Set(Array.from({ length: 50 }, generarApiKey));
    expect(keys.size).toBe(50);
  });

  it('se guarda como SHA-256 hexadecimal, sin la key en claro', () => {
    const key = generarApiKey();
    const hash = hashApiKey(key);
    expect(hash).toBe(createHash('sha256').update(key).digest('hex'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key.slice(3, 13));
  });
});

describe('contraseñas', () => {
  it('exige al menos 12 caracteres', () => {
    expect(problemaDePassword('corta123')).toMatch(/al menos 12/);
    expect(problemaDePassword('una-contraseña-larga')).toBeNull();
  });

  it('usa bcrypt y verifica correctamente', async () => {
    const hash = await hashPassword('una-contraseña-larga');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    await expect(verificarPassword('una-contraseña-larga', hash)).resolves.toBe(true);
    await expect(verificarPassword('otra-contraseña-larga', hash)).resolves.toBe(false);
  });
});
