import type { Plataforma } from '../dominio/constantes';

// Forma de los datos de prueba por juego (seed-datos). Valores ajustados para que el
// dashboard muestre patrones creíbles: embudo con caída, puntos calientes de muertes,
// una build mejor que la otra y duraciones con dispersión alrededor de lo esperado.

export interface ZonaMuerte {
  x: number;
  y: number;
  // Dispersión (desviación estándar) en unidades de mundo.
  radioX: number;
  radioY: number;
  causa: string;
  peso: number;
  // Solo para dibujar la imagen provisional del nivel.
  dibujo: 'fantasma' | 'lava' | 'hueco' | 'agua' | 'cuervo';
}

export interface PerfilNivel {
  nivelId: string;
  // Duración del intento que completa el nivel (lognormal).
  medianaCompletadoMs: number;
  sigma: number;
  // Probabilidad de morir en cada intento (build 1.0.0; la 1.0.1 multiplica por FACTOR_MUERTE_BUILD_NUEVA).
  probMuerte: number;
  // P(completar el nivel | lo empezó), build 1.0.0 y 1.0.1 promediadas.
  probCompletar: number;
  zonas: ZonaMuerte[];
  // Logro que manda Unity junto con nivel_fin completado (R-03).
  logroAlCompletar?: string;
  // Coleccionables del nivel y probabilidad de encontrar cada uno en el intento completado.
  coleccionables?: { ids: string[]; prob: number; logroAlCompletarTodos?: string };
}

export interface PerfilJuego {
  slug: string;
  jugadoresPorDefecto: number;
  niveles: PerfilNivel[];
  // P(empezar el siguiente nivel | completó el anterior): el resto abandona "entre niveles".
  probSeguirTrasCompletar: number;
  // Fracción de sesiones que terminan sin sesion_fin (crash o cierre forzado).
  probCrash: number;
  tutorial?: { nivelId: string; prob: number; logro: string };
  usaFlor: boolean;
  dialogos: string[];
}

export const BUILDS = { vieja: '1.0.0', nueva: '1.0.1' } as const;
// La build 1.0.1 es "mejor": menos muertes y más jugadores que avanzan.
export const FACTOR_MUERTE_BUILD_NUEVA = 0.7;
export const AJUSTE_COMPLETAR_BUILD = 0.08;

export const PLATAFORMAS_PESOS: { valor: Plataforma; peso: number }[] = [
  { valor: 'windows', peso: 42 },
  { valor: 'android', peso: 24 },
  { valor: 'webgl', peso: 12 },
  { valor: 'macos', peso: 10 },
  { valor: 'linux', peso: 6 },
  { valor: 'ios', peso: 6 },
];

// FPS promedio típico por plataforma (evento rendimiento).
export const FPS_POR_PLATAFORMA: Record<Plataforma, number> = {
  windows: 58,
  macos: 56,
  linux: 52,
  webgl: 45,
  android: 41,
  ios: 55,
};

const MIN = 60_000;

// La Casa del Bosque: objetivo de embudo ≈ 100 % → 70 % → 45 % → 30 % terminan.
// probCompletar × probSeguirTrasCompletar ≈ 0.70, 0.643; el último nivel ≈ 0.667.
export const PERFIL_LA_CASA_DEL_BOSQUE: PerfilJuego = {
  slug: 'la-casa-del-bosque',
  jugadoresPorDefecto: 300,
  probSeguirTrasCompletar: 0.93,
  probCrash: 0.1,
  tutorial: { nivelId: 'casa_abandonada', prob: 0.92, logro: 'tutorial_superado' },
  usaFlor: true,
  dialogos: ['abuela_intro', 'puerta_cerrada', 'recuerdo_cocina', 'enfermera', 'carta_final'],
  niveles: [
    {
      nivelId: 'casa_abandonada',
      medianaCompletadoMs: 7.4 * MIN,
      sigma: 0.35,
      probMuerte: 0.3,
      probCompletar: 0.753,
      logroAlCompletar: 'casa_abandonada_completada',
      zonas: [
        { x: 46, y: 6, radioX: 3.5, radioY: 1.6, causa: 'fantasma', peso: 0.5, dibujo: 'fantasma' },
        { x: 78, y: 2, radioX: 2.2, radioY: 1.1, causa: 'caida', peso: 0.33, dibujo: 'hueco' },
        { x: 103, y: 18, radioX: 2.8, radioY: 1.8, causa: 'fantasma', peso: 0.17, dibujo: 'fantasma' },
      ],
    },
    {
      nivelId: 'hospital_cuarto',
      medianaCompletadoMs: 8 * MIN,
      sigma: 0.38,
      probMuerte: 0.4,
      probCompletar: 0.691,
      logroAlCompletar: 'hospital_cuarto_completado',
      coleccionables: { ids: ['petalo_1', 'petalo_2', 'petalo_3', 'petalo_4'], prob: 0.6 },
      zonas: [
        { x: 31, y: 8, radioX: 3, radioY: 1.8, causa: 'fantasma', peso: 0.45, dibujo: 'fantasma' },
        { x: 62, y: 2, radioX: 2.4, radioY: 1, causa: 'caida', peso: 0.35, dibujo: 'hueco' },
        { x: 86, y: 21, radioX: 3, radioY: 2, causa: 'fantasma', peso: 0.2, dibujo: 'fantasma' },
      ],
    },
    {
      nivelId: 'habitacion_llamas',
      medianaCompletadoMs: 9 * MIN,
      sigma: 0.4,
      probMuerte: 0.5,
      probCompletar: 0.667,
      logroAlCompletar: 'habitacion_llamas_completada',
      coleccionables: {
        ids: ['carta_pieza_1', 'carta_pieza_2', 'carta_pieza_3', 'carta_pieza_4'],
        prob: 0.55,
        logroAlCompletarTodos: 'la_verdad',
      },
      zonas: [
        { x: 40, y: 2, radioX: 3.2, radioY: 1, causa: 'lava', peso: 0.42, dibujo: 'lava' },
        { x: 96, y: 2, radioX: 3.6, radioY: 1, causa: 'lava', peso: 0.33, dibujo: 'lava' },
        { x: 121, y: 26, radioX: 3, radioY: 2, causa: 'fantasma', peso: 0.25, dibujo: 'fantasma' },
      ],
    },
  ],
};

