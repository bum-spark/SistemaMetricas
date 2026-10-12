// Valores cerrados del contrato (ESQUEMA_EVENTOS.md §2–§4).

export const PLATAFORMAS = ['windows', 'macos', 'linux', 'webgl', 'android', 'ios'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

export const TIPOS_EVENTO_GENERICOS = [
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
] as const;

// Tipos específicos que la API sabe validar hoy. Cada juego elige en su catálogo cuáles acepta.
export const TIPOS_EVENTO_ESPECIFICOS = [
  'flor_recogida',
  'dialogo_saltado',
  'coleccionable_encontrado',
  'tutorial_completado',
] as const;

export const TIPOS_EVENTO = [...TIPOS_EVENTO_GENERICOS, ...TIPOS_EVENTO_ESPECIFICOS] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const VERSIONES_ESQUEMA = [1] as const;

export const PATRON_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// IDs de catálogo en snake_case (S-10): casa_abandonada, carta_pieza_1…
export const PATRON_ID_CATALOGO = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
