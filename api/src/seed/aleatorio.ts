// Generador pseudoaleatorio con semilla para seed-datos: la misma semilla produce
// exactamente los mismos datos. Nunca se usa Math.random() ni crypto en el seed.

// Hash de texto a entero de 32 bits (FNV-1a), para derivar semillas por juego.
export function hashTexto(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Aleatorio {
  private estado: number;

  constructor(semilla: number) {
    this.estado = semilla >>> 0;
  }

  // mulberry32: rápido y suficiente para datos de prueba.
  siguiente(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  entre(min: number, max: number): number {
    return min + (max - min) * this.siguiente();
  }

  entero(min: number, max: number): number {
    return Math.floor(this.entre(min, max + 1));
  }

  probabilidad(p: number): boolean {
    return this.siguiente() < p;
  }

  elegir<T>(opciones: readonly T[]): T {
    const elegido = opciones[Math.floor(this.siguiente() * opciones.length)];
    if (elegido === undefined) {
      throw new Error('No hay opciones para elegir.');
    }
    return elegido;
  }

  ponderado<T>(opciones: readonly { valor: T; peso: number }[]): T {
    const total = opciones.reduce((suma, o) => suma + o.peso, 0);
    let r = this.siguiente() * total;
    for (const o of opciones) {
      r -= o.peso;
      if (r < 0) {
        return o.valor;
      }
    }
    const ultimo = opciones[opciones.length - 1];
    if (!ultimo) {
      throw new Error('No hay opciones para elegir.');
    }
    return ultimo.valor;
  }

  // Normal estándar (Box-Muller).
  normal(media = 0, desviacion = 1): number {
    const u = Math.max(this.siguiente(), Number.EPSILON);
    const v = this.siguiente();
    return media + desviacion * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Lognormal con mediana dada: dispersión realista de duraciones (cola larga a la derecha).
  lognormal(mediana: number, sigma: number): number {
    return mediana * Math.exp(this.normal(0, sigma));
  }

  // Cantidad de fallos antes del primer éxito (geométrica), con tope.
  geometrica(probFallo: number, tope: number): number {
    let n = 0;
    while (n < tope && this.probabilidad(probFallo)) {
      n++;
    }
    return n;
  }

  // UUID v4 determinista (formato válido para la validación de la ingesta).
  uuid(): string {
    const hex = Array.from({ length: 32 }, () => Math.floor(this.siguiente() * 16).toString(16));
    hex[12] = '4';
    hex[16] = ['8', '9', 'a', 'b'][Math.floor(this.siguiente() * 4)]!;
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
}
