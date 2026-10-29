// Agrega a un juego que ya existe en la base lo nuevo de su catálogo constante (causas, niveles,
// logros, coleccionables, tipos de evento), sin quitar ni modificar nada. Uso, desde /api:
//   npm run sincronizar-catalogo -- --juego la-casa-del-bosque --simular   → solo muestra qué agregaría
//   npm run sincronizar-catalogo -- --juego la-casa-del-bosque             → lo aplica
//   … --confirmar                          → obligatorio si la base no es local (también con --simular)
import { main } from '../api/src/scripts/sincronizarCatalogo';

void main(process.argv.slice(2));
