import { ResumenJuego } from '../app/core/api/tipos';

// Datos de prueba compartidos por los specs (no se usan en la app).
export function juegoDePrueba(extra: Partial<ResumenJuego> = {}): ResumenJuego {
  return {
    juegoId: '7dbc3753-4258-4511-bba7-fb2d64251c1c',
    nombre: 'Juego Uno',
    slug: 'juego-uno',
    logoUrl: null,
    versionActual: '1.0.0',
    activo: true,
    resumen: { jugadores: 1200, sesiones: 1500, tasaCompletado: 0.31 },
    ...extra,
  };
}
