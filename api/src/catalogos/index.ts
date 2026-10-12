import { FARO_NOCTURNO_DEMO } from './faroNocturnoDemo';
import { LA_CASA_DEL_BOSQUE } from './laCasaDelBosque';
import type { DefinicionJuego } from './tipos';

export type { DefinicionJuego } from './tipos';
export { FARO_NOCTURNO_DEMO, LA_CASA_DEL_BOSQUE };

// Juegos que los scripts saben dar de alta, por slug.
export const CATALOGOS: Readonly<Record<string, DefinicionJuego>> = {
  [LA_CASA_DEL_BOSQUE.slug]: LA_CASA_DEL_BOSQUE,
  [FARO_NOCTURNO_DEMO.slug]: FARO_NOCTURNO_DEMO,
};
