import type { CatalogoEntrada } from '../dominio/catalogo';

export interface DefinicionJuego {
  nombre: string;
  slug: string;
  // Ruta del dashboard (/logos/<slug>/logo.png) o URL https; opcional.
  logoUrl?: string;
  catalogo: CatalogoEntrada;
}
