import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { esquemaCatalogo, esquemaNivel } from '../dominio/catalogo';
import { problemaLogoUrl } from '../dominio/constantes';
import { describirIssue } from '../dominio/zodEs';
import { JuegoModelo } from '../modelos';
import { ejecutarScript, ErrorScript, texto } from './comun';
import { diferenciaProporcion, dimensionesImagen } from './dimensionesImagen';
import { CARPETA_PUBLICA } from './imagenesNiveles';

export interface Limites {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CambiosNivel {
  nivelId: string;
  imagenUrl?: string | undefined;
  limites?: Limites | undefined;
}

export interface CambiosJuego {
  logoUrl?: string | undefined;
  nivel?: CambiosNivel | undefined;
}

export interface ResultadoActualizarJuego {
  slug: string;
  cambios: { campo: string; antes: unknown; despues: unknown }[];
  // Valores del nivel antes y después (se imprimen aunque no cambien).
  nivel?: { nivelId: string; antes: { imagenUrl: string | null; limites: Limites | null }; despues: { imagenUrl: string | null; limites: Limites | null } };
  avisos: string[];
}

// Proporción imagen / límites que se tolera sin aviso (2 %).
export const TOLERANCIA_PROPORCION = 0.02;

// Git Bash en Windows convierte "/logos/..." o "/niveles/..." en "C:/Program Files/Git/..." al
// pasarlo a un programa. Se detecta para dar un mensaje útil en vez de un rechazo genérico.
function pareceRutaConvertida(valor: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(valor) && /(logos|niveles)[\\/]/.test(valor);
}

function rechazarRutaConvertida(campo: string, valor: string): void {
  if (pareceRutaConvertida(valor)) {
    throw new ErrorScript(`${campo} "${valor}" parece una ruta convertida por Git Bash. Usa PowerShell o antepón MSYS_NO_PATHCONV=1 al comando.`);
  }
}

// "minX,maxX,minY,maxY" → límites validados (números finitos y min < max en los dos ejes).
export function leerLimites(valor: string): Limites {
  const partes = valor.split(',').map((p) => p.trim());
  const numeros = partes.map(Number);
  if (partes.length !== 4 || partes.some((p) => p === '') || numeros.some((n) => !Number.isFinite(n))) {
    throw new ErrorScript(`--limites debe tener 4 números separados por coma: minX,maxX,minY,maxY (recibido "${valor}").`);
  }
  const [minX, maxX, minY, maxY] = numeros as [number, number, number, number];
  if (!(minX < maxX) || !(minY < maxY)) {
    throw new ErrorScript(`--limites: debe cumplirse minX < maxX y minY < maxY (recibido ${minX},${maxX},${minY},${maxY}).`);
  }
  return { minX, maxX, minY, maxY };
}

// Límites tal como vienen de Mongoose (campos anidados opcionales) → Limites o null.
function limitesGuardados(l: { minX?: number | null; maxX?: number | null; minY?: number | null; maxY?: number | null } | null | undefined): Limites | null {
  if (!l || [l.minX, l.maxX, l.minY, l.maxY].some((v) => typeof v !== 'number')) {
    return null;
  }
  return { minX: l.minX!, maxX: l.maxX!, minY: l.minY!, maxY: l.maxY! };
}

function formatoLimites(l: Limites | null): string {
  return l ? `${l.minX},${l.maxX},${l.minY},${l.maxY}` : 'null';
}

// Si la imagen es una ruta del dashboard y el archivo existe en dashboard/public, compara su
// proporción con la de los límites.
function revisarImagen(imagenUrl: string | null, limites: Limites | null, carpetaPublica: string): string[] {
  if (!imagenUrl || !imagenUrl.startsWith('/')) {
    return [];
  }
  const archivo = path.join(carpetaPublica, ...imagenUrl.split('?')[0]!.split('/').filter(Boolean));
  if (!existsSync(archivo)) {
    return [`La imagen ${imagenUrl} no existe en dashboard/public: súbela al dashboard antes de publicar este cambio.`];
  }
  const d = dimensionesImagen(readFileSync(archivo));
  if (!d) {
    return [`No se pudieron leer las dimensiones de ${imagenUrl} (se aceptan PNG, WebP, JPEG y SVG); no se comparó la proporción.`];
  }
  if (!limites) {
    return [];
  }
  const diferencia = diferenciaProporcion(d, limites);
  if (diferencia > TOLERANCIA_PROPORCION) {
    const mundo = (limites.maxX - limites.minX) / (limites.maxY - limites.minY);
    return [
      `La proporción de la imagen (${d.ancho}×${d.alto} px = ${(d.ancho / d.alto).toFixed(3)}) difiere ${(diferencia * 100).toFixed(1)} % ` +
        `de la de los límites (${mundo.toFixed(3)}): el mapa de calor quedará deformado. Revisa la captura o los límites.`,
    ];
  }
  return [];
}

// Modifica SOLO los campos pedidos de un juego existente: logoUrl y/o la imagen y los límites de
// UN nivel del catálogo. Valida igual que la API y no toca el resto del catálogo, la API key ni
// los datos. Si el valor ya es el mismo, no escribe.
export async function actualizarJuego(slug: string, cambios: CambiosJuego, opciones: { carpetaPublica?: string } = {}): Promise<ResultadoActualizarJuego> {
  const nivel = cambios.nivel;
  if (cambios.logoUrl === undefined && !nivel) {
    throw new ErrorScript('No hay nada que cambiar: indica --logo-url, o --nivel con --imagen-url y/o --limites.');
  }
  if (nivel && nivel.imagenUrl === undefined && nivel.limites === undefined) {
    throw new ErrorScript(`No hay nada que cambiar en el nivel ${nivel.nivelId}: indica --imagen-url y/o --limites.`);
  }
  const juego = await JuegoModelo.findOne({ slug });
  if (!juego) {
    throw new ErrorScript(`No existe un juego con slug "${slug}".`);
  }
  const resultado: ResultadoActualizarJuego = { slug, cambios: [], avisos: [] };

  // ---------- logoUrl ----------
  if (cambios.logoUrl !== undefined) {
    const logoUrl = cambios.logoUrl.trim();
    rechazarRutaConvertida('logoUrl', logoUrl);
    const problema = problemaLogoUrl(logoUrl, slug);
    if (problema) {
      throw new ErrorScript(problema);
    }
    if (juego.logoUrl !== logoUrl) {
      resultado.cambios.push({ campo: 'logoUrl', antes: juego.logoUrl ?? null, despues: logoUrl });
    }
  }

  // ---------- nivel ----------
  const set: Record<string, unknown> = {};
  if (nivel) {
    const actual = juego.catalogo.niveles.find((n) => n.nivelId === nivel.nivelId);
    if (!actual) {
      const existentes = juego.catalogo.niveles.map((n) => n.nivelId).join(', ');
      throw new ErrorScript(`El nivel "${nivel.nivelId}" no existe en el catálogo de ${slug}. Niveles: ${existentes}.`);
    }
    const antes: { imagenUrl: string | null; limites: Limites | null } = { imagenUrl: actual.imagenUrl ?? null, limites: limitesGuardados(actual.limites) };
    const despues = { ...antes };
    if (nivel.imagenUrl !== undefined) {
      const imagenUrl = nivel.imagenUrl.trim();
      rechazarRutaConvertida('imagenUrl', imagenUrl);
      // La misma regla que el catálogo de la API (esquemaNivel).
      const valida = esquemaNivel.shape.imagenUrl.safeParse(imagenUrl);
      if (!valida.success) {
        throw new ErrorScript(`imagenUrl: ${valida.error.issues.map((i) => describirIssue(i)).join('; ')}`);
      }
      despues.imagenUrl = imagenUrl;
    }
    if (nivel.limites !== undefined) {
      despues.limites = nivel.limites;
    }
    resultado.nivel = { nivelId: nivel.nivelId, antes, despues };
    if (despues.imagenUrl !== antes.imagenUrl) {
      resultado.cambios.push({ campo: `nivel ${nivel.nivelId}.imagenUrl`, antes: antes.imagenUrl, despues: despues.imagenUrl });
      set['catalogo.niveles.$[n].imagenUrl'] = despues.imagenUrl;
    }
    if (formatoLimites(despues.limites) !== formatoLimites(antes.limites)) {
      resultado.cambios.push({ campo: `nivel ${nivel.nivelId}.limites`, antes: formatoLimites(antes.limites), despues: formatoLimites(despues.limites) });
      set['catalogo.niveles.$[n].limites'] = despues.limites;
    }
    // El catálogo completo debe seguir siendo válido con el cambio.
    const catalogo = juego.toObject().catalogo as unknown as { niveles: Record<string, unknown>[] };
    const propuesto = {
      ...catalogo,
      niveles: catalogo.niveles.map((n) => (n.nivelId === nivel.nivelId ? { ...n, imagenUrl: despues.imagenUrl ?? undefined, limites: despues.limites ?? undefined } : n)),
    };
    const revision = esquemaCatalogo.safeParse(propuesto);
    if (!revision.success) {
      throw new ErrorScript(`El catálogo quedaría inválido: ${revision.error.issues.map((i) => describirIssue(i)).join('; ')}`);
    }
    resultado.avisos.push(...revisarImagen(despues.imagenUrl, despues.limites, opciones.carpetaPublica ?? CARPETA_PUBLICA));
  }

  // $set solo de los campos que cambian: el resto del documento (y de los demás niveles) no se reescribe.
  const logo = resultado.cambios.find((c) => c.campo === 'logoUrl');
  if (logo) {
    set.logoUrl = logo.despues;
  }
  if (Object.keys(set).length > 0) {
    await JuegoModelo.updateOne({ _id: juego._id }, { $set: set }, nivel ? { arrayFilters: [{ 'n.nivelId': nivel.nivelId }] } : {});
  }
  return resultado;
}

export async function main(argv: string[]): Promise<void> {
  const opciones = {
    juego: { type: 'string' },
    'logo-url': { type: 'string' },
    nivel: { type: 'string' },
    'imagen-url': { type: 'string' },
    limites: { type: 'string' },
  } as const;
  await ejecutarScript('actualizar-juego', argv, opciones, async ({ args, log }) => {
    const slug = texto(args, 'juego');
    if (!slug) {
      throw new ErrorScript('Indica el juego con --juego <slug>.');
    }
    const nivelId = texto(args, 'nivel');
    const imagenUrl = typeof args['imagen-url'] === 'string' ? args['imagen-url'] : undefined;
    const limitesTexto = texto(args, 'limites');
    if (!nivelId && (imagenUrl !== undefined || limitesTexto !== undefined)) {
      throw new ErrorScript('--imagen-url y --limites requieren --nivel <nivelId>.');
    }
    const r = await actualizarJuego(slug, {
      logoUrl: typeof args['logo-url'] === 'string' ? args['logo-url'] : undefined,
      nivel: nivelId ? { nivelId, imagenUrl, limites: limitesTexto === undefined ? undefined : leerLimites(limitesTexto) } : undefined,
    });
    if (r.nivel) {
      const { antes, despues } = r.nivel;
      log(`Nivel ${r.nivel.nivelId} antes:   imagenUrl=${JSON.stringify(antes.imagenUrl)} limites=${formatoLimites(antes.limites)}`);
      log(`Nivel ${r.nivel.nivelId} después: imagenUrl=${JSON.stringify(despues.imagenUrl)} limites=${formatoLimites(despues.limites)}`);
    }
    for (const aviso of r.avisos) {
      log(`AVISO: ${aviso}`);
    }
    if (r.cambios.length === 0) {
      log(`El juego ${r.slug} ya tenía esos valores; no se modificó nada.`);
      return;
    }
    for (const c of r.cambios) {
      log(`${r.slug}.${c.campo}: ${JSON.stringify(c.antes)} → ${JSON.stringify(c.despues)}`);
    }
  });
}