// Faro Nocturno (demo): 4 niveles, sin tutorial ni flor. Embudo ≈ 100 → 72 → 52 → 38 → 27 %.
export const PERFIL_FARO_NOCTURNO_DEMO: PerfilJuego = {
  slug: 'faro-nocturno-demo',
  jugadoresPorDefecto: 150,
  probSeguirTrasCompletar: 0.95,
  probCrash: 0.08,
  usaFlor: false,
  dialogos: ['farero', 'gaviota', 'diario'],
  niveles: [
    {
      nivelId: 'muelle',
      medianaCompletadoMs: 5 * MIN,
      sigma: 0.32,
      probMuerte: 0.3,
      probCompletar: 0.758,
      logroAlCompletar: 'primer_paso',
      coleccionables: { ids: ['concha_1', 'concha_2', 'concha_3'], prob: 0.6, logroAlCompletarTodos: 'coleccionista' },
      zonas: [
        { x: 21, y: 1, radioX: 2.2, radioY: 0.6, causa: 'agua', peso: 0.45, dibujo: 'agua' },
        { x: 55, y: 1, radioX: 2.6, radioY: 0.6, causa: 'agua', peso: 0.35, dibujo: 'agua' },
        { x: 70, y: 13, radioX: 2.5, radioY: 1.5, causa: 'cuervo', peso: 0.2, dibujo: 'cuervo' },
      ],
    },
    {
      nivelId: 'escalera_faro',
      medianaCompletadoMs: 5.6 * MIN,
      sigma: 0.34,
      probMuerte: 0.38,
      probCompletar: 0.76,
      zonas: [
        { x: 15, y: 30, radioX: 2, radioY: 3, causa: 'caida', peso: 0.5, dibujo: 'hueco' },
        { x: 12, y: 62, radioX: 2, radioY: 3, causa: 'caida', peso: 0.3, dibujo: 'hueco' },
        { x: 21, y: 81, radioX: 2.2, radioY: 2.4, causa: 'cuervo', peso: 0.2, dibujo: 'cuervo' },
      ],
    },
    {
      nivelId: 'sala_lampara',
      medianaCompletadoMs: 6 * MIN,
      sigma: 0.36,
      probMuerte: 0.42,
      probCompletar: 0.768,
      zonas: [
        { x: 25, y: 4, radioX: 2.4, radioY: 1.2, causa: 'caida', peso: 0.6, dibujo: 'hueco' },
        { x: 46, y: 30, radioX: 2.6, radioY: 2, causa: 'cuervo', peso: 0.4, dibujo: 'cuervo' },
      ],
    },
    {
      nivelId: 'azotea',
      medianaCompletadoMs: 6.6 * MIN,
      sigma: 0.38,
      probMuerte: 0.48,
      probCompletar: 0.71,
      logroAlCompletar: 'luz_encendida',
      zonas: [
        { x: 30, y: 20, radioX: 3, radioY: 2, causa: 'cuervo', peso: 0.55, dibujo: 'cuervo' },
        { x: 71, y: 3, radioX: 2.6, radioY: 1.2, causa: 'caida', peso: 0.45, dibujo: 'hueco' },
      ],
    },
  ],
};

export const PERFILES: Readonly<Record<string, PerfilJuego>> = {
  [PERFIL_LA_CASA_DEL_BOSQUE.slug]: PERFIL_LA_CASA_DEL_BOSQUE,
  [PERFIL_FARO_NOCTURNO_DEMO.slug]: PERFIL_FARO_NOCTURNO_DEMO,
};
