// Revoca la API key de un juego: deja de poder mandar datos; lo guardado se conserva.
// Uso, desde /api:  npm run revocar-api-key -- --juego <slug> [--confirmar]
import { mainRevocar } from '../api/src/scripts/apiKeys';

void mainRevocar(process.argv.slice(2));
