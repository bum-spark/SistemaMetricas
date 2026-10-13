import { MuertesNivelCausa } from '../app/core/api/tipos';

// Respuesta de prueba de /muertes para el catálogo de prueba.
export const MUERTES: MuertesNivelCausa[] = [
  { nivelId: 'nivel_a', causa: 'pinchos', muertes: 30, jugadores: 20, muertesPorJugador: 1.5 },
  { nivelId: 'nivel_a', causa: 'agua', muertes: 10, jugadores: 10, muertesPorJugador: 1 },
  { nivelId: 'nivel_b', causa: 'agua', muertes: 60, jugadores: 25, muertesPorJugador: 2.4 },
];
