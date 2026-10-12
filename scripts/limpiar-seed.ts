// Borra los datos de prueba (origen "seed"). Uso, desde /api:
//   npm run limpiar-seed                      → todos los juegos
//   npm run limpiar-seed -- --juego <slug>    → solo un juego
//   … -- --confirmar                          → obligatorio si la base no es local
import { main } from '../api/src/scripts/limpiarSeed';

void main(process.argv.slice(2));
