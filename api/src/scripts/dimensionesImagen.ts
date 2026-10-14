// Ancho y alto de una imagen leyendo solo su cabecera (sin dependencias): PNG, WebP, JPEG y SVG
// (viewBox, o width/height). null si el formato no se reconoce o el archivo está dañado.
// La usa actualizar-juego para avisar si la proporción de la imagen no coincide con los límites.

export interface Dimensiones {
  ancho: number;
  alto: number;
}

function png(b: Buffer): Dimensiones | null {
  const firma = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return firma && b.length >= 24 && b.toString('ascii', 12, 16) === 'IHDR' ? { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) } : null;
}

function webp(b: Buffer): Dimensiones | null {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    // Con pérdida: 14 bits de ancho y alto después del código de inicio del cuadro.
    return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // Sin pérdida: 14 bits (menos uno) de ancho y alto empaquetados desde el byte 21.
    const [b0, b1, b2, b3] = [b[21]!, b[22]!, b[23]!, b[24]!];
    return { ancho: 1 + (((b1 & 0x3f) << 8) | b0), alto: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === 'VP8X') {
    // Extendido: 24 bits (menos uno) de ancho y alto.
    return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
  }
  return null;
}

function jpeg(b: Buffer): Dimensiones | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) {
    return null;
  }
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      return null;
    }
    const marcador = b[i + 1]!;
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC): ahí vienen alto y ancho.
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function svg(b: Buffer): Dimensiones | null {
  const texto = b.toString('utf8', 0, Math.min(b.length, 8192));
  const etiqueta = /<svg\b[^>]*>/i.exec(texto)?.[0];
  if (!etiqueta) {
    return null;
  }
  const caja = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(etiqueta);
  if (caja) {
    return { ancho: Number(caja[1]), alto: Number(caja[2]) };
  }
  const ancho = /\bwidth\s*=\s*["']([\d.]+)(px)?["']/i.exec(etiqueta);
  const alto = /\bheight\s*=\s*["']([\d.]+)(px)?["']/i.exec(etiqueta);
  return ancho && alto ? { ancho: Number(ancho[1]), alto: Number(alto[1]) } : null;
}

export function dimensionesImagen(contenido: Buffer): Dimensiones | null {
  const d = png(contenido) ?? webp(contenido) ?? jpeg(contenido) ?? svg(contenido);
  return d && d.ancho > 0 && d.alto > 0 ? d : null;
}

// Diferencia relativa entre la proporción de la imagen (ancho/alto) y la de los límites
// ((maxX-minX)/(maxY-minY)). 0.03 = 3 %.
export function diferenciaProporcion(d: Dimensiones, l: { minX: number; maxX: number; minY: number; maxY: number }): number {
  const imagen = d.ancho / d.alto;
  const mundo = (l.maxX - l.minX) / (l.maxY - l.minY);
  return Math.abs(imagen / mundo - 1);
}
