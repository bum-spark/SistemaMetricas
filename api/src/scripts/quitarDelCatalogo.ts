import { CATALOGOS } from '../catalogos';
import { describirProblemas, esquemaCatalogo } from '../dominio/catalogo';
import { EventoModelo, JuegoModelo, LogroObtenidoModelo } from '../modelos';
import { ejecutarScript, ErrorScript, texto } from './comun';

// Quita un logro del catálogo de un juego que YA existe en la base (S-72). Es el complemento de
// sincronizar-catalogo, que solo agrega:
// - Se niega si el logro sigue en la constante del catálogo (sincronizar-catalogo lo volvería a
//   agregar): primero se quita de api/src/catalogos/ y se despliega.
// - No borra datos: los logros obtenidos y los eventos que lo mencionan se conservan; solo se
//   informa cuántos hay. Al quitarlo, el dashboard deja de mostrarlo y la API rechaza los eventos
//   nuevos con ese logroId.
// - El catálogo resultante se valida con el mismo esquema zod antes de escribir.

export interface ResultadoQuitarLogro {
  slug: string;
  logroId: string;
  nombre: string;
  antes: string[];
  despues: string[];
  // Datos que lo mencionan (se conservan).
  jugadoresConLogro: number;
  eventosConLogro: number;
  escrito: boolean;
}

export async function quitarLogroDelCatalogo(slug: string, logroId: string, opciones: { simular?: boolean } = {}): Promise<ResultadoQuitarLogro> {
  const juego = await JuegoModelo.findOne({ slug });
  if (!juego) {
    throw new ErrorScript(`No existe un juego con slug "${slug}" en la base.`);
  }
  const actual = esquemaCatalogo.safeParse(juego.toObject().catalogo);
  if (!actual.success) {
    throw new ErrorScript(`El catálogo guardado de ${slug} no es válido; corrígelo antes de quitar nada: ${describirProblemas(actual.error)}`);
  }
  const logros = actual.data.logros;
  const logro = logros.find((l) => l.logroId === logroId);
  if (!logro) {
    throw new ErrorScript(`El logro "${logroId}" no está en el catálogo de ${slug} en la base. Logros: ${logros.map((l) => l.logroId).join(', ') || '(ninguno)'}.`);
  }
  const constante = CATALOGOS[slug];
  if (constante && esquemaCatalogo.parse(constante.catalogo).logros.some((l) => l.logroId === logroId)) {
    throw new ErrorScript(
      `El logro "${logroId}" sigue en la constante del catálogo (api/src/catalogos/): sincronizar-catalogo lo volvería a agregar. ` +
        'Quítalo primero de la constante, despliega y luego vuelve a correr este script.',
    );
  }

  const propuesto = { ...actual.data, logros: logros.filter((l) => l.logroId !== logroId) };
  const revision = esquemaCatalogo.safeParse(propuesto);
  if (!revision.success) {
    throw new ErrorScript(`El catálogo quedaría inválido; no se escribió nada: ${describirProblemas(revision.error)}`);
  }

  const [jugadoresConLogro, eventosConLogro] = await Promise.all([
    LogroObtenidoModelo.countDocuments({ juegoId: juego.juegoId, logroId }),
    EventoModelo.countDocuments({ juegoId: juego.juegoId, tipo: 'logro', 'data.logroId': logroId }),
  ]);

  let escrito = false;
  if (!opciones.simular) {
    // $pull solo de ese logro: el resto del catálogo no se reescribe.
    await JuegoModelo.updateOne({ _id: juego._id }, { $pull: { 'catalogo.logros': { logroId } } });
    escrito = true;
  }
  return {
    slug,
    logroId,
    nombre: logro.nombre,
    antes: logros.map((l) => l.logroId),
    despues: propuesto.logros.map((l) => l.logroId),
    jugadoresConLogro,
    eventosConLogro,
    escrito,
  };
}

export async function main(argv: string[]): Promise<void> {
  const opciones = { juego: { type: 'string' }, logro: { type: 'string' }, simular: { type: 'boolean', default: false } } as const;
  await ejecutarScript('quitar-del-catalogo', argv, opciones, async ({ args, log }) => {
    const slug = texto(args, 'juego');
    const logroId = texto(args, 'logro');
    if (!slug || !logroId) {
      throw new ErrorScript('Indica el juego y el logro: --juego <slug> --logro <logroId>.');
    }
    const simular = args.simular === true;
    const r = await quitarLogroDelCatalogo(slug, logroId, { simular });
    log(`logros antes   (${r.antes.length}): ${r.antes.join(', ')}`);
    log(`logros ${simular ? 'quitaría' : 'quitó   '}  (−1): ${r.logroId} (${r.nombre})`);
    log(`logros después (${r.despues.length}): ${r.despues.join(', ') || '—'}`);
    log(
      `Datos que lo mencionan (se conservan, no se borran): ${r.jugadoresConLogro} jugador(es) con el logro y ${r.eventosConLogro} evento(s) "logro". ` +
        'El dashboard deja de mostrarlo y la API rechazará los eventos nuevos con ese logroId.',
    );
    log(simular ? 'Simulación: no se escribió nada. Vuelve a correrlo sin --simular para aplicarlo.' : 'Catálogo actualizado (solo se quitó ese logro).');
  });
}
