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
