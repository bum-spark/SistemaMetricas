import { Catalogo, PasoEmbudo } from '../../core/api/tipos';
import { ES } from '../../i18n/es';
import { PasoVisible } from '../../shared/charts/embudo/embudo';

// Nombre visible de cada paso del embudo: el nombre del nivel en el catálogo o "Terminaron".
// Nunca se escribe un nivelId en el código (DISENO_DASHBOARD.md §1).
export function pasosVisibles(pasos: readonly PasoEmbudo[], catalogo: Catalogo | null): PasoVisible[] {
  return pasos.map((p) => ({
    etiqueta: p.paso === 'terminaron' ? ES.embudo.terminaron : (catalogo?.niveles.find((n) => n.nivelId === p.paso)?.nombre ?? p.paso),
    jugadores: p.jugadores,
    porcentaje: p.porcentaje,
  }));
}
