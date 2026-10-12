// Crea el primer admin con ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NOMBRE del .env de /api.
// Uso, desde /api:
//   npm run crear-admin                               → acceso a todos los juegos existentes
//   npm run crear-admin -- --juegos slug1,slug2       → solo esos juegos
//   … -- --confirmar                                  → obligatorio si la base no es local
import { main } from '../api/src/scripts/crearAdmin';

void main(process.argv.slice(2));
