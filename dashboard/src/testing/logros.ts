import { Catalogo, LogroObtenido } from '../app/core/api/tipos';
import { CATALOGO_PRUEBA } from './juego';

// Catálogo de prueba con logros y la respuesta de /logros (300 jugadores en el filtro).
export const CATALOGO_LOGROS: Catalogo = {
  ...CATALOGO_PRUEBA,
  logros: [
    { logroId: 'logro_a', nombre: 'Logro A', descripcion: 'Completa el nivel A.' },
    { logroId: 'logro_b', nombre: 'Logro B', descripcion: 'Encuentra el objeto escondido.' },
    { logroId: 'logro_c', nombre: 'Logro C' },
  ],
};

export const LOGROS: LogroObtenido[] = [
  { logroId: 'logro_a', nombre: 'Logro A', jugadores: 240, porcentaje: 80 },
  { logroId: 'logro_b', nombre: 'Logro B', jugadores: 6, porcentaje: 2 },
  { logroId: 'logro_c', nombre: 'Logro C', jugadores: 0, porcentaje: 0 },
];
