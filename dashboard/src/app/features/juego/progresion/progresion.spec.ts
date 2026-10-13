import { montarVistaJuego } from '../../../../testing/juego';
import { ES } from '../../../i18n/es';
import { Progresion } from './progresion';

const EMBUDO = [
  { paso: 'nivel_a', jugadores: 1200, porcentaje: 100 },
  { paso: 'nivel_b', jugadores: 600, porcentaje: 50 },
  { paso: 'terminaron', jugadores: 540, porcentaje: 45 },
];

describe('Progresión (/juegos/:slug/progresion)', () => {
  it('embudo completo con insignias y tabla por paso con % del inicio, % del anterior y caída', async () => {
    const m = await montarVistaJuego(Progresion, 'progresion');
    expect(m.el.querySelector('xa-skeleton')).not.toBeNull();
    m.http.expectOne((r) => r.url === m.urlEstadistica('embudo')).flush({ juegoId: 'x', filtros: {}, datos: EMBUDO });
    await m.asentar();

    expect(m.el.querySelector('h1')?.textContent).toBe(ES.progresion.titulo);
    expect([...m.el.querySelectorAll('xa-embudo .etiqueta')].map((e) => e.textContent)).toEqual(['Nivel A', 'Nivel B', ES.embudo.terminaron]);

    const filas = [...m.el.querySelectorAll('xa-tabla tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.replace(/\s+/g, ' ').trim()));
    expect(filas[0]).toEqual(['1Nivel A', '1,200', '100 %', '—', '—', '']);
    expect(filas[1]!.slice(0, 4)).toEqual(['2Nivel B', '600', '50 %', '50 %']);
    expect(filas[1]![4]).toContain('−50 %');
    expect(filas[1]![4]).toContain('600 jugadores');
    expect(filas[1]![5]).toContain(ES.insignias.mayorFuga);
    expect(filas[1]![5]).toContain(ES.insignias.critica);
    expect(filas[2]![3]).toBe('90 %');
    expect(filas[2]![5]).toBe('');
  });

  it('sin datos muestra el estado vacío, sin tarjetas vacías', async () => {
    const m = await montarVistaJuego(Progresion, 'progresion');
    m.http.expectOne((r) => r.url === m.urlEstadistica('embudo')).flush({ juegoId: 'x', filtros: {}, datos: EMBUDO.map((p) => ({ ...p, jugadores: 0, porcentaje: 0 })) });
    await m.asentar();
    expect(m.el.querySelector('xa-estado-vacio')).not.toBeNull();
    expect(m.el.querySelector('xa-tarjeta')).toBeNull();
  });

  it('con error muestra Reintentar y vuelve a pedir el embudo', async () => {
    const m = await montarVistaJuego(Progresion, 'progresion');
    m.http.expectOne((r) => r.url === m.urlEstadistica('embudo')).flush({}, { status: 500, statusText: 'x' });
    await m.asentar();
    m.el.querySelector<HTMLButtonElement>('xa-estado-error button')!.click();
    await m.asentar();
    m.http.expectOne((r) => r.url === m.urlEstadistica('embudo')).flush({ juegoId: 'x', filtros: {}, datos: EMBUDO });
    await m.asentar();
    expect(m.el.querySelectorAll('xa-tabla tbody tr')).toHaveLength(3);
  });
});
