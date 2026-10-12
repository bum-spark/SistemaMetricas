// Datos de prueba realistas (origen "seed") para La Casa del Bosque y Faro Nocturno (demo).
// Uso, desde /api:
//   npm run seed-datos                                   → semilla 42, 14 días hasta hoy
//   npm run seed-datos -- --semilla 7 --jugadores 500    → otra semilla / otro volumen
//   npm run seed-datos -- --referencia 2026-10-19        → misma semilla y fecha = mismos datos
//   … -- --confirmar                                     → obligatorio si la base no es local
import { main } from '../api/src/scripts/seedDatos';

void main(process.argv.slice(2));
