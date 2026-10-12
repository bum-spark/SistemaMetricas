import type { Catalogo } from '../dominio/catalogo';
import type { DatosSeed } from './generador';
import type { PerfilJuego } from './perfiles';

// Medidas de la forma de los datos de prueba. Las usan los tests de seed-datos y el
// resumen que imprime el script, para comprobar que el dashboard tendrá patrones creíbles.

export interface MetricasSeed {
  jugadores: number;
  sesiones: number;
  eventos: number;
  // % de jugadores que empezaron cada nivel (en orden) y % que terminó el juego.
  embudo: { nivelId: string; porcentaje: number }[];
  terminaron: number;
  fraccionCrash: number;
  medianaDuracionMs: number;
  porBuild: Record<string, { jugadores: number; tasaTermino: number; muertesPorNivelIniciado: number }>;
  plataformas: string[];
  // Fracción de muertes a menos de 2 desviaciones de alguna zona caliente, por nivel.
  muertesEnZonas: Record<string, number>;
  rangoFechas: { desde: Date; hasta: Date };
}

const mediana = (valores: number[]) => {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length === 0 ? 0 : v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
};

export function medirSeed(datos: DatosSeed, catalogo: Catalogo, perfil: PerfilJuego): MetricasSeed {
  const niveles = [...catalogo.niveles].sort((a, b) => a.orden - b.orden);
  const ultimo = niveles.at(-1)!.nivelId;
  const inician = new Map<string, Set<string>>(niveles.map((n) => [n.nivelId, new Set<string>()]));
  const terminaron = new Set<string>();
  const muertesPorJugador = new Map<string, number>();
  const nivelesPorJugador = new Map<string, number>();
  let enZona = new Map<string, { dentro: number; total: number }>();

  for (const e of datos.eventos) {
    const nivelId = e.data.nivelId as string | undefined;
    if (e.tipo === 'nivel_inicio' && nivelId) {
      const set = inician.get(nivelId)!;
      if (e.data.intento === 1 && !set.has(e.playerId)) {
        nivelesPorJugador.set(e.playerId, (nivelesPorJugador.get(e.playerId) ?? 0) + 1);
      }
      set.add(e.playerId);
    }
    if (e.tipo === 'nivel_fin' && nivelId === ultimo && e.data.resultado === 'completado') {
      terminaron.add(e.playerId);
    }
    if (e.tipo === 'muerte' && nivelId) {
      muertesPorJugador.set(e.playerId, (muertesPorJugador.get(e.playerId) ?? 0) + 1);
      const zonas = perfil.niveles.find((n) => n.nivelId === nivelId)?.zonas ?? [];
      const x = e.data.x as number;
      const y = e.data.y as number;
      const dentro = zonas.some((z) => Math.hypot((x - z.x) / z.radioX, (y - z.y) / z.radioY) <= 2);
      const acc = enZona.get(nivelId) ?? { dentro: 0, total: 0 };
      enZona.set(nivelId, { dentro: acc.dentro + (dentro ? 1 : 0), total: acc.total + 1 });
    }
  }

  const total = datos.jugadores.length;
  const pct = (n: number) => (total === 0 ? 0 : (100 * n) / total);
  const buildDe = new Map(datos.sesiones.map((s) => [s.playerId, s.buildVersion]));
  const porBuild: MetricasSeed['porBuild'] = {};
  for (const build of [...new Set(buildDe.values())].sort()) {
    const jugadores = [...buildDe.entries()].filter(([, b]) => b === build).map(([p]) => p);
    const iniciados = jugadores.reduce((s, p) => s + (nivelesPorJugador.get(p) ?? 0), 0);
    const muertes = jugadores.reduce((s, p) => s + (muertesPorJugador.get(p) ?? 0), 0);
    porBuild[build] = {
      jugadores: jugadores.length,
      tasaTermino: jugadores.filter((p) => terminaron.has(p)).length / jugadores.length,
      muertesPorNivelIniciado: iniciados === 0 ? 0 : muertes / iniciados,
    };
  }

  // Duración como la calcula la API (R-34): (fin ?? ultimoEventoEn) − inicio.
  const duraciones = datos.sesiones.map((s) => (s.fin ?? s.ultimoEventoEn).getTime() - s.inicio.getTime());
  const fechas = datos.eventos.map((e) => e.timestamp.getTime());

  enZona = new Map([...enZona].sort());
  return {
    jugadores: total,
    sesiones: datos.sesiones.length,
    eventos: datos.eventos.length,
    embudo: niveles.map((n) => ({ nivelId: n.nivelId, porcentaje: pct(inician.get(n.nivelId)!.size) })),
    terminaron: pct(terminaron.size),
    fraccionCrash: datos.sesiones.filter((s) => s.fin === null).length / datos.sesiones.length,
    medianaDuracionMs: mediana(duraciones),
    porBuild,
    plataformas: [...new Set(datos.sesiones.map((s) => s.plataforma))].sort(),
    muertesEnZonas: Object.fromEntries([...enZona].map(([k, v]) => [k, v.dentro / v.total])),
    rangoFechas: { desde: new Date(Math.min(...fechas)), hasta: new Date(Math.max(...fechas)) },
  };
}
