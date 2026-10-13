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

// De dónde viene un dato (R-32): la ingesta real siempre guarda 'real'; seed-datos, 'seed'.
export const ORIGENES = ['real', 'seed'] as const;
export type Origen = (typeof ORIGENES)[number];

export const PATRON_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// IDs de catálogo en snake_case (S-10): casa_abandonada, carta_pieza_1…
export const PATRON_ID_CATALOGO = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Logo del juego (opcional): ruta del dashboard con el slug del propio juego o una URL https.
export const LOGO_URL_MAX = 500;
export const PATRON_LOGO_DASHBOARD = /^\/juegos\/([a-z0-9]+(?:-[a-z0-9]+)*)\/logo\.png$/;

export function rutaLogoDashboard(slug: string): string {
  return `/juegos/${slug}/logo.png`;
}

// null si es válida; si no, el motivo. La ruta del dashboard debe usar el slug del juego.
export function problemaLogoUrl(logoUrl: string, slug: string): string | null {
  if (logoUrl.length > LOGO_URL_MAX) {
    return `logoUrl admite como máximo ${LOGO_URL_MAX} caracteres`;
  }
  const ruta = PATRON_LOGO_DASHBOARD.exec(logoUrl);
  if (ruta) {
    return ruta[1] === slug ? null : `logoUrl debe usar el slug del juego: ${rutaLogoDashboard(slug)}`;
  }
  let url: URL;
  try {
    url = new URL(logoUrl);
  } catch {
    return 'logoUrl debe ser /juegos/<slug>/logo.png o una URL https';
  }
  return url.protocol === 'https:' && url.hostname !== '' ? null : 'logoUrl debe ser /juegos/<slug>/logo.png o una URL https';
}
