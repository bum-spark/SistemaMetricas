import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { crearJuego } from '../../src/scripts/crearJuego';

export interface JuegoPrueba {
  juegoId: string;
  apiKey: string;
}

export async function prepararJuego(slug = 'la-casa-del-bosque'): Promise<JuegoPrueba> {
  const { juegoId, apiKey } = await crearJuego({ slug });
  return { juegoId, apiKey };
}

export async function abrirSesion(app: Express, juego: JuegoPrueba, playerId: string = randomUUID()): Promise<{ playerId: string; sessionId: string }> {
  const res = await request(app)
    .post('/api/v1/sesiones')
    .set('X-Api-Key', juego.apiKey)
    .send({ juegoId: juego.juegoId, playerId, buildVersion: '1.0.0', plataforma: 'windows', consentimiento: true });
  if (res.status !== 201) {
    throw new Error(`No se pudo abrir la sesión: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { playerId, sessionId: (res.body as { sessionId: string }).sessionId };
}

export interface Contexto {
  juegoId: string;
  playerId: string;
  sessionId: string;
}

// Hace 10 minutos: dentro de la ventana aceptada (S-06).
const BASE_MS = Date.now() - 10 * 60 * 1000;

export function evento(ctx: Contexto, secuencia: number, tipo: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    eventoId: randomUUID(),
    juegoId: ctx.juegoId,
    playerId: ctx.playerId,
    sessionId: ctx.sessionId,
    secuencia,
    timestamp: new Date(BASE_MS + secuencia * 1000).toISOString(),
    buildVersion: '1.0.0',
    plataforma: 'windows',
    versionEsquema: 1,
    tipo,
    data,
    ...extra,
  };
}

// La partida corta del ejemplo de ESQUEMA_EVENTOS.md §11 (11 eventos, 2 logros).
export function loteEjemplo(ctx: Contexto) {
  return [
    evento(ctx, 1, 'sesion_inicio'),
    evento(ctx, 2, 'nivel_inicio', { nivelId: 'casa_abandonada', intento: 1 }),
    evento(ctx, 3, 'tutorial_completado', { duracionMs: 55000 }),
    evento(ctx, 4, 'logro', { logroId: 'tutorial_superado' }),
    evento(ctx, 5, 'muerte', { nivelId: 'casa_abandonada', intento: 1, causa: 'fantasma', x: 12.5, y: -3.2 }),
    evento(ctx, 6, 'nivel_fin', { nivelId: 'casa_abandonada', intento: 1, resultado: 'muerte', duracionMs: 95000 }),
    evento(ctx, 7, 'nivel_inicio', { nivelId: 'casa_abandonada', intento: 2 }),
    evento(ctx, 8, 'flor_recogida', { nivelId: 'casa_abandonada', duracionMs: 150000 }),
    evento(ctx, 9, 'nivel_fin', { nivelId: 'casa_abandonada', intento: 2, resultado: 'completado', duracionMs: 150000 }),
    evento(ctx, 10, 'logro', { logroId: 'casa_abandonada_completada' }),
    evento(ctx, 11, 'sesion_fin', { motivo: 'menu_salir' }),
  ];
}
