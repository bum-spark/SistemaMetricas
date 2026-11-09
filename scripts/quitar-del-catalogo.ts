// Quita un logro del catálogo de un juego que ya existe en la base, sin borrar datos (los logros
// obtenidos y sus eventos se conservan). Se niega si el logro sigue en la constante del catálogo.
// Uso, desde /api:
//   npm run quitar-del-catalogo -- --juego la-casa-del-bosque --logro tutorial_superado --simular
//   npm run quitar-del-catalogo -- --juego la-casa-del-bosque --logro tutorial_superado
//   … --confirmar                          → obligatorio si la base no es local (también con --simular)
import { main } from '../api/src/scripts/quitarDelCatalogo';

void main(process.argv.slice(2));
