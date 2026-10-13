// Formato es-MX (DISENO_DASHBOARD.md §7): miles con coma, fechas dd/MM/yyyy, 24 h,
// duraciones mm:ss (h:mm:ss si pasan de una hora), porcentajes con un decimal solo si < 10 %.

const LOCALE = 'es-MX';
const enteros = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sinDecimales = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export const SIN_DATO = '—';

export function formatearEntero(valor: number | null | undefined): string {
  return valor === null || valor === undefined || !Number.isFinite(valor) ? SIN_DATO : enteros.format(valor);
}

// `valor` en escala 0–100 (como las estadísticas de la API).
export function formatearPorcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return SIN_DATO;
  }
  const abs = Math.abs(valor);
  const texto = abs > 0 && abs < 10 ? unDecimal.format(valor) : sinDecimales.format(valor);
  return `${texto} %`;
}

// `fraccion` en escala 0–1 (p. ej. tasaCompletado de GET /juegos).
export function formatearFraccion(fraccion: number | null | undefined): string {
  return fraccion === null || fraccion === undefined ? SIN_DATO : formatearPorcentaje(fraccion * 100);
}

export function formatearDuracion(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return SIN_DATO;
  }
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

export function formatearFecha(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Inicial para el avatar de un juego sin logo (primera letra o dígito del nombre).
export function inicial(nombre: string): string {
  const letra = [...nombre.trim()].find((c) => /[\p{L}\p{N}]/u.test(c));
  return (letra ?? '?').toLocaleUpperCase(LOCALE);
}
