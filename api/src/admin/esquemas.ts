import { z } from 'zod';
import { PATRON_UUID_V4 } from '../dominio/constantes';
import { esquemaOrigenFiltro, ORIGENES_FILTRO } from '../estadisticas/filtros';
import { registrarEsquema } from '../openapi/registro';

// Cuerpos, parámetros y respuestas de la administración (ESQUEMA_EVENTOS.md §7.2).

const uuidV4 = z.string().regex(PATRON_UUID_V4, 'debe ser un UUID v4');

export const esquemaSolicitudLogin = registrarEsquema(
  'SolicitudLogin',
  z.strictObject({ email: z.string().min(3).max(254), password: z.string().min(1).max(200) }),
);

export const esquemaAdmin = registrarEsquema(
  'Admin',
  z.object({ email: z.string(), nombre: z.string(), juegosPermitidos: z.array(uuidV4) }),
);

export const esquemaRespuestaLogin = registrarEsquema(
  'RespuestaLogin',
  z.object({ token: z.string(), expiraEn: z.iso.datetime(), admin: esquemaAdmin }),
);

export const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /juegos: paginación + origen de los datos que se cuentan en el resumen (R-48).
export const esquemaConsultaJuegos = esquemaPaginacion.extend({ origen: esquemaOrigenFiltro });

export const esquemaResumenJuego = registrarEsquema(
  'ResumenJuego',
  z.object({
    juegoId: uuidV4,
    nombre: z.string(),
    slug: z.string(),
    // Ruta del dashboard (/logos/<slug>/logo.png) o URL https; null = avatar con la inicial.
    logoUrl: z.string().nullable(),
    versionActual: z.string(),
    activo: z.boolean(),
    resumen: z.object({
      jugadores: z.number().int(),
      sesiones: z.number().int(),
      // Jugadores que completaron el último nivel ÷ jugadores del juego (0 a 1).
      tasaCompletado: z.number().min(0).max(1),
    }),
  }),
);

export const esquemaListaJuegos = registrarEsquema(
  'ListaJuegos',
  z.object({
    datos: z.array(esquemaResumenJuego),
    pagina: z.number().int(),
    limite: z.number().int(),
    total: z.number().int(),
    origen: z.enum(ORIGENES_FILTRO),
  }),
);

export const esquemaDetalleJuego = registrarEsquema(
  'DetalleJuego',
  z.object({
    juegoId: uuidV4,
    nombre: z.string(),
    slug: z.string(),
    // Ruta del dashboard (/logos/<slug>/logo.png) o URL https; null = avatar con la inicial.
    logoUrl: z.string().nullable(),
    versionActual: z.string(),
    activo: z.boolean(),
    catalogo: z.record(z.string(), z.unknown()),
    filtros: z.object({ buildVersions: z.array(z.string()), plataformas: z.array(z.string()) }),
    // true si el juego tiene jugadores, sesiones o eventos con origen "seed".
    contieneDatosSeed: z.boolean(),
  }),
);

export const esquemaParamsJuego = z.object({ juegoId: uuidV4 });
export const esquemaParamsJugador = z.object({ juegoId: uuidV4, playerId: uuidV4 });

export const esquemaRespuestaBorrado = registrarEsquema(
  'RespuestaBorrado',
  z.object({
    eliminados: z.object({
      jugador: z.number().int(),
      sesiones: z.number().int(),
      eventos: z.number().int(),
      logros: z.number().int(),
    }),
  }),
);
