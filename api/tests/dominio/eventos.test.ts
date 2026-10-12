import { randomUUID } from 'node:crypto';
import { LA_CASA_DEL_BOSQUE } from '../../src/catalogos';
import { esquemaCatalogo } from '../../src/dominio/catalogo';
import { TIPOS_EVENTO, type TipoEvento } from '../../src/dominio/constantes';
import { ESQUEMAS_DATA, validarEvento } from '../../src/dominio/eventos';

const catalogo = esquemaCatalogo.parse(LA_CASA_DEL_BOSQUE.catalogo);
const juegoId = randomUUID();
const ahora = new Date('2026-10-12T18:10:00.000Z');

// Un `data` válido por cada tipo de ESQUEMA_EVENTOS.md §3–§4.
const DATA_VALIDA: Record<TipoEvento, Record<string, unknown>> = {
  sesion_inicio: {},
  sesion_fin: { motivo: 'cierre_normal' },
  nivel_inicio: { nivelId: 'hospital_cuarto', intento: 1 },
  nivel_fin: { nivelId: 'hospital_cuarto', intento: 3, resultado: 'abandono', duracionMs: 4000 },
  muerte: { nivelId: 'habitacion_llamas', intento: 2, causa: 'lava', x: -1.5, y: 20 },
  logro: { logroId: 'la_verdad' },
  pausa: { duracionMs: 30000 },
  inactividad: { duracionMs: 60000, nivelId: 'casa_abandonada' },
  error: { codigo: 'NULL_REF', mensaje: 'Referencia nula en el jefe', fatal: true },
  rendimiento: { fpsPromedio: 58.4, tiempoCargaMs: 1200, nivelId: 'casa_abandonada' },
  flor_recogida: { nivelId: 'hospital_cuarto', duracionMs: 90000 },
  dialogo_saltado: { dialogoId: 'abuela_intro', nivelId: 'casa_abandonada' },
  coleccionable_encontrado: { coleccionableId: 'carta_pieza_3', nivelId: 'habitacion_llamas' },
  tutorial_completado: { duracionMs: 55000 },
};

function crudo(tipo: string, data: Record<string, unknown>) {
  return {
    eventoId: randomUUID(),
    juegoId,
    playerId: randomUUID(),
    sessionId: randomUUID(),
    secuencia: 1,
    timestamp: '2026-10-12T18:00:00.000Z',
    buildVersion: '1.0.0',
    plataforma: 'android',
    versionEsquema: 1,
    tipo,
    data,
  };
}

describe('validarEvento por tipo', () => {
  it('hay un esquema de data para cada tipo conocido', () => {
    expect(Object.keys(ESQUEMAS_DATA).sort()).toEqual([...TIPOS_EVENTO].sort());
  });

  it.each(TIPOS_EVENTO.map((t) => [t]))('acepta un %s válido y convierte timestamp a Date', (tipo) => {
    const r = validarEvento(crudo(tipo, DATA_VALIDA[tipo]), { juegoId, catalogo, ahora });
    expect(r).toMatchObject({ ok: true, evento: { tipo, data: DATA_VALIDA[tipo] } });
    if (r.ok) {
      expect(r.evento.timestamp).toEqual(new Date('2026-10-12T18:00:00.000Z'));
    }
  });

  it.each(TIPOS_EVENTO.map((t) => [t]))('rechaza un %s con un campo extra en data', (tipo) => {
    const r = validarEvento(crudo(tipo, { ...DATA_VALIDA[tipo], extra: 1 }), { juegoId, catalogo, ahora });
    expect(r).toMatchObject({ ok: false, rechazo: { codigo: 'VALIDACION_FALLIDA' } });
  });

  it('acepta un timestamp sin milisegundos', () => {
    const e = { ...crudo('sesion_inicio', {}), timestamp: '2026-10-12T18:00:00Z' };
    expect(validarEvento(e, { juegoId, catalogo, ahora }).ok).toBe(true);
  });

  it('acepta campos opcionales ausentes (pausa sin nivelId, rendimiento sin tiempoCargaMs)', () => {
    expect(validarEvento(crudo('pausa', { duracionMs: 1 }), { juegoId, catalogo, ahora }).ok).toBe(true);
    expect(validarEvento(crudo('rendimiento', { fpsPromedio: 30 }), { juegoId, catalogo, ahora }).ok).toBe(true);
  });

  it('rechaza mensajes de error de más de 500 caracteres', () => {
    const r = validarEvento(crudo('error', { codigo: 'X', mensaje: 'a'.repeat(501), fatal: false }), { juegoId, catalogo, ahora });
    expect(r).toMatchObject({ ok: false, rechazo: { codigo: 'VALIDACION_FALLIDA' } });
  });

  it('un tipo genérico que el juego no registró es TIPO_NO_REGISTRADO', () => {
    const sinPausa = { ...catalogo, tiposEvento: catalogo.tiposEvento.filter((t) => t !== 'pausa') };
    const r = validarEvento(crudo('pausa', { duracionMs: 1 }), { juegoId, catalogo: sinPausa, ahora });
    expect(r).toMatchObject({ ok: false, rechazo: { codigo: 'TIPO_NO_REGISTRADO' } });
  });

  it('los mensajes de zod salen en español', () => {
    const r = validarEvento({ ...crudo('sesion_inicio', {}), extra: true }, { juegoId, catalogo, ahora });
    expect(r).toMatchObject({ ok: false, rechazo: { mensaje: 'Llave desconocida: "extra"' } });
  });
});
