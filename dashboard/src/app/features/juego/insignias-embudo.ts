import { caidas, mayorCaida, PasoVisible } from '../../shared/charts/embudo/embudo';
import { DatosInsignia, insigniaCaida, insigniaMayorFuga } from '../../shared/umbrales';

// Insignias de cada paso del embudo (índice = paso donde cae la gente): severidad de la
// caída con umbrales.ts y "Mayor fuga" solo en la caída más grande.
export function insigniasEmbudo(pasos: readonly PasoVisible[]): DatosInsignia[][] {
  const mayor = mayorCaida(pasos);
  const resultado: DatosInsignia[][] = pasos.map(() => []);
  for (const c of caidas(pasos)) {
    const n = pasos[c.desde]!.jugadores;
    const lista = resultado[c.hasta]!;
    if (mayor?.hasta === c.hasta) {
      const fuga = insigniaMayorFuga(c.porcentaje, n);
      if (fuga) {
        lista.push(fuga);
      }
    }
    const severidad = insigniaCaida(c.porcentaje, n);
    if (severidad) {
      lista.push(severidad);
    }
  }
  return resultado;
}
