import { montarVistaJuego } from '../../../../testing/juego';
import { CATALOGO_LOGROS, LOGROS } from '../../../../testing/logros';
import { ES } from '../../../i18n/es';
import { Logros } from './logros';

describe('Logros (/juegos/:slug/logros)', () => {
  it('KPIs y lista de todos los logros (también 0 %) con descripción, jugadores, % y rareza', async () => {
    const m = await montarVistaJuego(Logros, 'logros', '/juegos/juego-uno/logros?origen=real', CATALOGO_LOGROS);
    const req = m.http.expectOne((r) => r.url === m.urlEstadistica('logros'));
    expect(req.request.params.get('origen')).toBe('real');
    req.flush({ juegoId: 'x', filtros: {}, datos: LOGROS });
    await m.asentar();

    expect(m.el.querySelector('h1')?.textContent).toBe(ES.logros.titulo);
    const kpis = [...m.el.querySelectorAll('xa-kpi')].map((k) => k.textContent);
    expect(kpis[0]).toContain('246');
    expect(kpis[1]).toContain('Logro A');
    expect(kpis[2]).toContain('Logro B');
    expect(kpis[3]).toContain('1');

    const logros = [...m.el.querySelectorAll('li.logro')];
    expect(logros).toHaveLength(3);
    expect(logros[0]!.textContent).toContain('Completa el nivel A.');
    expect(logros[0]!.textContent).toContain(ES.logros.jugadores('240') + ' · 80 %');
    expect(logros[0]!.querySelector('xa-insignia xa-badge')?.textContent?.trim()).toBe(ES.insignias.comun);
    expect(logros[1]!.querySelector('xa-insignia xa-badge')?.textContent?.trim()).toBe(ES.insignias.muyRaro);
    expect(logros[2]!.textContent).toContain('0 %');
    expect(logros[2]!.querySelector('.barra__valor')?.getAttribute('width')).toBe('0%');
    // Sin pestañas ni tarjeta de coleccionables (llegarán con `atencion`).
    expect(m.el.querySelector('xa-tabs')).toBeNull();
    expect(m.el.querySelectorAll('xa-tarjeta')).toHaveLength(1);
  });

  it('un juego sin logros en su catálogo muestra el estado vacío', async () => {
    const m = await montarVistaJuego(Logros, 'logros');
    m.http.expectOne((r) => r.url === m.urlEstadistica('logros')).flush({ juegoId: 'x', filtros: {}, datos: [] });
    await m.asentar();
    expect(m.el.querySelector('xa-estado-vacio')).not.toBeNull();
  });

  it('error con Reintentar', async () => {
    const m = await montarVistaJuego(Logros, 'logros', undefined, CATALOGO_LOGROS);
    m.http.expectOne((r) => r.url === m.urlEstadistica('logros')).flush({}, { status: 500, statusText: 'x' });
    await m.asentar();
    m.el.querySelector<HTMLButtonElement>('xa-estado-error button')!.click();
    await m.asentar();
    m.http.expectOne((r) => r.url === m.urlEstadistica('logros')).flush({ juegoId: 'x', filtros: {}, datos: LOGROS });
    await m.asentar();
    expect(m.el.querySelectorAll('li.logro')).toHaveLength(3);
  });
});
