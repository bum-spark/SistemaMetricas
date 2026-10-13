import { convertToParamMap } from '@angular/router';
import { desdeUltimosDias, filtrosAApi, filtrosAUrl, filtrosDeUrl, hayFiltros } from './filtros';

describe('filtros de la URL', () => {
  it('lee los 4 filtros e ignora fechas mal formadas', () => {
    expect(filtrosDeUrl(convertToParamMap({ desde: '2026-10-01', hasta: 'ayer', buildVersion: '1.0.1', plataforma: 'android' }))).toEqual({
      desde: '2026-10-01',
      hasta: null,
      buildVersion: '1.0.1',
      plataforma: 'android',
    });
    expect(filtrosDeUrl(convertToParamMap({ desde: '2026-13-45' })).desde).toBeNull();
  });

  it('convierte días UTC al rango de la API: "hasta" incluye el día completo', () => {
    expect(filtrosAApi({ desde: '2026-10-01', hasta: '2026-10-07', buildVersion: null, plataforma: 'ios' })).toEqual({
      desde: '2026-10-01T00:00:00.000Z',
      hasta: '2026-10-08T00:00:00.000Z',
      plataforma: 'ios',
    });
    expect(filtrosAApi({ desde: null, hasta: null, buildVersion: null, plataforma: null })).toEqual({});
  });

  it('para la URL, null quita el parámetro', () => {
    expect(filtrosAUrl({ desde: null, hasta: null, buildVersion: '1.0.0', plataforma: null })).toEqual({
      desde: null,
      hasta: null,
      buildVersion: '1.0.0',
      plataforma: null,
    });
  });

  it('atajo de últimos N días y detección de filtros activos', () => {
    expect(desdeUltimosDias(7, new Date('2026-10-12T15:00:00Z'))).toBe('2026-10-06');
    expect(desdeUltimosDias(30, new Date('2026-10-12T15:00:00Z'))).toBe('2026-09-13');
    expect(hayFiltros({ desde: null, hasta: null, buildVersion: null, plataforma: null })).toBe(false);
    expect(hayFiltros({ desde: null, hasta: null, buildVersion: null, plataforma: 'ios' })).toBe(true);
  });
});
