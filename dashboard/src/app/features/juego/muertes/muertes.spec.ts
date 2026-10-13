import { montarVistaJuego } from '../../../../testing/juego';
import { ES } from '../../../i18n/es';
import { Muertes } from './muertes';

const MAPA = {
  nivelId: 'nivel_b',
  imagenUrl: null,
  limites: { minX: 0, maxX: 100, minY: 0, maxY: 20 },
  celda: 5,
  totalMuertes: 9,
  celdas: [
    { x: 10, y: 0, causa: 'pinchos', muertes: 3 },
    { x: 10, y: 0, causa: 'agua', muertes: 5 },
    { x: 20, y: 5, causa: 'agua', muertes: 1 },
  ],
};
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

  it('mapa de calor: usa ?nivelId= y ?celda= de la URL, y las pestañas filtran por causa', async () => {
    const m = await montarVistaJuego(Muertes, 'muertes', '/juegos/juego-uno/muertes?nivelId=nivel_b&celda=5');
    m.http.expectOne((r) => r.url === m.urlEstadistica('muertes')).flush({ juegoId: 'x', filtros: {}, datos: MUERTES });
    const req = m.http.expectOne((r) => r.url === m.urlEstadistica('mapa-calor'));
    expect(req.request.params.get('nivelId')).toBe('nivel_b');
    expect(req.request.params.get('celda')).toBe('5');
    req.flush({ juegoId: 'x', filtros: {}, datos: MAPA });
    await m.asentar();

    expect(m.el.querySelector<HTMLSelectElement>('#mapa-nivel')!.value).toBe('nivel_b');
    const tabs = [...m.el.querySelectorAll<HTMLButtonElement>('xa-tabs [role="tab"]')];
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([ES.muertes.todas, 'Pinchos', 'Agua']);
    expect(m.el.querySelector('xa-mapa-calor canvas')?.getAttribute('aria-label')).toBe(ES.muertes.mapaAlt('9', '10', '0', '8'));

    tabs[1]!.click();
    await m.asentar();
    expect(m.el.querySelector('xa-mapa-calor canvas')?.getAttribute('aria-label')).toBe(ES.muertes.mapaAlt('3', '10', '0', '3'));
  });

  it('sin ?nivelId= el mapa pide el primer nivel del catálogo; cambiar el nivel lo escribe en la URL', async () => {
    const m = await montarVistaJuego(Muertes, 'muertes');
    m.http.expectOne((r) => r.url === m.urlEstadistica('muertes')).flush({ juegoId: 'x', filtros: {}, datos: MUERTES });
    expect(m.http.expectOne((r) => r.url === m.urlEstadistica('mapa-calor')).request.params.get('nivelId')).toBe('nivel_a');
    await m.asentar();
    const select = m.el.querySelector<HTMLSelectElement>('#mapa-nivel')!;
    select.value = 'nivel_b';
    select.dispatchEvent(new Event('change'));
    await m.asentar();
    expect(m.router.url).toBe('/juegos/juego-uno/muertes?nivelId=nivel_b');
    expect(m.http.expectOne((r) => r.url === m.urlEstadistica('mapa-calor')).request.params.get('nivelId')).toBe('nivel_b');
  });
});
