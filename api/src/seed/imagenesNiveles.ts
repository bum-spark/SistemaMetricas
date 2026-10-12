import type { Catalogo } from '../dominio/catalogo';
import type { PerfilNivel, ZonaMuerte } from './perfiles';

// Imágenes PROVISIONALES de los niveles (A-07) para el mapa de calor: un SVG simple por nivel,
// con el mismo sistema de coordenadas que los límites del catálogo (10 px por unidad de mundo,
// eje Y invertido como en Unity) y los peligros dibujados donde seed-datos concentra las muertes.
// Se reemplazan por las capturas reales de Unity cuando existan.

const ESCALA = 10;

const TEMAS: Record<string, { fondo: string; fondo2: string; piso: string; detalle: string }> = {
  casa_abandonada: { fondo: '#2b231d', fondo2: '#1a1511', piso: '#4a3a2c', detalle: '#6b5440' },
  hospital_cuarto: { fondo: '#1e2a33', fondo2: '#121a20', piso: '#3a4a56', detalle: '#5d7484' },
  habitacion_llamas: { fondo: '#2e1a12', fondo2: '#160c08', piso: '#4b2c1d', detalle: '#7a4426' },
  muelle: { fondo: '#10233a', fondo2: '#081321', piso: '#4a3a2a', detalle: '#6a5642' },
  escalera_faro: { fondo: '#1d2028', fondo2: '#101218', piso: '#454b57', detalle: '#6b7280' },
  sala_lampara: { fondo: '#2a2614', fondo2: '#16140a', piso: '#4a4426', detalle: '#7a6f3a' },
  azotea: { fondo: '#111833', fondo2: '#080b1a', piso: '#3b3f52', detalle: '#5b6078' },
};

const TEMA_POR_DEFECTO = { fondo: '#1b1f26', fondo2: '#0e1013', piso: '#323844', detalle: '#444c5a' };

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function peligro(z: ZonaMuerte, aX: (x: number) => number, aY: (y: number) => number): string {
  const cx = aX(z.x);
  const cy = aY(z.y);
  const ancho = z.radioX * ESCALA * 2.4;
  switch (z.dibujo) {
    case 'lava':
      return `<rect x="${cx - ancho / 2}" y="${aY(0) - 18}" width="${ancho}" height="18" fill="#f08a3c" opacity="0.85"/>
  <rect x="${cx - ancho / 2}" y="${aY(0) - 26}" width="${ancho}" height="8" fill="#ffd08a" opacity="0.35"/>`;
    case 'hueco':
      return `<rect x="${cx - ancho / 2}" y="${cy - 14}" width="${ancho}" height="28" fill="#000" opacity="0.75"/>`;
    case 'agua':
      return `<rect x="${cx - ancho / 2}" y="${aY(0) - 16}" width="${ancho}" height="16" fill="#3b82c4" opacity="0.7"/>
  <path d="M${cx - ancho / 2} ${aY(0) - 16} q ${ancho / 8} -6 ${ancho / 4} 0 t ${ancho / 4} 0 t ${ancho / 4} 0 t ${ancho / 4} 0" stroke="#9fd0ff" fill="none" stroke-width="2" opacity="0.6"/>`;
    case 'fantasma':
      return `<path d="M${cx - 14} ${cy + 16} v-16 a14 14 0 0 1 28 0 v16 l-5 -5 -4 5 -5 -5 -5 5 -4 -5 z" fill="#e8eaee" opacity="0.55"/>
  <circle cx="${cx - 5}" cy="${cy - 3}" r="2.2" fill="#14171c"/><circle cx="${cx + 5}" cy="${cy - 3}" r="2.2" fill="#14171c"/>`;
    case 'cuervo':
      return `<path d="M${cx - 16} ${cy} q 8 -9 16 0 q 8 -9 16 0" stroke="#0b0c10" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
}

export function svgDeNivel(slug: string, catalogo: Catalogo, perfil: PerfilNivel): string {
  const nivel = catalogo.niveles.find((n) => n.nivelId === perfil.nivelId);
  if (!nivel?.limites) {
    throw new Error(`El nivel ${perfil.nivelId} de ${slug} no tiene límites.`);
  }
  const { minX, maxX, minY, maxY } = nivel.limites;
  const ancho = (maxX - minX) * ESCALA;
  const alto = (maxY - minY) * ESCALA;
  const aX = (x: number) => Math.round((x - minX) * ESCALA * 10) / 10;
  const aY = (y: number) => Math.round((maxY - y) * ESCALA * 10) / 10;
  const tema = TEMAS[perfil.nivelId] ?? TEMA_POR_DEFECTO;
  const vertical = alto > ancho;

  // Plataformas sencillas repartidas por el nivel (decorativas).
  const plataformas: string[] = [];
  const n = vertical ? Math.floor((maxY - minY) / 12) : Math.floor((maxX - minX) / 25);
  for (let i = 1; i <= n; i++) {
    const x = vertical ? minX + ((i % 2 ? 0.2 : 0.55) * (maxX - minX)) : minX + (i * (maxX - minX)) / (n + 1) - 6;
    const y = vertical ? minY + i * 12 : minY + (maxY - minY) * (i % 2 ? 0.35 : 0.6);
    plataformas.push(`<rect x="${aX(x)}" y="${aY(y)}" width="${12 * ESCALA}" height="10" rx="3" fill="${tema.detalle}"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Imagen PROVISIONAL de ${escapar(nivel.nombre)} (${slug}) para el mapa de calor (A-07).
     viewBox = límites del catálogo × ${ESCALA}: x ${minX}..${maxX}, y ${minY}..${maxY} (Y invertido).
     Generada por "npm run imagenes-niveles"; se reemplaza por la captura real de Unity. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img" aria-label="${escapar(nivel.nombre)} (imagen provisional)">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tema.fondo}"/>
      <stop offset="1" stop-color="${tema.fondo2}"/>
    </linearGradient>
  </defs>
  <rect width="${ancho}" height="${alto}" fill="url(#fondo)"/>
  <rect x="0" y="${aY(minY) - 12}" width="${ancho}" height="12" fill="${tema.piso}"/>
  ${plataformas.join('\n  ')}
  ${perfil.zonas.map((z) => peligro(z, aX, aY)).join('\n  ')}
  <text x="16" y="28" fill="#a3aab8" font-family="Inter, system-ui, sans-serif" font-size="18">${escapar(nivel.nombre)} · imagen provisional</text>
</svg>
`;
}

export function rutaImagen(slug: string, nivelId: string): string {
  return `/niveles/${slug}/${nivelId}.svg`;
}
