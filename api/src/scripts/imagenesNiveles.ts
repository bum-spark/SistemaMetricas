import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CATALOGOS } from '../catalogos';
import { esquemaCatalogo } from '../dominio/catalogo';
import { svgDeNivel } from '../seed/imagenesNiveles';
import { PERFILES } from '../seed/perfiles';

// Escribe las imágenes provisionales de los niveles en dashboard/public/niveles/<slug>/<nivelId>.svg.
// No toca la base de datos.

export const CARPETA_PUBLICA = path.resolve(__dirname, '../../../dashboard/public');

export function generarImagenes(carpetaPublica = CARPETA_PUBLICA): string[] {
  const escritos: string[] = [];
  for (const [slug, perfil] of Object.entries(PERFILES)) {
    const catalogo = esquemaCatalogo.parse(CATALOGOS[slug]!.catalogo);
    for (const nivel of perfil.niveles) {
      const imagenUrl = catalogo.niveles.find((n) => n.nivelId === nivel.nivelId)?.imagenUrl;
      if (!imagenUrl) {
        throw new Error(`El nivel ${nivel.nivelId} de ${slug} no tiene imagenUrl en el catálogo.`);
      }
      const destino = path.join(carpetaPublica, ...imagenUrl.split('/').filter(Boolean));
      mkdirSync(path.dirname(destino), { recursive: true });
      writeFileSync(destino, svgDeNivel(slug, catalogo, nivel), 'utf8');
      escritos.push(path.relative(carpetaPublica, destino));
    }
  }
  return escritos;
}

export function main(): void {
  const escritos = generarImagenes();
  console.log(`[imagenes-niveles] ${escritos.length} imágenes provisionales en dashboard/public:`);
  for (const archivo of escritos) {
    console.log(`  - ${archivo.replace(/\\/g, '/')}`);
  }
}
