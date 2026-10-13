import { montarVistaJuego } from '../../../../testing/juego';
import { ES } from '../../../i18n/es';
import { Muertes } from './muertes';
import { MUERTES } from '../../../../testing/muertes';

describe('Muertes (/juegos/:slug/muertes)', () => {
  it('KPIs, barras apiladas con alternativa textual y tabla con conteo y % del nivel', async () => {
    const m = await montarVistaJuego(Muertes, 'muertes', '/juegos/juego-uno/muertes?buildVersion=1.0.1');
    const req = m.http.expectOne((r) => r.url === m.urlEstadistica('muertes'));
    expect(req.request.params.get('buildVersion')).toBe('1.0.1');
    req.flush({ juegoId: 'x', filtros: {}, datos: MUERTES });
    await m.asentar();

    expect(m.el.querySelector('h1')?.textContent).toBe(ES.muertes.titulo);
    const kpis = [...m.el.querySelectorAll('xa-kpi')].map((k) => k.textContent);
    expect(kpis[0]).toContain('100');
    expect(kpis[1]).toContain('Agua');
    expect(kpis[1]).toContain(ES.muertes.kpiCausaContexto('70', '70 %'));
    expect(kpis[2]).toContain('Nivel B');
    expect(kpis[3]).toContain('2.40');

    expect(m.el.querySelector('xa-chart canvas')?.getAttribute('aria-label')).toBe(ES.muertes.barrasAlt('Nivel B', 'Agua', '60'));
    const filas = [...m.el.querySelectorAll('xa-tabla tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()));
    expect(filas).toEqual([
      ['Nivel A', 'Pinchos', '30', '75 %', '20', '1.50'],
      ['Nivel A', 'Agua', '10', '25 %', '10', '1.00'],
      ['Nivel B', 'Agua', '60', '100 %', '25', '2.40'],
    ]);
  });

  it('sin muertes en el rango muestra el estado vacío sin tarjetas', async () => {
    const m = await montarVistaJuego(Muertes, 'muertes');
    m.http.expectOne((r) => r.url === m.urlEstadistica('muertes')).flush({ juegoId: 'x', filtros: {}, datos: [] });
    await m.asentar();
    expect(m.el.querySelector('xa-estado-vacio')).not.toBeNull();
    expect(m.el.querySelector('xa-tarjeta')).toBeNull();
  });

  it('error con Reintentar', async () => {
    const m = await montarVistaJuego(Muertes, 'muertes');
    m.http.expectOne((r) => r.url === m.urlEstadistica('muertes')).flush({}, { status: 500, statusText: 'x' });
    await m.asentar();
    m.el.querySelector<HTMLButtonElement>('xa-estado-error button')!.click();
    await m.asentar();
    m.http.expectOne((r) => r.url === m.urlEstadistica('muertes')).flush({ juegoId: 'x', filtros: {}, datos: MUERTES });
    await m.asentar();
    expect(m.el.querySelectorAll('xa-tabla tbody tr')).toHaveLength(3);
  });
});
