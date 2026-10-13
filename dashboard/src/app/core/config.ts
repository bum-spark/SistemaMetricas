import { environment } from '../../environments/environment';

// Configuración de la app: siempre de environment.ts, nunca escrita en las vistas.
export const CONFIG = {
  appName: environment.appName,
  apiUrl: environment.apiUrl.replace(/\/+$/, ''),
  // Más de esto sin respuesta = aviso "el servidor se está despertando" (§4, plan gratuito).
  msAvisoApiDormida: 8000,
} as const;
