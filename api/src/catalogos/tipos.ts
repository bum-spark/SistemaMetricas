import type { CatalogoEntrada } from '../dominio/catalogo';

export interface DefinicionJuego {
  nombre: string;
  slug: string;
  catalogo: CatalogoEntrada;
}
