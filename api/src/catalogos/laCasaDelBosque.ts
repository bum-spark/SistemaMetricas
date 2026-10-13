import { rutaLogoDashboard } from '../dominio/constantes';
import type { DefinicionJuego } from './tipos';

// Catálogo definitivo de La Casa del Bosque (ESQUEMA_EVENTOS.md §5.1, R-02).
// Una sola constante; se ampliará después. `suelo_descubierto` sigue abierto (A-06) y no está aquí.
// `imagenUrl` y `limites` son PROVISIONALES (A-07): imágenes SVG generadas y límites coherentes
// con las coordenadas de seed-datos, hasta tener las capturas y los límites reales de Unity.

const imagen = (nivelId: string) => `/niveles/la-casa-del-bosque/${nivelId}.svg`;

const NIVELES = [
  {
    nivelId: 'casa_abandonada',
    nombre: 'Casa abandonada',
    orden: 1,
    descripcion: 'Introducción: entra al edificio y ve la cabaña. Incluye el tutorial.',
    tieneTutorial: true,
    imagenUrl: imagen('casa_abandonada'),
    limites: { minX: 0, maxX: 120, minY: 0, maxY: 30 },
  },
  {
    nivelId: 'hospital_cuarto',
    nombre: 'Cuarto de hospital',
    orden: 2,
    descripcion: '',
    tieneTutorial: false,
    imagenUrl: imagen('hospital_cuarto'),
    limites: { minX: 0, maxX: 100, minY: 0, maxY: 30 },
  },
  {
    nivelId: 'habitacion_llamas',
    nombre: 'Habitación en llamas',
    orden: 3,
    descripcion: 'Cuarto de los cuadros en llamas. Último nivel.',
    tieneTutorial: false,
    imagenUrl: imagen('habitacion_llamas'),
    limites: { minX: 0, maxX: 140, minY: 0, maxY: 40 },
  },
];

// 4 coleccionables por nivel (constantes del seed).
const PIEZAS_DE_CARTA = 4;
const PETALOS = 4;

const coleccionables = [
  ...Array.from({ length: PIEZAS_DE_CARTA }, (_, i) => ({
    coleccionableId: `carta_pieza_${i + 1}`,
    nivelId: 'habitacion_llamas',
    nombre: `Pieza de carta ${i + 1}`,
  })),
  ...Array.from({ length: PETALOS }, (_, i) => ({
    coleccionableId: `petalo_${i + 1}`,
    nivelId: 'hospital_cuarto',
    nombre: `Pétalo ${i + 1}`,
  })),
];

export const LA_CASA_DEL_BOSQUE: DefinicionJuego = {
  nombre: 'La Casa del Bosque',
  slug: 'la-casa-del-bosque',
  logoUrl: rutaLogoDashboard('la-casa-del-bosque'),
  catalogo: {
    duracionEsperadaMs: 1200000,
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
      'flor_recogida',
      'dialogo_saltado',
      'coleccionable_encontrado',
      'tutorial_completado',
    ],
    niveles: NIVELES,
    causasMuerte: [
      { causa: 'fantasma', nombre: 'Fantasma' },
      { causa: 'lava', nombre: 'Lava' },
      { causa: 'caida', nombre: 'Caída' },
    ],
    logros: [
      { logroId: 'tutorial_superado', nombre: 'Tutorial superado', descripcion: 'Completa el tutorial de controles.', nivelId: 'casa_abandonada' },
      { logroId: 'casa_abandonada_completada', nombre: 'Casa abandonada completada', descripcion: 'Completa la casa abandonada.', nivelId: 'casa_abandonada' },
      { logroId: 'hospital_cuarto_completado', nombre: 'Cuarto de hospital completado', descripcion: 'Completa el cuarto de hospital.', nivelId: 'hospital_cuarto' },
      { logroId: 'habitacion_llamas_completada', nombre: 'Habitación en llamas completada', descripcion: 'Completa la habitación en llamas.', nivelId: 'habitacion_llamas' },
      {
        logroId: 'la_verdad',
        nombre: 'La verdad',
        descripcion: 'Reconstruye la carta con todas las piezas de la habitación en llamas',
        nivelId: 'habitacion_llamas',
      },
    ],
    coleccionables,
  },
};
