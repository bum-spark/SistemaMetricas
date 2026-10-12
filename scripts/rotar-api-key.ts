// Genera una API key nueva para un juego (la anterior deja de servir) y la muestra UNA vez.
// Uso, desde /api:  npm run rotar-api-key -- --juego <slug> [--confirmar]
import { mainRotar } from '../api/src/scripts/apiKeys';

void mainRotar(process.argv.slice(2));
