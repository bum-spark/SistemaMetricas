import { TestBed } from '@angular/core/testing';
import { Cabecera } from './cabecera';

describe('Cabecera', () => {
  afterEach(() => vi.useRealTimers());

  it('muestra título, versión, pregunta y "Datos cargados hace X min", que avanza cada minuto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
    const fixture = TestBed.createComponent(Cabecera);
    fixture.componentRef.setInput('titulo', 'Juego Uno');
    fixture.componentRef.setInput('pregunta', '¿Pregunta?');
    fixture.componentRef.setInput('version', 'v1.0.0');
    fixture.componentRef.setInput('cargadoEn', new Date('2026-10-12T15:00:00Z'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('Juego Uno');
    expect(el.querySelector('xa-badge')?.textContent?.trim()).toBe('v1.0.0');
    expect(el.querySelector('.pregunta')?.textContent).toBe('¿Pregunta?');
    expect(el.querySelector('.cargado')?.textContent).toBe('Datos cargados hace menos de 1 min');

    vi.advanceTimersByTime(3 * 60_000);
    fixture.detectChanges();
    expect(el.querySelector('.cargado')?.textContent).toBe('Datos cargados hace 3 min');

    vi.advanceTimersByTime(60 * 60_000);
    fixture.detectChanges();
    expect(el.querySelector('.cargado')?.textContent).toBe('Datos cargados hace 1 h');
  });

  it('sin datos cargados no muestra el texto ni la versión', async () => {
    const fixture = TestBed.createComponent(Cabecera);
    fixture.componentRef.setInput('titulo', 'Juegos');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.cargado')).toBeNull();
    expect(el.querySelector('xa-badge')).toBeNull();
  });
});
