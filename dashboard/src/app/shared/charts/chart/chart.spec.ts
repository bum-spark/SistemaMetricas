import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { opcionesBase } from '../chart-theme';
import { GraficaChart } from './chart';

@Component({
  imports: [GraficaChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<xa-chart [datos]="datos" [opciones]="opciones" etiquetaAccesible="Dato clave"><table class="solo-lector"><caption>Alternativa</caption></table></xa-chart>`,
})
class Anfitrion {
  datos = { labels: ['A'], datasets: [{ label: 'x', data: [1] }] };
  opciones = opcionesBase();
}

describe('GraficaChart', () => {
  it('pinta un canvas con aria-label y proyecta la alternativa textual (sin canvas en jsdom no falla)', async () => {
    const fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const canvas = el.querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Dato clave');
    expect(el.querySelector('xa-chart caption')?.textContent).toBe('Alternativa');
  });
});
