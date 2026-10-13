import { Catalogo, MuertesNivelCausa } from '../../../core/api/tipos';

export interface FilaMuerte extends MuertesNivelCausa {
  nombreNivel: string;
  ordenNivel: number;
  nombreCausa: string;
  posicionCausa: number; // posición en catalogo.causasMuerte → color de la paleta
  porcentajeNivel: number; // % de las muertes del nivel
}

// Une /muertes con los nombres y el orden del catálogo (nunca IDs fijos en el código).
export function filasMuertes(catalogo: Catalogo, datos: MuertesNivelCausa[]): FilaMuerte[] {
  const totalPorNivel = new Map<string, number>();
  for (const d of datos) {
    totalPorNivel.set(d.nivelId, (totalPorNivel.get(d.nivelId) ?? 0) + d.muertes);
  }
  return datos.map((d) => {
    const nivel = catalogo.niveles.find((n) => n.nivelId === d.nivelId);
    const posicionCausa = catalogo.causasMuerte.findIndex((c) => c.causa === d.causa);
    const total = totalPorNivel.get(d.nivelId) ?? 0;
    return {
      ...d,
      nombreNivel: nivel?.nombre ?? d.nivelId,
      ordenNivel: nivel?.orden ?? Number.MAX_SAFE_INTEGER,
      nombreCausa: catalogo.causasMuerte[posicionCausa]?.nombre ?? d.causa,
      posicionCausa: posicionCausa < 0 ? catalogo.causasMuerte.length : posicionCausa,
      porcentajeNivel: total > 0 ? (d.muertes / total) * 100 : 0,
    };
  });
}

export interface KpisMuertes {
  total: number;
  niveles: number;
  causa: { nombre: string; muertes: number } | null;
  nivel: { nombre: string; muertes: number } | null;
  repetida: { causa: string; nivel: string; muertesPorJugador: number } | null;
}

function maximo<T>(lista: T[], valor: (x: T) => number): T | null {
  return lista.reduce<T | null>((max, x) => (!max || valor(x) > valor(max) ? x : max), null);
}

export function kpisMuertes(filas: FilaMuerte[]): KpisMuertes {
  const porCausa = new Map<string, { nombre: string; muertes: number }>();
  const porNivel = new Map<string, { nombre: string; muertes: number }>();
  for (const f of filas) {
    const c = porCausa.get(f.causa) ?? { nombre: f.nombreCausa, muertes: 0 };
    c.muertes += f.muertes;
    porCausa.set(f.causa, c);
    const n = porNivel.get(f.nivelId) ?? { nombre: f.nombreNivel, muertes: 0 };
    n.muertes += f.muertes;
    porNivel.set(f.nivelId, n);
  }
  const repetida = maximo(filas, (f) => f.muertesPorJugador);
  return {
    total: filas.reduce((s, f) => s + f.muertes, 0),
    niveles: porNivel.size,
    causa: maximo([...porCausa.values()], (x) => x.muertes),
    nivel: maximo([...porNivel.values()], (x) => x.muertes),
    repetida: repetida ? { causa: repetida.nombreCausa, nivel: repetida.nombreNivel, muertesPorJugador: repetida.muertesPorJugador } : null,
  };
}
