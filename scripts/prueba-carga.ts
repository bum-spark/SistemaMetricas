// Prueba de carga (S-31) contra la API local y una base aparte (por defecto xolos_carga),
// que se borra al terminar. Se niega a correr con MONGODB_DB=xolos_analytics.
// Uso, desde /api:
//   npm run prueba-carga                                   → límites de la configuración
//   RATE_LIMIT_INGESTA_IP=1000000 RATE_LIMIT_INGESTA_KEY=1000000 npm run prueba-carga   → capacidad
//   npm run prueba-carga -- --duracion 30 --conexiones 50 --lote 20
import { main } from '../api/src/scripts/pruebaCarga';

void main(process.argv.slice(2));
