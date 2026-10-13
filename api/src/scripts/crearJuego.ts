import { randomUUID } from 'node:crypto';
import { CATALOGOS } from '../catalogos';
import { describirProblemas, esquemaCatalogo } from '../dominio/catalogo';
import { AdminModelo, JuegoModelo } from '../modelos';
import { generarApiKey, hashApiKey } from '../seguridad/apiKey';
import { ejecutarScript, ErrorScript, mostrarSecretoUnaVez, texto } from './comun';

export interface OpcionesCrearJuego {
  slug: string;
  versionActual?: string | undefined;
  // Por defecto el juego nuevo se agrega a los juegosPermitidos de todos los admins activos (S-32).
  darAccesoAAdmins?: boolean | undefined;
}

export interface ResultadoCrearJuego {
  juegoId: string;
  slug: string;
  nombre: string;
  apiKey: string;
  adminsConAcceso: number;
}

export async function crearJuego(opciones: OpcionesCrearJuego): Promise<ResultadoCrearJuego> {
  const definicion = CATALOGOS[opciones.slug];
  if (!definicion) {
    throw new ErrorScript(`No hay catálogo para "${opciones.slug}". Disponibles: ${Object.keys(CATALOGOS).join(', ')}.`);
  }
  if (await JuegoModelo.exists({ slug: definicion.slug })) {
    throw new ErrorScript(`El juego "${definicion.slug}" ya existe. Si necesitas otra API key, usa rotar-api-key.`);
  }
  const catalogo = esquemaCatalogo.safeParse(definicion.catalogo);
  if (!catalogo.success) {
    throw new ErrorScript(`Catálogo inválido: ${describirProblemas(catalogo.error)}`);
  }

  const apiKey = generarApiKey();
  const juego = await JuegoModelo.create({
    juegoId: randomUUID(),
    nombre: definicion.nombre,
    slug: definicion.slug,
    versionActual: opciones.versionActual ?? '1.0.0',
    ...(definicion.logoUrl ? { logoUrl: definicion.logoUrl } : {}),
    apiKeyHash: hashApiKey(apiKey),
    apiKeyCreadaEn: new Date(),
    catalogo: catalogo.data,
  });

  let adminsConAcceso = 0;
  if (opciones.darAccesoAAdmins !== false) {
    const resultado = await AdminModelo.updateMany({ activo: true }, { $addToSet: { juegosPermitidos: juego.juegoId } });
    adminsConAcceso = resultado.modifiedCount;
  }
  return { juegoId: juego.juegoId, slug: juego.slug, nombre: juego.nombre, apiKey, adminsConAcceso };
}

export async function main(argv: string[]): Promise<void> {
  const opciones = { juego: { type: 'string' }, version: { type: 'string' }, 'sin-acceso': { type: 'boolean', default: false } } as const;
  await ejecutarScript('crear-juego', argv, opciones, async ({ args, log }) => {
    const slug = texto(args, 'juego');
    if (!slug) {
      throw new ErrorScript(`Indica el juego con --juego <slug>. Disponibles: ${Object.keys(CATALOGOS).join(', ')}.`);
    }
    const r = await crearJuego({ slug, versionActual: texto(args, 'version'), darAccesoAAdmins: args['sin-acceso'] !== true });
    log(`Juego creado: ${r.nombre} (${r.slug})`);
    log(`juegoId: ${r.juegoId}  ← configúralo en el SDK de Unity`);
    log(`Admins con acceso agregado: ${r.adminsConAcceso}`);
    mostrarSecretoUnaVez(`API key de ${r.slug} (header X-Api-Key)`, r.apiKey, (t) => process.stdout.write(t));
  });
}
