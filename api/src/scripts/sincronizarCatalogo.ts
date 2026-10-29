import { CATALOGOS } from '../catalogos';
import { describirProblemas, esquemaCatalogo, type Catalogo } from '../dominio/catalogo';
import { JuegoModelo } from '../modelos';
import { ejecutarScript, ErrorScript, texto } from './comun';

// Aplica a un juego que YA existe en la base lo nuevo de su catálogo constante
// (api/src/catalogos/), sin quitar ni modificar nada (S-69):
// - Lo que falta en la base se AGREGA AL FINAL de su lista (no cambian posiciones ni colores).
// - Lo que existe con valores distintos solo se AVISA y se conserva. En particular, nunca toca
//   imagenUrl ni limites de un nivel que ya existe (pueden ser las capturas reales puestas con
//   actualizar-juego --nivel).
// - Lo que está en la base y no en la constante tampoco se quita (se avisa).
// El catálogo resultante se valida con el mismo esquema zod antes de escribir.

type ListaConClave = 'niveles' | 'causasMuerte' | 'logros' | 'coleccionables';
export type Lista = 'causasMuerte' | 'niveles' | 'logros' | 'coleccionables' | 'tiposEvento';

const CLAVES: Record<ListaConClave, string> = {
  niveles: 'nivelId',
  causasMuerte: 'causa',
  logros: 'logroId',
  coleccionables: 'coleccionableId',
};

// Para el resumen: "1 causa", "2 niveles"…
export const NOMBRES: Record<Lista, [string, string]> = {
  causasMuerte: ['causa', 'causas'],
  niveles: ['nivel', 'niveles'],
  logros: ['logro', 'logros'],
  coleccionables: ['coleccionable', 'coleccionables'],
  tiposEvento: ['tipo de evento', 'tipos de evento'],
};
export const ORDEN_LISTAS: Lista[] = ['causasMuerte', 'niveles', 'logros', 'coleccionables', 'tiposEvento'];

// Campos de un nivel existente que nunca se tocan (aunque difieran de la constante).
const CAMPOS_PROTEGIDOS_NIVEL = ['imagenUrl', 'limites'];

export interface ResultadoSincronizacion {
  slug: string;
  // Claves de cada lista antes y después (después = antes + agregados).
  antes: Record<Lista, string[]>;
  agregados: Record<Lista, string[]>;
  duracionAgregada: number | null;
  avisos: string[];
  total: number;
  escrito: boolean;
}

