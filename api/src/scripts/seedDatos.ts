import { randomUUID } from 'node:crypto';
import { CATALOGOS, type DefinicionJuego } from '../catalogos';
import { esquemaCatalogo, type Catalogo } from '../dominio/catalogo';
import { AdminModelo, EventoModelo, JuegoModelo, JugadorModelo, LogroObtenidoModelo, SesionModelo } from '../modelos';
import { generarDatosSeed, type DatosSeed } from '../seed/generador';
import { medirSeed, type MetricasSeed } from '../seed/metricas';
import { PERFIL_FARO_NOCTURNO_DEMO, PERFIL_LA_CASA_DEL_BOSQUE, type PerfilJuego } from '../seed/perfiles';
import { ejecutarScript, ErrorScript, texto } from './comun';
import { limpiarSeed, type ResultadoLimpieza } from './limpiarSeed';

// seed-datos (etapa 6): datos de prueba realistas y deterministas para La Casa del Bosque y
// Faro Nocturno (demo). Todo con origen "seed". Inserta directo en la base, con los mismos
// campos que guarda la ingesta. Idempotente: antes de insertar borra el seed anterior del juego.

export const SEMILLA_POR_DEFECTO = 42;
const TAMANO_LOTE = 2000;

export interface OpcionesSeed {
  semilla: number;
  referencia: Date;
  // Jugadores de La Casa del Bosque; Faro Nocturno (demo) recibe la mitad.
  jugadores?: number | undefined;
}

export interface ResumenSeedJuego {
  slug: string;
  juegoCreado: boolean;
  borrados: ResultadoLimpieza;
  insertados: { jugadores: number; sesiones: number; eventos: number; logros: number };
  metricas: MetricasSeed;
}

// Medianoche UTC de hoy: con la misma semilla, el mismo día produce los mismos datos.
export function referenciaPorDefecto(ahora = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
}

// Crea el juego si no existe (sin API key: el seed no la necesita) y completa en su catálogo
// el logo y las imágenes y límites provisionales que falten (A-07).
async function asegurarJuego(def: DefinicionJuego): Promise<{ juegoId: string; catalogo: Catalogo; creado: boolean }> {
  const constante = esquemaCatalogo.parse(def.catalogo);
  let juego = await JuegoModelo.findOne({ slug: def.slug });
  let creado = false;
  if (!juego) {
    juego = await JuegoModelo.create({
      juegoId: randomUUID(),
      nombre: def.nombre,
      slug: def.slug,
      versionActual: '1.0.1',
      ...(def.logoUrl ? { logoUrl: def.logoUrl } : {}),
      apiKeyHash: null,
      catalogo: constante,
    });
    creado = true;
    await AdminModelo.updateMany({ activo: true }, { $addToSet: { juegosPermitidos: juego.juegoId } });
  } else {
    let cambio = false;
    if (def.logoUrl && !juego.logoUrl) {
      juego.logoUrl = def.logoUrl;
      cambio = true;
    }
    for (const nivel of juego.catalogo.niveles) {
      const base = constante.niveles.find((n) => n.nivelId === nivel.nivelId);
      if (base?.imagenUrl && !nivel.imagenUrl) {
        nivel.imagenUrl = base.imagenUrl;
        cambio = true;
      }
      if (base?.limites && !nivel.limites) {
        nivel.limites = base.limites;
        cambio = true;
      }
    }
    if (cambio) {
      await juego.save();
    }
  }
  return { juegoId: juego.juegoId, catalogo: esquemaCatalogo.parse(juego.toObject().catalogo), creado };
}

async function insertarPorLotes<T>(insertar: (lote: T[]) => Promise<unknown>, docs: T[]): Promise<void> {
  for (let i = 0; i < docs.length; i += TAMANO_LOTE) {
    await insertar(docs.slice(i, i + TAMANO_LOTE));
  }
}

export async function insertarDatosSeed(datos: DatosSeed): Promise<void> {
  await insertarPorLotes((l) => JugadorModelo.insertMany(l), datos.jugadores);
  await insertarPorLotes((l) => SesionModelo.insertMany(l), datos.sesiones);
  await insertarPorLotes((l) => EventoModelo.insertMany(l), datos.eventos);
  await insertarPorLotes((l) => LogroObtenidoModelo.insertMany(l), datos.logros);
}

