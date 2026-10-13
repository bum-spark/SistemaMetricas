import type { Catalogo } from '../../src/dominio/catalogo';
import type { DatosSeed, EventoSeed, SesionSeed } from '../../src/seed/generador';

// Oráculo de las estadísticas: cálculo independiente, en JS plano y sin MongoDB, a partir de
// los documentos que genera el seed. Los tests comparan cada endpoint contra estos valores.

export interface FiltrosOraculo {
  desde?: string;
  hasta?: string;
  buildVersion?: string;
  plataforma?: string;
  origen?: 'real' | 'seed' | 'todos';
}

const enRango = (fecha: Date, f: FiltrosOraculo) =>
  (f.desde === undefined || fecha >= new Date(f.desde)) && (f.hasta === undefined || fecha < new Date(f.hasta));

const comunes = (d: { buildVersion: string; plataforma: string; origen: string }, f: FiltrosOraculo) =>
  (f.buildVersion === undefined || d.buildVersion === f.buildVersion) &&
  (f.plataforma === undefined || d.plataforma === f.plataforma) &&
  (f.origen === undefined || f.origen === 'todos' || d.origen === f.origen);

export const eventosFiltrados = (datos: DatosSeed, f: FiltrosOraculo): EventoSeed[] =>
  datos.eventos.filter((e) => comunes(e, f) && enRango(e.timestamp, f));

const sesionesFiltradas = (datos: DatosSeed, f: FiltrosOraculo): SesionSeed[] =>
  datos.sesiones.filter((s) => comunes(s, f) && enRango(s.inicio, f));

export const medianaInferior = (valores: number[]): number | null => {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.ceil(v.length / 2) - 1]!;
};
const promedio = (valores: number[]) => (valores.length === 0 ? null : Math.round(valores.reduce((s, x) => s + x, 0) / valores.length));
const pct = (parte: number, total: number) => (total === 0 ? 0 : Math.round((1000 * parte) / total) / 10);
const niveles = (c: Catalogo) => [...c.niveles].sort((a, b) => a.orden - b.orden).map((n) => n.nivelId);

export function oraculoSesiones(datos: DatosSeed, f: FiltrosOraculo, ahora: Date) {
  const limite = ahora.getTime() - 30 * 60 * 1000;
  const terminadas = sesionesFiltradas(datos, f)
    .filter((s) => s.fin !== null || s.ultimoRecibidoEn.getTime() < limite)
    .map((s) => ({ s, duracion: (s.fin ?? s.ultimoEventoEn).getTime() - s.inicio.getTime() }))
    .filter((x) => x.duracion >= 0);
  const duraciones = terminadas.map((x) => x.duracion);
  const limites = [0, 5, 10, 15, 20, 25, 30, 45, 60].map((m) => m * 60000);
  return {
    sesiones: terminadas.length,
    jugadores: new Set(terminadas.map((x) => x.s.playerId)).size,
    promedioMs: promedio(duraciones),
    medianaMs: medianaInferior(duraciones),
    inferidas: terminadas.filter((x) => x.s.fin === null).length,
    distribucion: limites.map((desdeMs, i) => ({
      desdeMs,
      sesiones: duraciones.filter((d) => d >= desdeMs && (i === limites.length - 1 || d < limites[i + 1]!)).length,
    })),
  };
}

export function oraculoTiempoNivel(datos: DatosSeed, catalogo: Catalogo, f: FiltrosOraculo) {
  const fines = eventosFiltrados(datos, f).filter((e) => e.tipo === 'nivel_fin');
  const valores = (nivelId: string, resultado: string) => {
    const d = fines.filter((e) => e.data.nivelId === nivelId && e.data.resultado === resultado).map((e) => e.data.duracionMs as number);
    return { intentos: d.length, promedioMs: promedio(d), medianaMs: medianaInferior(d) };
  };
  return niveles(catalogo).map((nivelId) => ({
    nivelId,
    completado: valores(nivelId, 'completado'),
    muerte: valores(nivelId, 'muerte'),
    abandono: valores(nivelId, 'abandono'),
  }));
}

export function oraculoEmbudo(datos: DatosSeed, catalogo: Catalogo, f: FiltrosOraculo) {
  const eventos = eventosFiltrados(datos, f);
  const orden = niveles(catalogo);
  const ultimo = orden.at(-1)!;
  const jugadoresPorPaso = new Map<string, number>([
    ...orden.map((n) => [n, new Set(eventos.filter((e) => e.tipo === 'nivel_inicio' && e.data.nivelId === n).map((e) => e.playerId)).size] as const),
    [
      'terminaron',
      new Set(eventos.filter((e) => e.tipo === 'nivel_fin' && e.data.nivelId === ultimo && e.data.resultado === 'completado').map((e) => e.playerId)).size,
    ],
  ]);
  const primero = jugadoresPorPaso.get(orden[0]!)!;
  return [...orden, 'terminaron'].map((paso) => ({ paso, jugadores: jugadoresPorPaso.get(paso)!, porcentaje: pct(jugadoresPorPaso.get(paso)!, primero) }));
}

