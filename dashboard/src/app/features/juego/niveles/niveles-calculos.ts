import { Catalogo, PasoEmbudo, ReintentosNivel, TiempoNivel } from '../../../core/api/tipos';
import { DatosInsignia, insigniaNivel } from '../../../shared/umbrales';

export interface FilaNivel {
  nivelId: string;
  orden: number;
  nombre: string;
  descripcion: string;
  jugadores: number;
  medianaCompletarMs: number | null;
  intentosPasar: number | null;
  sesiones: number; // sesiones que jugaron el nivel (pasaron + se rindieron)
  porcentajeRendidos: number | null;
  pasadasLimpias: number; // sesiones que lo completaron al primer intento
  insignia: DatosInsignia | null;
}

// Une las tres respuestas por nivel en el orden del catálogo. Nunca usa IDs fijos: todo sale
// del catálogo del juego y de los datos de la API.
export function filasNiveles(catalogo: Catalogo, tiempos: TiempoNivel[], reintentos: ReintentosNivel[], embudo: PasoEmbudo[]): FilaNivel[] {
  return [...catalogo.niveles]
    .sort((a, b) => a.orden - b.orden)
    .map((n) => {
      const t = tiempos.find((x) => x.nivelId === n.nivelId);
      const r = reintentos.find((x) => x.nivelId === n.nivelId);
      const sesiones = r ? r.pasaron.sesiones + r.seRindieron.sesiones : 0;
      const porcentajeRendidos = r && sesiones > 0 ? (r.seRindieron.sesiones / sesiones) * 100 : null;
      return {
        nivelId: n.nivelId,
        orden: n.orden,
        nombre: n.nombre,
        descripcion: n.descripcion ?? '',
        jugadores: embudo.find((p) => p.paso === n.nivelId)?.jugadores ?? 0,
        medianaCompletarMs: t?.completado.medianaMs ?? null,
        intentosPasar: r?.pasaron.promedioIntentos ?? null,
        sesiones,
        porcentajeRendidos,
        pasadasLimpias: r?.pasaron.distribucion[0]?.sesiones ?? 0,
        insignia: porcentajeRendidos === null ? null : insigniaNivel(porcentajeRendidos, sesiones),
      };
    });
}

export interface KpisNiveles {
  masLargo: { nombre: string; medianaMs: number } | null;
  intentosPasar: number | null; // promedio ponderado por sesiones que pasaron
  pasadasLimpias: number;
  sesiones: number;
  masRendido: { nombre: string; porcentaje: number } | null;
}

export function kpisNiveles(filas: FilaNivel[], reintentos: ReintentosNivel[]): KpisNiveles {
  const conTiempo = filas.filter((f) => f.medianaCompletarMs !== null);
  const masLargo = conTiempo.reduce<FilaNivel | null>((max, f) => (!max || f.medianaCompletarMs! > max.medianaCompletarMs! ? f : max), null);
  let sumaIntentos = 0;
  let pasaron = 0;
  for (const r of reintentos) {
    if (r.pasaron.promedioIntentos !== null) {
      sumaIntentos += r.pasaron.promedioIntentos * r.pasaron.sesiones;
      pasaron += r.pasaron.sesiones;
    }
  }
  const conRendidos = filas.filter((f) => f.porcentajeRendidos !== null);
  const masRendido = conRendidos.reduce<FilaNivel | null>((max, f) => (!max || f.porcentajeRendidos! > max.porcentajeRendidos! ? f : max), null);
  return {
    masLargo: masLargo ? { nombre: masLargo.nombre, medianaMs: masLargo.medianaCompletarMs! } : null,
    intentosPasar: pasaron > 0 ? sumaIntentos / pasaron : null,
    pasadasLimpias: filas.reduce((s, f) => s + f.pasadasLimpias, 0),
    sesiones: filas.reduce((s, f) => s + f.sesiones, 0),
    masRendido: masRendido ? { nombre: masRendido.nombre, porcentaje: masRendido.porcentajeRendidos! } : null,
  };
}

// % de cada grupo de intentos entre las sesiones que pasaron el nivel (0 si nadie pasó).
export function porcentajesGrupos(r: ReintentosNivel | undefined): number[] {
  const total = r?.pasaron.sesiones ?? 0;
  return (r?.pasaron.distribucion ?? []).map((g) => (total > 0 ? (g.sesiones / total) * 100 : 0));
}