async function sembrarJuego(perfil: PerfilJuego, opciones: OpcionesSeed, jugadores: number | undefined): Promise<ResumenSeedJuego> {
  const def = CATALOGOS[perfil.slug]!;
  const { juegoId, catalogo, creado } = await asegurarJuego(def);
  const borrados = await limpiarSeed({ juegoSlug: perfil.slug });
  const datos = generarDatosSeed({ juegoId, catalogo, perfil, semilla: opciones.semilla, referencia: opciones.referencia, jugadores });
  await insertarDatosSeed(datos);
  return {
    slug: perfil.slug,
    juegoCreado: creado,
    borrados,
    insertados: { jugadores: datos.jugadores.length, sesiones: datos.sesiones.length, eventos: datos.eventos.length, logros: datos.logros.length },
    metricas: medirSeed(datos, catalogo, perfil),
  };
}

export async function ejecutarSeed(opciones: OpcionesSeed): Promise<ResumenSeedJuego[]> {
  return [
    await sembrarJuego(PERFIL_LA_CASA_DEL_BOSQUE, opciones, opciones.jugadores),
    await sembrarJuego(PERFIL_FARO_NOCTURNO_DEMO, opciones, opciones.jugadores === undefined ? undefined : Math.max(1, Math.round(opciones.jugadores / 2))),
  ];
}

function enteroPositivo(valor: string | undefined, nombre: string): number | undefined {
  if (valor === undefined) {
    return undefined;
  }
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw new ErrorScript(`--${nombre} debe ser un entero positivo.`);
  }
  return n;
}

function leerReferencia(valor: string | undefined): Date {
  if (valor === undefined) {
    return referenciaPorDefecto();
  }
  const fecha = new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T00:00:00.000Z` : valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorScript('--referencia debe ser una fecha (AAAA-MM-DD o ISO 8601).');
  }
  return fecha;
}

const minutos = (ms: number) => `${(ms / 60000).toFixed(1)} min`;

export async function main(argv: string[]): Promise<void> {
  const opciones = { semilla: { type: 'string' }, jugadores: { type: 'string' }, referencia: { type: 'string' } } as const;
  await ejecutarScript('seed-datos', argv, opciones, async ({ args, log }) => {
    const semilla = enteroPositivo(texto(args, 'semilla'), 'semilla') ?? SEMILLA_POR_DEFECTO;
    const jugadores = enteroPositivo(texto(args, 'jugadores'), 'jugadores');
    const referencia = leerReferencia(texto(args, 'referencia'));
    log(`Semilla ${semilla} · datos de los 14 días anteriores a ${referencia.toISOString().slice(0, 10)} · todo con origen "seed"`);

    for (const r of await ejecutarSeed({ semilla, referencia, jugadores })) {
      const m = r.metricas;
      log(`── ${r.slug}${r.juegoCreado ? ' (juego creado sin API key; usa rotar-api-key si un cliente la necesita)' : ''}`);
      log(`   seed anterior borrado: ${r.borrados.eventos} eventos, ${r.borrados.sesiones} sesiones, ${r.borrados.jugadores} jugadores, ${r.borrados.logros} logros`);
      log(`   insertado: ${r.insertados.jugadores} jugadores, ${r.insertados.sesiones} sesiones, ${r.insertados.eventos} eventos, ${r.insertados.logros} logros`);
      log(`   embudo: ${m.embudo.map((e) => `${e.porcentaje.toFixed(0)}%`).join(' → ')} → terminan ${m.terminaron.toFixed(0)}%`);
      log(`   sesiones con crash: ${(m.fraccionCrash * 100).toFixed(1)}% · duración mediana: ${minutos(m.medianaDuracionMs)}`);
      log(`   builds: ${Object.entries(m.porBuild).map(([b, v]) => `${b} termina ${(v.tasaTermino * 100).toFixed(0)}%`).join(' · ')}`);
    }
  });
}
