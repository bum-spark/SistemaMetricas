import { TestBed } from '@angular/core/testing';
import { caidas, Embudo, mayorCaida, PasoVisible } from './embudo';

const PASOS: PasoVisible[] = [
  { etiqueta: 'Nivel A', jugadores: 300, porcentaje: 100 },
  { etiqueta: 'Nivel B', jugadores: 209, porcentaje: 69.7 },
  { etiqueta: 'Nivel C', jugadores: 133, porcentaje: 44.3 },
  { etiqueta: 'Terminaron', jugadores: 93, porcentaje: 31 },
];

describe('caídas del embudo', () => {
  it('calcula la pérdida relativa al paso anterior', () => {
    const c = caidas(PASOS);
    expect(c.map((x) => x.jugadores)).toEqual([91, 76, 40]);
    expect(c[1]!.porcentaje).toBeCloseTo(36.36, 2);
  });

  it('la mayor caída es la de mayor porcentaje; null si nadie se pierde', () => {
    expect(mayorCaida(PASOS)).toMatchObject({ desde: 1, hasta: 2, jugadores: 76 });
    expect(mayorCaida([{ etiqueta: 'A', jugadores: 5, porcentaje: 100 }, { etiqueta: 'B', jugadores: 5, porcentaje: 100 }])).toBeNull();
    expect(mayorCaida([{ etiqueta: 'A', jugadores: 0, porcentaje: 0 }, { etiqueta: 'B', jugadores: 0, porcentaje: 0 }])).toBeNull();
  });
});

describe('Embudo', () => {
  it('una barra por paso con jugadores y %, la caída entre barras y la mayor resaltada', async () => {
    const fixture = TestBed.createComponent(Embudo);
    fixture.componentRef.setInput('pasos', PASOS);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const pasos = el.querySelectorAll('li.paso');
    expect(pasos).toHaveLength(4);
    expect(pasos[0]!.textContent).toContain('Nivel A');
    expect(pasos[0]!.textContent).toContain('300 · 100 %');
    expect(pasos[0]!.querySelector('.caida')).toBeNull();
    expect(pasos[2]!.querySelector('.caida')?.textContent).toContain('36 %');
    expect(pasos[2]!.classList.contains('paso--mayor-caida')).toBe(true);
    expect(el.querySelectorAll('.paso--mayor-caida')).toHaveLength(1);
    expect(pasos[3]!.querySelector('.barra__valor')?.getAttribute('width')).toBe('31%');
  });

  it('muestra las insignias de cada paso con su regla en el tooltip', async () => {
    const fixture = TestBed.createComponent(Embudo);
    fixture.componentRef.setInput('pasos', PASOS);
    fixture.componentRef.setInput('insignias', [[], [], [{ etiqueta: 'Mayor fuga', tono: 'danger', regla: 'La regla.' }], []]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const insignias = el.querySelectorAll('xa-insignia');
    expect(insignias).toHaveLength(1);
    expect(el.querySelectorAll('li.paso')[2]!.querySelector('xa-insignia xa-badge')?.textContent?.trim()).toBe('Mayor fuga');
    const tooltip = el.querySelector('xa-insignia [role="tooltip"]')!;
    expect(tooltip.textContent).toBe('La regla.');
    expect(insignias[0]!.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(insignias[0]!.getAttribute('tabindex')).toBe('0');
  });
});
