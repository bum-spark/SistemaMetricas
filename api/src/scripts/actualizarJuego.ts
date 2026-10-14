import { problemaLogoUrl } from '../dominio/constantes';
import { JuegoModelo } from '../modelos';
import { ejecutarScript, ErrorScript, texto } from './comun';

export interface CambiosJuego {
  logoUrl?: string | undefined;
}

export interface ResultadoActualizarJuego {
  slug: string;
  cambios: { campo: string; antes: unknown; despues: unknown }[];
}

// Git Bash en Windows convierte "/logos/..." en "C:/Program Files/Git/logos/..." al pasarlo a
// un programa. Se detecta para dar un mensaje útil en vez de un rechazo genérico.
function pareceRutaConvertida(valor: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(valor) && /logos[\\/]/.test(valor);
}

// Modifica SOLO los campos pedidos de un juego existente (hoy: logoUrl). Valida igual que la API
// (mismo problemaLogoUrl que el modelo) y no toca catálogo, API key ni datos.
export async function actualizarJuego(slug: string, cambios: CambiosJuego): Promise<ResultadoActualizarJuego> {
  if (cambios.logoUrl === undefined) {
    throw new ErrorScript('No hay nada que cambiar: indica al menos un campo (por ejemplo --logo-url /logos/<slug>/logo.png).');
  }
  const juego = await JuegoModelo.findOne({ slug });
  if (!juego) {
    throw new ErrorScript(`No existe un juego con slug "${slug}".`);
  }
  const resultado: ResultadoActualizarJuego = { slug, cambios: [] };

  const logoUrl = cambios.logoUrl.trim();
  if (pareceRutaConvertida(logoUrl)) {
    throw new ErrorScript(
      `logoUrl "${logoUrl}" parece una ruta convertida por Git Bash. Usa PowerShell o antepón MSYS_NO_PATHCONV=1 al comando.`,
    );
  }
  const problema = problemaLogoUrl(logoUrl, slug);
  if (problema) {
    throw new ErrorScript(problema);
  }
  if (juego.logoUrl !== logoUrl) {
    resultado.cambios.push({ campo: 'logoUrl', antes: juego.logoUrl ?? null, despues: logoUrl });
    // $set de un solo campo: el resto del documento no se reescribe.
    await JuegoModelo.updateOne({ _id: juego._id }, { $set: { logoUrl } });
  }
  return resultado;
}

export async function main(argv: string[]): Promise<void> {
  const opciones = { juego: { type: 'string' }, 'logo-url': { type: 'string' } } as const;
  await ejecutarScript('actualizar-juego', argv, opciones, async ({ args, log }) => {
    const slug = texto(args, 'juego');
    if (!slug) {
      throw new ErrorScript('Indica el juego con --juego <slug>.');
    }
    const r = await actualizarJuego(slug, { logoUrl: typeof args['logo-url'] === 'string' ? args['logo-url'] : undefined });
    if (r.cambios.length === 0) {
      log(`El juego ${r.slug} ya tenía esos valores; no se modificó nada.`);
      return;
    }
    for (const c of r.cambios) {
      log(`${r.slug}.${c.campo}: ${JSON.stringify(c.antes)} → ${JSON.stringify(c.despues)}`);
    }
  });
}
