// Da de alta un juego con su catálogo y muestra su API key UNA sola vez. Uso, desde /api:
//   npm run crear-juego -- --juego la-casa-del-bosque [--version 1.0.0] [--sin-acceso]
//   … -- --confirmar      → obligatorio si la base no es local
import { main } from '../api/src/scripts/crearJuego';

void main(process.argv.slice(2));
