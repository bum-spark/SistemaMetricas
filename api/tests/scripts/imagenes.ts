// PNG mínimo para los tests: firma + IHDR con ancho y alto (para leer la cabecera no hace falta
// el resto del archivo).
export function cabeceraPng(ancho: number, alto: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(ancho, 16);
  b.writeUInt32BE(alto, 20);
  return b;
}
