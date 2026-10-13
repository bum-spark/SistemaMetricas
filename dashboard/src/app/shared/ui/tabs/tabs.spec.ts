import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Tabs } from './tabs';

@Component({
  imports: [Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<xa-tabs etiqueta="Causa" [opciones]="opciones" [(seleccion)]="seleccion" />`,
})
class Anfitrion {
  opciones = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'a', etiqueta: 'A' },
    { valor: 'b', etiqueta: 'B' },
  ];
  seleccion = signal('todas');
}

describe('Tabs', () => {
  it('marca la activa, cambia con clic y con flechas, Inicio y Fin', async () => {
    const fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const lista = el.querySelector('xa-tabs')!;
    const tabs = () => [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(lista.getAttribute('role')).toBe('tablist');
    expect(lista.getAttribute('aria-label')).toBe('Causa');
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    tabs()[2]!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.seleccion()).toBe('b');

    lista.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(fixture.componentInstance.seleccion()).toBe('todas');
    lista.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(fixture.componentInstance.seleccion()).toBe('b');
    lista.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(fixture.componentInstance.seleccion()).toBe('todas');
    lista.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(fixture.componentInstance.seleccion()).toBe('b');
  });
});
