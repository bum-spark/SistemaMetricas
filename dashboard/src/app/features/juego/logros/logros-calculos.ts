import { Catalogo, LogroObtenido } from '../../../core/api/tipos';
import { DatosInsignia, rarezaLogro } from '../../../shared/umbrales';

export interface FilaLogro extends LogroObtenido {
  descripcion: string;
  rareza: DatosInsignia | null;
}

// Jugadores del denominador (la API da jugadores y % por logro, no el total): se estima con el
// logro más obtenido, que es el de mejor precisión (el % viene redondeado a un decimal).
export function jugadoresTotales(logros: LogroObtenido[]): number {
  const base = logros.reduce<LogroObtenido | null>((m, l) => (l.porcentaje > 0 && (!m || l.jugadores > m.jugadores) ? l : m), null);
  return base ? Math.round((base.jugadores / base.porcentaje) * 100) : 0;
}

// Un elemento por logro del catálogo, en el orden de la API (que es el del catálogo).
export function filasLogros(catalogo: Catalogo, logros: LogroObtenido[]): FilaLogro[] {
  const total = jugadoresTotales(logros);
  return logros.map((l) => ({
    ...l,
    descripcion: catalogo.logros.find((c) => c.logroId === l.logroId)?.descripcion ?? '',
    rareza: rarezaLogro(l.porcentaje, total),
  }));
}

export interface KpisLogros {
  obtenidos: number; // suma de jugadores por logro (veces que se obtuvo un logro)
  catalogo: number;
  comun: FilaLogro | null;
  raro: FilaLogro | null; // el menos obtenido con al menos un jugador
  sinObtener: number;
}

export function kpisLogros(filas: FilaLogro[]): KpisLogros {
  const obtenidos = filas.filter((f) => f.jugadores > 0);
  return {
    obtenidos: filas.reduce((s, f) => s + f.jugadores, 0),
    catalogo: filas.length,
    comun: obtenidos.reduce<FilaLogro | null>((m, f) => (!m || f.porcentaje > m.porcentaje ? f : m), null),
    raro: obtenidos.reduce<FilaLogro | null>((m, f) => (!m || f.porcentaje < m.porcentaje ? f : m), null),
    sinObtener: filas.length - obtenidos.length,
  };
}
