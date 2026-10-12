import { condicionOrigen, esquemaFiltrosEstadisticas } from '../../src/estadisticas/filtros';

describe('filtros comunes de estadísticas', () => {
  it('sin parámetros: origen "todos" y el resto sin definir', () => {
    expect(esquemaFiltrosEstadisticas.parse({})).toEqual({ origen: 'todos' });
  });

  it('acepta los filtros válidos', () => {
    const f = esquemaFiltrosEstadisticas.parse({
      desde: '2026-10-01T00:00:00Z',
      hasta: '2026-10-15T00:00:00Z',
      buildVersion: '1.0.1',
      plataforma: 'android',
      origen: 'real',
    });
    expect(f).toMatchObject({ buildVersion: '1.0.1', plataforma: 'android', origen: 'real' });
  });

  it.each([
    [{ origen: 'importado' }],
    [{ plataforma: 'switch' }],
    [{ desde: '2026-10-01' }],
    [{ desde: '2026-10-15T00:00:00Z', hasta: '2026-10-01T00:00:00Z' }],
  ])('rechaza %j', (consulta) => {
    expect(esquemaFiltrosEstadisticas.safeParse(consulta).success).toBe(false);
  });

  it('condicionOrigen: "todos" no filtra; real/seed filtran', () => {
    expect(condicionOrigen('todos')).toEqual({});
    expect(condicionOrigen('real')).toEqual({ origen: 'real' });
    expect(condicionOrigen('seed')).toEqual({ origen: 'seed' });
  });
});
