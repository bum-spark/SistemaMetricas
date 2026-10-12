import type { DefinicionJuego } from './tipos';

// Segundo juego ficticio, solo para datos de prueba (ESQUEMA_EVENTOS.md §5.2, S-27).
// Distinto a propósito: 4 niveles, otras causas, sin tutorial, 3 conchas en el primer nivel,
// y solo tipos de evento que ya existen (S-28). Sus datos siempre son origen "seed" (R-32).
// `imagenUrl` y `limites` provisionales (A-07), coherentes con seed-datos.

const imagen = (nivelId: string) => `/niveles/faro-nocturno-demo/${nivelId}.svg`;

export const FARO_NOCTURNO_DEMO: DefinicionJuego = {
  nombre: 'Faro Nocturno (demo)',
  slug: 'faro-nocturno-demo',
  catalogo: {
    duracionEsperadaMs: 900000,
    tiposEvento: [
      'sesion_inicio',
      'sesion_fin',
      'nivel_inicio',
      'nivel_fin',
      'muerte',
      'logro',
      'pausa',
      'inactividad',
      'error',
      'rendimiento',
      'coleccionable_encontrado',
      'dialogo_saltado',
    ],
    niveles: [
      { nivelId: 'muelle', nombre: 'Muelle', orden: 1, descripcion: '', tieneTutorial: false, imagenUrl: imagen('muelle'), limites: { minX: 0, maxX: 80, minY: 0, maxY: 20 } },
      { nivelId: 'escalera_faro', nombre: 'Escalera del faro', orden: 2, descripcion: '', tieneTutorial: false, imagenUrl: imagen('escalera_faro'), limites: { minX: 0, maxX: 30, minY: 0, maxY: 90 } },
      { nivelId: 'sala_lampara', nombre: 'Sala de la lámpara', orden: 3, descripcion: '', tieneTutorial: false, imagenUrl: imagen('sala_lampara'), limites: { minX: 0, maxX: 60, minY: 0, maxY: 40 } },
      { nivelId: 'azotea', nombre: 'Azotea', orden: 4, descripcion: '', tieneTutorial: false, imagenUrl: imagen('azotea'), limites: { minX: 0, maxX: 90, minY: 0, maxY: 30 } },
    ],
    causasMuerte: [
      { causa: 'agua', nombre: 'Agua' },
      { causa: 'caida', nombre: 'Caída' },
      { causa: 'cuervo', nombre: 'Cuervo' },
    ],
    logros: [
      { logroId: 'primer_paso', nombre: 'Primer paso', descripcion: 'Completa el muelle.', nivelId: 'muelle' },
      { logroId: 'luz_encendida', nombre: 'Luz encendida', descripcion: 'Completa la azotea.', nivelId: 'azotea' },
      { logroId: 'coleccionista', nombre: 'Coleccionista', descripcion: 'Encuentra las 3 conchas.', nivelId: 'muelle' },
    ],
    coleccionables: [1, 2, 3].map((n) => ({ coleccionableId: `concha_${n}`, nivelId: 'muelle', nombre: `Concha ${n}` })),
  },
};
