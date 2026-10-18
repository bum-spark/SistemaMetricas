// Reactiva un admin desactivado con desactivar-admin (conserva su contraseña y sus juegos).
// Uso, desde /api:
//   npm run reactivar-admin -- --email otro.admin@ejemplo.com
//   … -- --confirmar                       → obligatorio si la base no es local
import { mainReactivar } from '../api/src/scripts/estadoAdmin';

void mainReactivar(process.argv.slice(2));
