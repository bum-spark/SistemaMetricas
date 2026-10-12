import { JuegoModelo } from '../modelos';
import { generarApiKey, hashApiKey } from '../seguridad/apiKey';
import { ejecutarScript, ErrorScript, mostrarSecretoUnaVez, texto } from './comun';

async function buscarJuego(slug: string) {
  const juego = await JuegoModelo.findOne({ slug });
  if (!juego) {
    throw new ErrorScript(`No existe un juego con slug "${slug}".`);
  }
  return juego;
}

// Genera una key nueva y reemplaza el hash: la anterior deja de servir al instante.
export async function rotarApiKey(slug: string): Promise<{ slug: string; apiKey: string }> {
  const juego = await buscarJuego(slug);
  const apiKey = generarApiKey();
  juego.apiKeyHash = hashApiKey(apiKey);
  juego.apiKeyCreadaEn = new Date();
  await juego.save();
  return { slug: juego.slug, apiKey };
}

// El juego deja de poder mandar datos; lo ya guardado se conserva.
export async function revocarApiKey(slug: string): Promise<{ slug: string; yaEstabaRevocada: boolean }> {
  const juego = await buscarJuego(slug);
  const yaEstabaRevocada = juego.apiKeyHash === null;
  juego.apiKeyHash = null;
  await juego.save();
  return { slug: juego.slug, yaEstabaRevocada };
}

function slugObligatorio(valor: string | undefined): string {
  if (!valor) {
    throw new ErrorScript('Indica el juego con --juego <slug>.');
  }
  return valor;
}

export async function mainRotar(argv: string[]): Promise<void> {
  await ejecutarScript('rotar-api-key', argv, { juego: { type: 'string' } }, async ({ args, log }) => {
    const r = await rotarApiKey(slugObligatorio(texto(args, 'juego')));
    log(`API key rotada para ${r.slug}. La anterior ya no funciona: actualiza el build de Unity.`);
    mostrarSecretoUnaVez(`Nueva API key de ${r.slug} (header X-Api-Key)`, r.apiKey, (t) => process.stdout.write(t));
  });
}

export async function mainRevocar(argv: string[]): Promise<void> {
  await ejecutarScript('revocar-api-key', argv, { juego: { type: 'string' } }, async ({ args, log }) => {
    const r = await revocarApiKey(slugObligatorio(texto(args, 'juego')));
    log(
      r.yaEstabaRevocada
        ? `La API key de ${r.slug} ya estaba revocada.`
        : `API key de ${r.slug} revocada. El juego ya no puede mandar datos; los datos guardados se conservan.`,
    );
    log('Para volver a habilitarlo, usa rotar-api-key.');
  });
}