export function oraculoMuertes(datos: DatosSeed, catalogo: Catalogo, f: FiltrosOraculo) {
  const muertes = eventosFiltrados(datos, f).filter((e) => e.tipo === 'muerte');
  const resultado = [];
  for (const nivelId of niveles(catalogo)) {
    for (const { causa } of catalogo.causasMuerte) {
      const de = muertes.filter((e) => e.data.nivelId === nivelId && e.data.causa === causa);
      if (de.length > 0) {
        const jugadores = new Set(de.map((e) => e.playerId)).size;
        resultado.push({ nivelId, causa, muertes: de.length, jugadores, muertesPorJugador: Math.round((de.length / jugadores) * 100) / 100 });
      }
    }
  }
  return resultado;
}

export function oraculoLogros(datos: DatosSeed, catalogo: Catalogo, f: FiltrosOraculo) {
  const eventos = eventosFiltrados(datos, f);
  const total = new Set(eventos.map((e) => e.playerId)).size;
  return catalogo.logros.map((l) => {
    const jugadores = new Set(eventos.filter((e) => e.tipo === 'logro' && e.data.logroId === l.logroId).map((e) => e.playerId)).size;
    return { logroId: l.logroId, nombre: l.nombre, jugadores, porcentaje: pct(jugadores, total) };
  });
}

export function oraculoMapaCalor(datos: DatosSeed, catalogo: Catalogo, f: FiltrosOraculo, nivelId: string, celda: number) {
  const nivel = catalogo.niveles.find((n) => n.nivelId === nivelId)!;
  const conteo = new Map<string, { cx: number; cy: number; causa: string; muertes: number }>();
  for (const e of eventosFiltrados(datos, f).filter((ev) => ev.tipo === 'muerte' && ev.data.nivelId === nivelId)) {
    const cx = Math.floor((e.data.x as number) / celda);
    const cy = Math.floor((e.data.y as number) / celda);
    const causa = e.data.causa as string;
    const clave = `${cx}|${cy}|${causa}`;
    const actual = conteo.get(clave) ?? { cx, cy, causa, muertes: 0 };
    actual.muertes++;
    conteo.set(clave, actual);
  }
  const ordenCausa = new Map(catalogo.causasMuerte.map((c, i) => [c.causa, i]));
  const celdas = [...conteo.values()]
    .sort((a, b) => a.cx - b.cx || a.cy - b.cy || ordenCausa.get(a.causa)! - ordenCausa.get(b.causa)!)
    .map((c) => ({ x: c.cx * celda, y: c.cy * celda, causa: c.causa, muertes: c.muertes }));
  return {
    nivelId,
    imagenUrl: nivel.imagenUrl ?? null,
    limites: nivel.limites ?? null,
    celda,
    totalMuertes: celdas.reduce((s, c) => s + c.muertes, 0),
    celdas,
  };
}

export function oraculoReintentos(datos: DatosSeed, catalogo: Catalogo, f: FiltrosOraculo) {
  const porSesionNivel = new Map<string, { nivelId: string; intentos: number; completado: boolean }>();
  for (const e of eventosFiltrados(datos, f).filter((ev) => ev.tipo === 'nivel_inicio' || ev.tipo === 'nivel_fin')) {
    const nivelId = e.data.nivelId as string;
    const clave = `${e.sessionId}|${nivelId}`;
    const actual = porSesionNivel.get(clave) ?? { nivelId, intentos: 0, completado: false };
    actual.intentos = Math.max(actual.intentos, e.data.intento as number);
    actual.completado ||= e.tipo === 'nivel_fin' && e.data.resultado === 'completado';
    porSesionNivel.set(clave, actual);
  }
  const grupo = (nivelId: string, completado: boolean) => {
    const intentos = [...porSesionNivel.values()].filter((x) => x.nivelId === nivelId && x.completado === completado).map((x) => x.intentos);
    return intentos.length === 0
      ? { sesiones: 0, promedioIntentos: null, maxIntentos: null }
      : { sesiones: intentos.length, promedioIntentos: Math.round((intentos.reduce((s, x) => s + x, 0) / intentos.length) * 100) / 100, maxIntentos: Math.max(...intentos) };
  };
  return niveles(catalogo).map((nivelId) => ({ nivelId, pasaron: grupo(nivelId, true), seRindieron: grupo(nivelId, false) }));
}
