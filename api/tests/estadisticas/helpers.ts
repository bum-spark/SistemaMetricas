import request from 'supertest';
import type { Express } from 'express';
import { CATALOGOS } from '../../src/catalogos';
import { esquemaCatalogo, type Catalogo } from '../../src/dominio/catalogo';
import { crearAdmin } from '../../src/scripts/crearAdmin';
import { crearJuego } from '../../src/scripts/crearJuego';
import { insertarDatosSeed, referenciaPorDefecto } from '../../src/scripts/seedDatos';
import { generarDatosSeed, type DatosSeed } from '../../src/seed/generador';
import { PERFILES } from '../../src/seed/perfiles';

export const SEMILLA_TESTS = 2026;
const PASSWORD = 'contraseña-larga-de-pruebas';

export interface JuegoSembrado {
  slug: string;
  juegoId: string;
  apiKey: string;
  catalogo: Catalogo;
  datos: DatosSeed;
}

// Crea el juego con crear-juego y, si se pide, inserta datos del seed con semilla fija.
export async function juegoConSeed(slug: string, jugadores: number | null): Promise<JuegoSembrado> {
  const { juegoId, apiKey } = await crearJuego({ slug });
  const catalogo = esquemaCatalogo.parse(CATALOGOS[slug]!.catalogo);
  const datos: DatosSeed =
    jugadores === null
      ? { jugadores: [], sesiones: [], eventos: [], logros: [] }
      : generarDatosSeed({ juegoId, catalogo, perfil: PERFILES[slug]!, semilla: SEMILLA_TESTS, referencia: referenciaPorDefecto(), jugadores });
  await insertarDatosSeed(datos);
  return { slug, juegoId, apiKey, catalogo, datos };
}

// Admin con acceso a todos los juegos existentes y su token.
export async function tokenAdmin(app: Express): Promise<string> {
  await crearAdmin({ email: 'admin@xolos.mx', password: PASSWORD, nombre: 'Admin' });
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@xolos.mx', password: PASSWORD });
  return res.body.token as string;
}

export function consultar(app: Express, token: string) {
  return (juegoId: string, metrica: string, filtros: Record<string, string> = {}) =>
    request(app).get(`/api/v1/estadisticas/${juegoId}/${metrica}`).query(filtros).set('Authorization', `Bearer ${token}`);
}