// JSON con las claves ordenadas: para comparar objetos sin depender del orden de sus campos.
function canonico(valor: unknown): string {
  return JSON.stringify(valor, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function etiquetaDe(lista: Lista, elemento: unknown): string {
  if (lista === 'tiposEvento') return String(elemento);
  const e = elemento as Record<string, unknown>;
  const clave = String(e[CLAVES[lista]]);
  return typeof e.nombre === 'string' ? `${clave} (${e.nombre})` : clave;
}

export async function sincronizarCatalogo(slug: string, opciones: { simular?: boolean } = {}): Promise<ResultadoSincronizacion> {
  const definicion = CATALOGOS[slug];
  if (!definicion) {
    throw new ErrorScript(`No hay catálogo constante para "${slug}". Catálogos: ${Object.keys(CATALOGOS).join(', ')}.`);
  }
  const juego = await JuegoModelo.findOne({ slug });
  if (!juego) {
    throw new ErrorScript(`No existe un juego con slug "${slug}" en la base. Para crearlo usa crear-juego.`);
  }
  const constante = esquemaCatalogo.parse(definicion.catalogo);
  const actual = esquemaCatalogo.safeParse(juego.toObject().catalogo);
  if (!actual.success) {
    throw new ErrorScript(`El catálogo guardado de ${slug} no es válido; corrígelo antes de sincronizar: ${describirProblemas(actual.error)}`);
  }
  const base: Catalogo = actual.data;

  const avisos: string[] = [];
  const agregar: Record<Lista, unknown[]> = { causasMuerte: [], niveles: [], logros: [], coleccionables: [], tiposEvento: [] };

  // tiposEvento: lista de textos.
  agregar.tiposEvento = constante.tiposEvento.filter((t) => !base.tiposEvento.includes(t));
  for (const t of base.tiposEvento.filter((t) => !constante.tiposEvento.includes(t))) {
    avisos.push(`tiposEvento: "${t}" está en la base y no en la constante; no se quita.`);
  }

  // Listas de objetos con clave.
  for (const lista of Object.keys(CLAVES) as ListaConClave[]) {
    const clave = CLAVES[lista];
    const enBase = base[lista] as unknown as Record<string, unknown>[];
    const enConstante = constante[lista] as unknown as Record<string, unknown>[];
    for (const item of enConstante) {
      const existente = enBase.find((b) => b[clave] === item[clave]);
      if (!existente) {
        agregar[lista].push(item);
        continue;
      }
      const campos = new Set([...Object.keys(item), ...Object.keys(existente)]);
      for (const campo of campos) {
        if (canonico(existente[campo]) === canonico(item[campo])) continue;
        const protegido = lista === 'niveles' && CAMPOS_PROTEGIDOS_NIVEL.includes(campo);
        avisos.push(
          `${lista}: ${String(item[clave])}.${campo} difiere (base ${canonico(existente[campo]) ?? 'sin valor'}, constante ${canonico(item[campo]) ?? 'sin valor'}); ` +
            (protegido ? 'se conserva el de la base (imagenUrl y limites de un nivel existente nunca se tocan).' : 'no se toca.'),
        );
      }
    }
    for (const item of enBase.filter((b) => !enConstante.some((c) => c[clave] === b[clave]))) {
      avisos.push(`${lista}: ${String(item[clave])} está en la base y no en la constante; no se quita.`);
    }
  }

  // duracionEsperadaMs: solo si falta.
  let duracionAgregada: number | null = null;
  if (base.duracionEsperadaMs === undefined && constante.duracionEsperadaMs !== undefined) {
    duracionAgregada = constante.duracionEsperadaMs;
  } else if (constante.duracionEsperadaMs !== undefined && base.duracionEsperadaMs !== constante.duracionEsperadaMs) {
    avisos.push(`duracionEsperadaMs difiere (base ${base.duracionEsperadaMs}, constante ${constante.duracionEsperadaMs}); no se toca.`);
  }

  // Catálogo resultante: lo de la base, intacto, más lo agregado al final de cada lista.
  const propuesto = {
    ...base,
    ...(duracionAgregada !== null ? { duracionEsperadaMs: duracionAgregada } : {}),
    tiposEvento: [...base.tiposEvento, ...(agregar.tiposEvento as string[])],
    niveles: [...base.niveles, ...agregar.niveles],
    causasMuerte: [...base.causasMuerte, ...agregar.causasMuerte],
    logros: [...base.logros, ...agregar.logros],
    coleccionables: [...base.coleccionables, ...agregar.coleccionables],
  };
  const revision = esquemaCatalogo.safeParse(propuesto);
  if (!revision.success) {
    throw new ErrorScript(`El catálogo quedaría inválido; no se escribió nada: ${describirProblemas(revision.error)}`);
  }

  const total = ORDEN_LISTAS.reduce((n, l) => n + agregar[l].length, 0) + (duracionAgregada !== null ? 1 : 0);
  const antes = Object.fromEntries(
    ORDEN_LISTAS.map((l) => [l, (base[l] as unknown[]).map((e) => etiquetaDe(l, e))]),
  ) as Record<Lista, string[]>;
  const agregados = Object.fromEntries(ORDEN_LISTAS.map((l) => [l, agregar[l].map((e) => etiquetaDe(l, e))])) as Record<Lista, string[]>;

  let escrito = false;
  if (total > 0 && !opciones.simular) {
    // $push con $each: lo existente no se reescribe; lo nuevo va al final de cada lista.
    const push: Record<string, unknown> = {};
    for (const l of ORDEN_LISTAS) {
      if (agregar[l].length > 0) push[`catalogo.${l}`] = { $each: agregar[l] };
    }
    await JuegoModelo.updateOne(
      { _id: juego._id },
      {
        ...(Object.keys(push).length > 0 ? { $push: push } : {}),
        ...(duracionAgregada !== null ? { $set: { 'catalogo.duracionEsperadaMs': duracionAgregada } } : {}),
      },
    );
    escrito = true;
  }
  return { slug, antes, agregados, duracionAgregada, avisos, total, escrito };
}

// "1 causa, 0 niveles, …"
export function resumenConteos(r: ResultadoSincronizacion): string {
  return ORDEN_LISTAS.map((l) => {
    const n = r.agregados[l].length;
    return `${n} ${NOMBRES[l][n === 1 ? 0 : 1]}`;
  }).join(', ');
}

export async function main(argv: string[]): Promise<void> {
  const opciones = { juego: { type: 'string' }, simular: { type: 'boolean', default: false } } as const;
  await ejecutarScript('sincronizar-catalogo', argv, opciones, async ({ args, log }) => {
    const slug = texto(args, 'juego');
    if (!slug) {
      throw new ErrorScript('Indica el juego con --juego <slug>.');
    }
    const simular = args.simular === true;
    const r = await sincronizarCatalogo(slug, { simular });
    const verbo = simular ? 'agregaría' : 'agregó';

    if (r.total === 0) {
      log(`Nada que agregar: el catálogo de ${r.slug} en la base ya tiene todo lo de la constante. No se modificó nada.`);
    } else {
      for (const l of ORDEN_LISTAS) {
        if (r.agregados[l].length === 0) continue;
        log(`${l} antes   (${r.antes[l].length}): ${r.antes[l].join(', ') || '—'}`);
        log(`${l} ${verbo.padEnd(8)}  (+${r.agregados[l].length}): ${r.agregados[l].join(', ')}`);
        log(`${l} después (${r.antes[l].length + r.agregados[l].length}): ${[...r.antes[l], ...r.agregados[l]].join(', ')}`);
      }
      if (r.duracionAgregada !== null) {
        log(`duracionEsperadaMs: sin valor → ${r.duracionAgregada}`);
      }
      log(`Resumen: ${verbo} ${resumenConteos(r)}${r.duracionAgregada !== null ? ' y duracionEsperadaMs' : ''}.`);
    }
    for (const aviso of r.avisos) {
      log(`AVISO: ${aviso}`);
    }
    if (simular && r.total > 0) {
      log('Simulación: no se escribió nada. Vuelve a correrlo sin --simular para aplicarlo.');
    } else if (r.escrito) {
      log('Catálogo actualizado (solo se agregó; nada existente se modificó).');
    }
  });
}
