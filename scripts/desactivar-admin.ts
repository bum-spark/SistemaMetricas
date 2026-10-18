// Desactiva un admin creado con crear-admin: no puede entrar y sus sesiones dejan de servir al
// instante. No borra nada; se revierte con reactivar-admin. Uso, desde /api:
//   npm run desactivar-admin -- --email otro.admin@ejemplo.com
//   … -- --confirmar                       → obligatorio si la base no es local
import { mainDesactivar } from '../api/src/scripts/estadoAdmin';

void mainDesactivar(process.argv.slice(2));
