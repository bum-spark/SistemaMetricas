// Tipos de las respuestas de la API (ESQUEMA_EVENTOS.md §7 y §10). Se agregan por pantalla.

export interface ErrorApi {
  error: { codigo: string; mensaje: string; detalles: unknown[] };
}

export interface Admin {
  email: string;
  nombre: string;
  juegosPermitidos: string[];
}

export interface RespuestaLogin {
  token: string;
  expiraEn: string;
  admin: Admin;
}

export type Origen = 'real' | 'seed' | 'todos';

export interface ResumenJuego {
  juegoId: string;
  nombre: string;
  slug: string;
  logoUrl: string | null;
  versionActual: string;
  activo: boolean;
  resumen: { jugadores: number; sesiones: number; tasaCompletado: number };
}

export interface ListaJuegos {
  datos: ResumenJuego[];
  pagina: number;
  limite: number;
  total: number;
  origen: Origen;
}

// ---------- GET /juegos/:juegoId ----------

export interface NivelCatalogo {
  nivelId: string;
  nombre: string;
  orden: number;
  descripcion?: string;
  tieneTutorial?: boolean;
  imagenUrl?: string;
  limites?: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface Catalogo {
  duracionEsperadaMs?: number;
  tiposEvento: string[];
  niveles: NivelCatalogo[];
  causasMuerte: { causa: string; nombre: string }[];
  logros: { logroId: string; nombre: string; descripcion?: string; nivelId?: string }[];
  coleccionables: { coleccionableId: string; nivelId: string; nombre: string }[];
}

export interface DetalleJuego {
  juegoId: string;
  nombre: string;
  slug: string;
  logoUrl: string | null;
  versionActual: string;
  activo: boolean;
  catalogo: Catalogo;
  filtros: { buildVersions: string[]; plataformas: string[] };
  contieneDatosSeed: boolean;
}

// ---------- /estadisticas/:juegoId/* (ESQUEMA_EVENTOS.md §10) ----------

// Parámetros que acepta la API (fechas ISO 8601 en UTC).
export interface FiltrosApi {
  desde?: string;
  hasta?: string;
  buildVersion?: string;
  plataforma?: string;
  origen?: 'real' | 'seed';
}

export interface RespuestaEstadistica<T> {
  juegoId: string;
  filtros: Record<string, unknown>;
  datos: T;
}

export interface DatosSesiones {
  sesiones: number;
  jugadores: number;
  promedioMs: number | null;
  medianaMs: number | null;
  inferidas: number;
  distribucion: { desdeMs: number; sesiones: number }[];
}

export interface PasoEmbudo {
  paso: string; // nivelId del catálogo o "terminaron"
  jugadores: number;
  porcentaje: number;
}

export interface ResultadoTiempo {
  intentos: number;
  promedioMs: number | null;
  medianaMs: number | null;
}

export interface TiempoNivel {
  nivelId: string;
  completado: ResultadoTiempo;
  muerte: ResultadoTiempo;
  abandono: ResultadoTiempo;
}

export interface GrupoIntentos {
  minimo: number;
  maximo: number | null;
  sesiones: number;
}

export interface GrupoReintentos {
  sesiones: number;
  promedioIntentos: number | null;
  maxIntentos: number | null;
  distribucion: GrupoIntentos[];
}

export interface ReintentosNivel {
  nivelId: string;
  pasaron: GrupoReintentos;
  seRindieron: GrupoReintentos;
}

export interface MuertesNivelCausa {
  nivelId: string;
  causa: string;
  muertes: number;
  jugadores: number;
  muertesPorJugador: number;
}

export interface LogroObtenido {
  logroId: string;
  nombre: string;
  jugadores: number;
  porcentaje: number; // 0–100 respecto a los jugadores con eventos en el filtro
}

export interface LimitesNivel {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CeldaMapaCalor {
  x: number; // esquina inferior izquierda, unidades de mundo
  y: number;
  causa: string;
  muertes: number;
}

export interface DatosMapaCalor {
  nivelId: string;
  imagenUrl: string | null;
  limites: LimitesNivel | null;
  celda: number;
  totalMuertes: number;
  celdas: CeldaMapaCalor[];
}
