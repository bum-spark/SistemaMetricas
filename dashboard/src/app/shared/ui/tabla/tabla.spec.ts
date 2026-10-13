import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CeldaTabla, ColumnaTabla, Tabla } from './tabla';

interface Fila {
  nombre: string;
  jugadores: number;
}

@Component({
  imports: [Tabla, CeldaTabla],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <xa-tabla [columnas]="columnas" [filas]="filas()" titulo="Tabla de prueba" [porPagina]="2">
      <ng-template xaCelda="nombre" let-fila><strong class="nombre">{{ fila.nombre }}</strong></ng-template>
    </xa-tabla>
  `,
})
class Anfitrion {
  columnas: ColumnaTabla<Fila>[] = [
    { clave: 'nombre', titulo: 'Nivel' },
    { clave: 'jugadores', titulo: 'Jugadores', numerica: true, ordenable: true, valor: (f) => String(f.jugadores), orden: (f) => f.jugadores },
  ];
  filas = signal<Fila[]>([
    { nombre: 'A', jugadores: 10 },
    { nombre: 'B', jugadores: 30 },
    { nombre: 'C', jugadores: 20 },
  ]);
}

async function montar() {
  const fixture = TestBed.createComponent(Anfitrion);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const nombres = () => [...el.querySelectorAll('tbody .nombre')].map((n) => n.textContent);
  return { fixture, el, nombres };
}

describe('Tabla', () => {
  it('usa la plantilla de celda, alinea números y pagina', async () => {
    const { el, fixture, nombres } = await montar();
    expect(el.querySelector('caption')?.textContent).toBe('Tabla de prueba');
    expect(nombres()).toEqual(['A', 'B']);
    expect(el.querySelector('tbody td.numerica')?.textContent?.trim()).toBe('10');
    expect(el.querySelector('.pagina__texto')?.textContent).toBe('Página 1 de 2');

    el.querySelector<HTMLButtonElement>('[aria-label="Página siguiente"]')!.click();
    await fixture.whenStable();
    expect(nombres()).toEqual(['C']);
  });

  it('ordena por columna (primero descendente) con aria-sort', async () => {
    const { el, fixture, nombres } = await montar();
    const th = el.querySelectorAll('th')[1]!;
    expect(th.getAttribute('aria-sort')).toBe('none');
    expect(el.querySelectorAll('th')[0]!.hasAttribute('aria-sort')).toBe(false);

    th.querySelector('button')!.click();
    await fixture.whenStable();
    expect(th.getAttribute('aria-sort')).toBe('descending');
    expect(nombres()).toEqual(['B', 'C']);

    th.querySelector('button')!.click();
    await fixture.whenStable();
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    expect(nombres()).toEqual(['A', 'C']);
  });

  it('con una sola página no muestra la paginación', async () => {
    const { el, fixture } = await montar();
    fixture.componentInstance.filas.set([{ nombre: 'A', jugadores: 1 }]);
    await fixture.whenStable();
    expect(el.querySelector('.paginacion')).toBeNull();
  });
});
