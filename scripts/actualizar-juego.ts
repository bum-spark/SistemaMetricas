// Modifica campos de un juego existente sin tocar su catálogo, API key ni datos.
// Uso, desde /api:
//   npm run actualizar-juego -- --juego la-casa-del-bosque --logo-url /logos/la-casa-del-bosque/logo.png
//   … -- --confirmar                       → obligatorio si la base no es local
// En Git Bash (Windows) antepón MSYS_NO_PATHCONV=1 para que no convierta la ruta /logos/…
import { main } from '../api/src/scripts/actualizarJuego';

void main(process.argv.slice(2));
