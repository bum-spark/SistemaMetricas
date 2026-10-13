import { TestRequest } from '@angular/common/http/testing';
import { montarVistaJuego } from '../../../../testing/juego';
import { ES } from '../../../i18n/es';
import { Resumen } from './resumen';

const SESIONES = { sesiones: 1500, jugadores: 1200, promedioMs: 1_300_000, medianaMs: 1_122_000, inferidas: 12, distribucion: [] };
const EMBUDO = [
  { paso: 'nivel_a', jugadores: 1200, porcentaje: 100 },
  { paso: 'nivel_b', jugadores: 600, porcentaje: 50 },
  { paso: 'terminaron', jugadores: 540, porcentaje: 45 },
];

function peticion(m: Awaited<ReturnType<typeof montarVistaJuego>>, endpoint: string): TestRequest {
  return m.http.expectOne((r) => r.url === m.urlEstadistica(endpoint));
}

describe('Resumen (/juegos/:slug)', () => {
  it('muestra skeleton y después los 4 KPIs, el embudo con nombres del catálogo y la mayor caída', async () => {
    const m = await montarVistaJuego(Resumen);
    expect(m.el.querySelectorAll('xa-kpi xa-skeleton').length).toBeGreaterThan(0);

    peticion(m, 'sesiones').flush({ juegoId: 'x', filtros: {}, datos: SESIONES });
    peticion(m, 'embudo').flush({ juegoId: 'x', filtros: {}, datos: EMBUDO });
    await m.asentar();

    const titulo = m.el.querySelector('h1')!;
    expect(titulo.textContent).toBe('Juego Uno');
    expect(m.el.querySelector('xa-cabecera xa-badge')?.textContent?.trim()).toBe('v1.0.0');

    const kpis = [...m.el.querySelectorAll('xa-kpi')].map((k) => k.textContent);
    expect(kpis[0]).toContain('1,200');
    expect(kpis[1]).toContain('1,500');
    expect(kpis[1]).toContain(ES.resumen.inferidas('12'));
    expect(kpis[2]).toContain('18:42');
    expect(kpis[2]).toContain(ES.resumen.esperado('20:00'));
    expect(kpis[3]).toContain('45 %');
    expect(kpis[3]).toContain(ES.resumen.deJugadores('540', '1,200'));

    const pasos = [...m.el.querySelectorAll('xa-embudo .etiqueta')].map((e) => e.textContent);
    expect(pasos).toEqual(['Nivel A', 'Nivel B', ES.embudo.terminaron]);
    expect(m.el.querySelector('.caida__tramo')?.textContent).toContain('Nivel A');
    expect(m.el.querySelector('.caida__tramo')?.textContent).toContain('Nivel B');
    expect(m.el.querySelector('.caida__cifra')?.textContent).toContain('50 %');
  });

  it('manda los filtros de la URL a la API (fechas en UTC, hasta inclusivo)', async () => {
    const m = await montarVistaJuego(Resumen, '', '/juegos/juego-uno?desde=2026-10-01&hasta=2026-10-07&plataforma=android');
    const req = peticion(m, 'sesiones');
    expect(req.request.params.get('desde')).toBe('2026-10-01T00:00:00.000Z');
    expect(req.request.params.get('hasta')).toBe('2026-10-08T00:00:00.000Z');
    expect(req.request.params.get('plataforma')).toBe('android');
    expect(req.request.params.has('buildVersion')).toBe(false);
    expect(req.request.params.has('origen')).toBe(false);
    peticion(m, 'embudo');
  });

  it('al cambiar un filtro vuelve a pedir los datos', async () => {
    const m = await montarVistaJuego(Resumen);
    peticion(m, 'sesiones').flush({ juegoId: 'x', filtros: {}, datos: SESIONES });
    peticion(m, 'embudo').flush({ juegoId: 'x', filtros: {}, datos: EMBUDO });
    await m.asentar();

    await m.router.navigateByUrl('/juegos/juego-uno?buildVersion=1.0.1');
    await m.asentar();
    expect(peticion(m, 'sesiones').request.params.get('buildVersion')).toBe('1.0.1');
    peticion(m, 'embudo');
  });

  it('sin datos en el rango muestra el estado vacío con "Limpiar filtros"', async () => {
    const m = await montarVistaJuego(Resumen, '', '/juegos/juego-uno?plataforma=android');
    peticion(m, 'sesiones').flush({ juegoId: 'x', filtros: {}, datos: { ...SESIONES, sesiones: 0, jugadores: 0, medianaMs: null, promedioMs: null, inferidas: 0 } });
    peticion(m, 'embudo').flush({ juegoId: 'x', filtros: {}, datos: EMBUDO.map((p) => ({ ...p, jugadores: 0, porcentaje: 0 })) });
    await m.asentar();
    expect(m.el.querySelector('xa-estado-vacio')?.textContent).toContain(ES.juego.sinDatosTitulo);
    expect(m.el.querySelector('xa-estado-vacio button')?.textContent?.trim()).toBe(ES.filtros.limpiar);
  });

  it('si falla un endpoint muestra el error y Reintentar vuelve a pedir', async () => {
    const m = await montarVistaJuego(Resumen);
    peticion(m, 'sesiones').flush({}, { status: 500, statusText: 'Error' });
    peticion(m, 'embudo').flush({ juegoId: 'x', filtros: {}, datos: EMBUDO });
    await m.asentar();
    expect(m.el.querySelector('xa-estado-error')).not.toBeNull();

    m.el.querySelector<HTMLButtonElement>('xa-estado-error button')!.click();
    await m.asentar();
    peticion(m, 'sesiones').flush({ juegoId: 'x', filtros: {}, datos: SESIONES });
    peticion(m, 'embudo').flush({ juegoId: 'x', filtros: {}, datos: EMBUDO });
    await m.asentar();
    expect(m.el.querySelector('xa-estado-error')).toBeNull();
    expect(m.el.querySelectorAll('xa-kpi')).toHaveLength(4);
  });
});
