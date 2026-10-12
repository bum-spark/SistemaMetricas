import { randomUUID } from 'node:crypto';
import type { CatalogoEntrada } from '../../src/dominio/catalogo';
import type { Plataforma, TipoEvento } from '../../src/dominio/constantes';

export const uuid = (): string => randomUUID();

export function catalogoMinimo(): CatalogoEntrada {
  return {
    duracionEsperadaMs: 600000,
    tiposEvento: ['sesion_inicio', 'sesion_fin', 'nivel_inicio', 'nivel_fin', 'muerte', 'logro', 'coleccionable_encontrado'],
    niveles: [
      { nivelId: 'nivel_uno', nombre: 'Nivel uno', orden: 1, tieneTutorial: true },
      { nivelId: 'nivel_dos', nombre: 'Nivel dos', orden: 2 },
    ],
    causasMuerte: [{ causa: 'pinchos', nombre: 'Pinchos' }],
    logros: [{ logroId: 'nivel_uno_completado', nombre: 'Nivel uno completado', nivelId: 'nivel_uno' }],
    coleccionables: [{ coleccionableId: 'gema_1', nivelId: 'nivel_dos', nombre: 'Gema 1' }],
  };
}

export function datosJuego(extra: Record<string, unknown> = {}) {
  return {
    juegoId: uuid(),
    nombre: 'Juego de prueba',
    slug: `juego-${uuid().slice(0, 8)}`,
    versionActual: '1.0.0',
    catalogo: catalogoMinimo(),
    ...extra,
  };
}

export function datosEvento(extra: Record<string, unknown> = {}) {
  return {
    eventoId: uuid(),
    juegoId: uuid(),
    playerId: uuid(),
    sessionId: uuid(),
    secuencia: 1,
    timestamp: new Date('2026-10-12T18:00:00.000Z'),
    buildVersion: '1.0.0',
    plataforma: 'windows' as Plataforma,
    tipo: 'sesion_inicio' as TipoEvento,
    data: {},
    versionEsquema: 1 as const,
    recibidoEn: new Date('2026-10-12T18:00:01.000Z'),
    ...extra,
  };
}

export function datosSesion(extra: Record<string, unknown> = {}) {
  const ahora = new Date('2026-10-12T18:00:00.000Z');
  return {
    sessionId: uuid(),
    juegoId: uuid(),
    playerId: uuid(),
    buildVersion: '1.0.0',
    plataforma: 'windows' as Plataforma,
    creadaEn: ahora,
    ultimoEventoEn: ahora,
    ...extra,
  };
}

// Código de error de MongoDB para llave duplicada.
export const LLAVE_DUPLICADA = 11000;
