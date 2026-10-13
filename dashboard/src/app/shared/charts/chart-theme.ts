import type { ChartOptions } from 'chart.js';

// Tema de las gráficas (DISENO_DASHBOARD.md §5). Único archivo con colores en hex fuera de
// tokens.css: la paleta categórica, apta para daltonismo. Los demás colores (texto, ejes,
// semánticos) se leen de los tokens CSS en tiempo de ejecución.
export const PALETA_CATEGORICA = ['#56B4E9', '#E69F00', '#2FBF94', '#CC79A7', '#F0E442', '#E8743B'] as const;

// Color por posición en el catálogo (el 1.º nivel o la 1.ª causa toma el color 1…), nunca por nombre.
export function colorCategorico(posicion: number): string {
  return PALETA_CATEGORICA[posicion % PALETA_CATEGORICA.length]!;
}

// Valor de un token de tokens.css (p. ej. '--success').
export function token(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

// Medida en px de un token (p. ej. '--fs-etiqueta' → 12), con respaldo si no hay estilos.
function px(nombre: string, respaldo: number): number {
  const valor = parseFloat(token(nombre));
  return Number.isFinite(valor) ? valor : respaldo;
}

export function movimientoReducido(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Opciones comunes: fondo transparente, cuadrícula horizontal --border-subtle, sin vertical,
// ejes 12 px --text-3, tooltip con el estilo de §4 y animación de 200 ms (0 si se reduce).
export function opcionesBase(horizontal = false): ChartOptions<'bar'> {
  const texto3 = token('--text-3');
  const sutil = token('--border-subtle');
  const fuente = { family: token('--font-body'), size: px('--fs-etiqueta', 12) };
  const cuadro = px('--fs-etiqueta', 12);
  const ejeValores = { grid: { color: sutil }, border: { display: false }, ticks: { color: texto3, font: fuente } };
  const ejeCategorias = { grid: { display: false }, border: { display: false }, ticks: { color: texto3, font: fuente } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    animation: { duration: movimientoReducido() ? 0 : 200 },
    scales: horizontal ? { x: ejeValores, y: ejeCategorias } : { x: ejeCategorias, y: ejeValores },
    plugins: {
      legend: { position: 'bottom', labels: { color: token('--text-2'), font: fuente, boxWidth: cuadro, boxHeight: cuadro } },
      tooltip: {
        backgroundColor: token('--bg-2'),
        borderColor: token('--border-default'),
        borderWidth: 1,
        titleColor: token('--text-1'),
        bodyColor: token('--text-1'),
        titleFont: { ...fuente, weight: 600 },
        bodyFont: fuente,
        padding: px('--space-2', 8),
        cornerRadius: px('--radius-sm', 6),
      },
    },
  };
}
