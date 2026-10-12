import type { DefinicionJuego } from './tipos';

// Segundo juego ficticio, solo para datos de prueba (ESQUEMA_EVENTOS.md §5.2, S-27).
// Distinto a propósito: 4 niveles, otras causas, sin tutorial, 3 conchas en el primer nivel,
// y solo tipos de evento que ya existen (S-28). Sus datos siempre son origen "seed" (R-32).

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
      { nivelId: 'muelle', nombre: 'Muelle', orden: 1, descripcion: '', tieneTutorial: false },
      { nivelId: 'escalera_faro', nombre: 'Escalera del faro', orden: 2, descripcion: '', tieneTutorial: false },
      { nivelId: 'sala_lampara', nombre: 'Sala de la lámpara', orden: 3, descripcion: '', tieneTutorial: false },
      { nivelId: 'azotea', nombre: 'Azotea', orden: 4, descripcion: '', tieneTutorial: false },
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
