import { convertToParamMap } from '@angular/router';
import { desdeUltimosDias, filtrosAApi, filtrosAUrl, filtrosDeUrl, hayFiltros } from './filtros';

describe('filtros de la URL', () => {
  it('lee los 4 filtros e ignora fechas mal formadas', () => {
    expect(filtrosDeUrl(convertToParamMap({ desde: '2026-10-01', hasta: 'ayer', buildVersion: '1.0.1', plataforma: 'android' }))).toEqual({
      desde: '2026-10-01',
      hasta: null,
      buildVersion: '1.0.1',
      plataforma: 'android',
      origen: null,
    });
    expect(filtrosDeUrl(convertToParamMap({ desde: '2026-13-45' })).desde).toBeNull();
  });

  it('lee el origen (real o seed; cualquier otro valor = todos) y lo manda a la API', () => {
    expect(filtrosDeUrl(convertToParamMap({ origen: 'seed' })).origen).toBe('seed');
    expect(filtrosDeUrl(convertToParamMap({ origen: 'importado' })).origen).toBeNull();
    expect(filtrosAApi({ desde: null, hasta: null, buildVersion: null, plataforma: null, origen: 'real' })).toEqual({ origen: 'real' });
  });

  it('convierte días UTC al rango de la API: "hasta" incluye el día completo', () => {
    expect(filtrosAApi({ desde: '2026-10-01', hasta: '2026-10-07', buildVersion: null, plataforma: 'ios', origen: null })).toEqual({
      desde: '2026-10-01T00:00:00.000Z',
      hasta: '2026-10-08T00:00:00.000Z',
      plataforma: 'ios',
    });
    expect(filtrosAApi({ desde: null, hasta: null, buildVersion: null, plataforma: null, origen: null })).toEqual({});
  });

  it('para la URL, null quita el parámetro', () => {
    expect(filtrosAUrl({ desde: null, hasta: null, buildVersion: '1.0.0', plataforma: null, origen: null })).toEqual({
      desde: null,
      hasta: null,
      buildVersion: '1.0.0',
      plataforma: null,
      origen: null,
    });
  });

  it('atajo de últimos N días y detección de filtros activos', () => {
    expect(desdeUltimosDias(7, new Date('2026-10-12T15:00:00Z'))).toBe('2026-10-06');
    expect(desdeUltimosDias(30, new Date('2026-10-12T15:00:00Z'))).toBe('2026-09-13');
    expect(hayFiltros({ desde: null, hasta: null, buildVersion: null, plataforma: null, origen: null })).toBe(false);
    expect(hayFiltros({ desde: null, hasta: null, buildVersion: null, plataforma: null, origen: 'seed' })).toBe(true);
  });
});
