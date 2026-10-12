import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CATALOGOS } from '../../src/catalogos';
import { esquemaCatalogo } from '../../src/dominio/catalogo';
import { CARPETA_PUBLICA, generarImagenes } from '../../src/scripts/imagenesNiveles';
import { svgDeNivel } from '../../src/seed/imagenesNiveles';
import { PERFILES } from '../../src/seed/perfiles';

const niveles = Object.entries(PERFILES).flatMap(([slug, perfil]) => {
  const catalogo = esquemaCatalogo.parse(CATALOGOS[slug]!.catalogo);
  return perfil.niveles.map((nivel) => ({ slug, catalogo, nivel, catalogoNivel: catalogo.niveles.find((n) => n.nivelId === nivel.nivelId)! }));
});

describe('imágenes provisionales de los niveles (A-07)', () => {
  it('hay un perfil de seed y una imagen para cada nivel de cada catálogo', () => {
    for (const [slug, perfil] of Object.entries(PERFILES)) {
      const catalogo = esquemaCatalogo.parse(CATALOGOS[slug]!.catalogo);
      expect(perfil.niveles.map((n) => n.nivelId).sort()).toEqual(catalogo.niveles.map((n) => n.nivelId).sort());
    }
  });

  it.each(niveles.map((n) => [`${n.slug}/${n.nivel.nivelId}`, n]))('%s: el SVG versionado está al día con el generador', (_nombre, n) => {
    const archivo = path.join(CARPETA_PUBLICA, ...n.catalogoNivel.imagenUrl!.split('/').filter(Boolean));
    expect(existsSync(archivo)).toBe(true);
    // Sin importar el fin de línea con que git haga checkout (CRLF en Windows).
    expect(readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n')).toBe(svgDeNivel(n.slug, n.catalogo, n.nivel));
  });

  it.each(niveles.map((n) => [`${n.slug}/${n.nivel.nivelId}`, n]))('%s: el viewBox coincide con los límites del catálogo (×10)', (_nombre, n) => {
    const { minX, maxX, minY, maxY } = n.catalogoNivel.limites!;
    expect(svgDeNivel(n.slug, n.catalogo, n.nivel)).toContain(`viewBox="0 0 ${(maxX - minX) * 10} ${(maxY - minY) * 10}"`);
  });

  it('las zonas calientes del seed caen dentro de los límites del nivel', () => {
    for (const n of niveles) {
      const { minX, maxX, minY, maxY } = n.catalogoNivel.limites!;
      for (const z of n.nivel.zonas) {
        expect(z.x).toBeGreaterThan(minX);
        expect(z.x).toBeLessThan(maxX);
        expect(z.y).toBeGreaterThanOrEqual(minY);
        expect(z.y).toBeLessThan(maxY);
        expect(n.catalogo.causasMuerte.map((c) => c.causa)).toContain(z.causa);
      }
    }
  });

  it('generarImagenes escribe los 7 archivos en la carpeta indicada', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'niveles-'));
    try {
      const escritos = generarImagenes(carpeta);
      expect(escritos).toHaveLength(7);
      expect(escritos.every((f) => existsSync(path.join(carpeta, f)))).toBe(true);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
