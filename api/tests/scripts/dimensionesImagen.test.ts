import { readFileSync } from 'node:fs';
import path from 'node:path';
import { diferenciaProporcion, dimensionesImagen } from '../../src/scripts/dimensionesImagen';
import { cabeceraPng } from './imagenes';

const PUBLICA = path.resolve(__dirname, '../../../dashboard/public');

describe('dimensionesImagen', () => {
  it('lee PNG, WebP reales del repo, SVG con viewBox o width/height y JPEG', () => {
    expect(dimensionesImagen(cabeceraPng(1920, 480))).toEqual({ ancho: 1920, alto: 480 });
    expect(dimensionesImagen(readFileSync(path.join(PUBLICA, 'login/fondo-01.webp')))).toEqual({ ancho: 1600, alto: 900 });
    expect(dimensionesImagen(readFileSync(path.join(PUBLICA, 'login/fondo-02-960.webp')))).toEqual({ ancho: 960, alto: 545 });
    expect(dimensionesImagen(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300"></svg>'))).toEqual({ ancho: 1200, alto: 300 });
    expect(dimensionesImagen(Buffer.from('<svg width="640px" height="160"></svg>'))).toEqual({ ancho: 640, alto: 160 });
    // JPEG: SOI, un segmento APP0 y SOF0 con alto 300 y ancho 1200.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x04, 0xb0, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(dimensionesImagen(jpeg)).toEqual({ ancho: 1200, alto: 300 });
  });

  it('las imágenes provisionales de los niveles tienen la proporción de sus límites', () => {
    const d = dimensionesImagen(readFileSync(path.join(PUBLICA, 'niveles/la-casa-del-bosque/casa_abandonada.svg')))!;
    expect(diferenciaProporcion(d, { minX: 0, maxX: 120, minY: 0, maxY: 30 })).toBeLessThan(0.001);
  });

  it('null si no reconoce el formato', () => {
    expect(dimensionesImagen(Buffer.from('no es una imagen'))).toBeNull();
    expect(dimensionesImagen(Buffer.alloc(0))).toBeNull();
  });

  it('diferenciaProporcion es relativa', () => {
    expect(diferenciaProporcion({ ancho: 400, alto: 100 }, { minX: 0, maxX: 4, minY: 0, maxY: 1 })).toBe(0);
    expect(diferenciaProporcion({ ancho: 412, alto: 100 }, { minX: 0, maxX: 4, minY: 0, maxY: 1 })).toBeCloseTo(0.03, 5);
  });
});
