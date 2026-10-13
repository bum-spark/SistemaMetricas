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
