import { montarVistaJuego } from '../../../../testing/juego';
import { EMBUDO_NIVELES, REINTENTOS, TIEMPOS } from '../../../../testing/niveles';
import { ES } from '../../../i18n/es';
import { Niveles } from './niveles';

async function montarConDatos(url?: string) {
  const m = await montarVistaJuego(Niveles, 'niveles', url);
  const responder = (endpoint: string, datos: unknown) =>
    m.http.expectOne((r) => r.url === m.urlEstadistica(endpoint)).flush({ juegoId: 'x', filtros: {}, datos });
  return { ...m, responder };
}

describe('Niveles (/juegos/:slug/niveles)', () => {
  it('pide tiempo-nivel, reintentos y embudo con los filtros y muestra KPIs, dos gráficas y la tabla', async () => {
    const m = await montarConDatos('/juegos/juego-uno/niveles?plataforma=android');
    expect(m.el.querySelectorAll('xa-kpi xa-skeleton').length).toBeGreaterThan(0);
    const respuestas: Record<string, unknown> = { 'tiempo-nivel': TIEMPOS, reintentos: REINTENTOS, embudo: EMBUDO_NIVELES };
    for (const [endpoint, datos] of Object.entries(respuestas)) {
      const req = m.http.expectOne((r) => r.url === m.urlEstadistica(endpoint));
      expect(req.request.params.get('plataforma')).toBe('android');
      req.flush({ juegoId: 'x', filtros: {}, datos });
    }
    await m.asentar();

    expect(m.el.querySelector('h1')?.textContent).toBe(ES.niveles.titulo);
    const kpis = [...m.el.querySelectorAll('xa-kpi')].map((k) => k.textContent);
    expect(kpis[0]).toContain('Nivel B');
    expect(kpis[0]).toContain('08:20');
    expect(kpis[1]).toContain('1.50');
    expect(kpis[2]).toContain('44 %');
    expect(kpis[2]).toContain(ES.niveles.kpiLimpiaContexto('80', '180'));
    expect(kpis[3]).toContain('Nivel B');

    const graficas = m.el.querySelectorAll('xa-chart canvas');
    expect(graficas).toHaveLength(2);
    expect(graficas[0]!.getAttribute('aria-label')).toBe(ES.niveles.tiempoAlt('Nivel B', '08:20'));
    expect(graficas[1]!.getAttribute('aria-label')).toBe(ES.niveles.distribucionAlt('Nivel B', '40 %'));

    const filas = [...m.el.querySelectorAll('xa-tabla tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.replace(/\s+/g, ' ').trim()));
    expect(filas[0]!.slice(0, 5)).toEqual(['1Nivel A', '90', '04:50', '1.25', '20 %']);
    expect(filas[0]![5]).toContain(ES.insignias.normal);
  });

  it('la tabla marca con insignia el diagnóstico de cada nivel', async () => {
    const m = await montarConDatos();
    m.responder('tiempo-nivel', TIEMPOS);
    m.responder('reintentos', REINTENTOS);
    m.responder('embudo', EMBUDO_NIVELES);
    await m.asentar();
    const insignias = [...m.el.querySelectorAll('xa-tabla xa-insignia xa-badge')].map((b) => b.textContent?.trim());
    expect(insignias).toEqual([ES.insignias.normal, ES.insignias.dificultadCritica]);
    expect(m.el.querySelector('xa-tabla xa-insignia [role="tooltip"]')?.textContent).toContain('n = 100 sesiones');
  });

  it('sin datos muestra el estado vacío sin tarjetas', async () => {
    const m = await montarConDatos();
    m.responder('tiempo-nivel', []);
    m.responder('reintentos', []);
    m.responder('embudo', []);
    await m.asentar();
    expect(m.el.querySelector('xa-estado-vacio')).not.toBeNull();
    expect(m.el.querySelector('xa-tarjeta')).toBeNull();
  });

  it('si falla un endpoint muestra el error y Reintentar vuelve a pedir los tres', async () => {
    const m = await montarConDatos();
    m.http.expectOne((r) => r.url === m.urlEstadistica('tiempo-nivel')).flush({}, { status: 500, statusText: 'x' });
    m.http.match(() => true);
    await m.asentar();
    expect(m.el.querySelector('xa-estado-error')).not.toBeNull();
    m.el.querySelector<HTMLButtonElement>('xa-estado-error button')!.click();
    await m.asentar();
    m.responder('tiempo-nivel', TIEMPOS);
    m.responder('reintentos', REINTENTOS);
    m.responder('embudo', EMBUDO_NIVELES);
    await m.asentar();
    expect(m.el.querySelectorAll('xa-tabla tbody tr')).toHaveLength(2);
  });
});
