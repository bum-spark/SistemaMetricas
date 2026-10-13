import { ParamMap, Params } from '@angular/router';
import { FiltrosApi } from '../../core/api/tipos';

// Filtros de las vistas de un juego. La URL es la única fuente de verdad (DISENO_DASHBOARD.md §4
// y §8): ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&buildVersion=&plataforma=&origen=. Las fechas son
// días UTC, igual que la API; "hasta" incluye ese día completo. `origen` null = todos.
export type OrigenDatos = 'real' | 'seed';

export interface FiltrosVista {
  desde: string | null;
  hasta: string | null;
  buildVersion: string | null;
  plataforma: string | null;
  origen: OrigenDatos | null;
}

export const FILTROS_VACIOS: FiltrosVista = { desde: null, hasta: null, buildVersion: null, plataforma: null, origen: null };

function origenValido(valor: string | null): OrigenDatos | null {
  return valor === 'real' || valor === 'seed' ? valor : null;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 24 * 60 * 60 * 1000;

function diaValido(valor: string | null): string | null {
  return valor && DIA.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) ? valor : null;
}

export function filtrosDeUrl(params: ParamMap): FiltrosVista {
  return {
    desde: diaValido(params.get('desde')),
    hasta: diaValido(params.get('hasta')),
    buildVersion: params.get('buildVersion') || null,
    plataforma: params.get('plataforma') || null,
    origen: origenValido(params.get('origen')),
  };
}

// Para router.navigate: null quita el parámetro de la URL.
export function filtrosAUrl(f: FiltrosVista): Params {
  return { desde: f.desde, hasta: f.hasta, buildVersion: f.buildVersion, plataforma: f.plataforma, origen: f.origen };
}

export function filtrosAApi(f: FiltrosVista): FiltrosApi {
  const api: FiltrosApi = {};
  if (f.desde) {
    api.desde = `${f.desde}T00:00:00.000Z`;
  }
  if (f.hasta) {
    api.hasta = new Date(Date.parse(`${f.hasta}T00:00:00Z`) + MS_DIA).toISOString();
  }
  if (f.buildVersion) {
    api.buildVersion = f.buildVersion;
  }
  if (f.plataforma) {
    api.plataforma = f.plataforma;
  }
  if (f.origen) {
    api.origen = f.origen;
  }
  return api;
}

export function hayFiltros(f: FiltrosVista): boolean {
  return Object.values(f).some((v) => v !== null);
}

export function diaUtc(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

// Atajo "últimos N días": desde hace N-1 días (UTC) hasta hoy, sin fecha final.
export function desdeUltimosDias(dias: number, ahora = new Date()): string {
  return diaUtc(new Date(ahora.getTime() - (dias - 1) * MS_DIA));
}

export function filtrosIguales(a: FiltrosVista, b: FiltrosVista): boolean {
  return (
    a.desde === b.desde && a.hasta === b.hasta && a.buildVersion === b.buildVersion && a.plataforma === b.plataforma && a.origen === b.origen
  );
}
