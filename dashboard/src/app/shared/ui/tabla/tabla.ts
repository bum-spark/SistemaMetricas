import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, contentChildren, Directive, inject, input, linkedSignal, signal, TemplateRef } from '@angular/core';
import { ES } from '../../../i18n/es';

export interface ColumnaTabla<T> {
  clave: string;
  titulo: string;
  // Números: alineados a la derecha en mono tabular (§4).
  numerica?: boolean;
  ordenable?: boolean;
  // Texto de la celda si no hay plantilla <ng-template xaCelda="clave">.
  valor?: (fila: T) => string;
  // Valor para ordenar (por defecto, `valor`).
  orden?: (fila: T) => number | string | null;
}

// Plantilla propia para las celdas de una columna: <ng-template xaCelda="nivel" let-fila>.
@Directive({ selector: 'ng-template[xaCelda]' })
export class CeldaTabla {
  readonly xaCelda = input.required<string>();
  readonly plantilla = inject(TemplateRef<{ $implicit: unknown }>);
}

type Direccion = 'ascending' | 'descending';

// Tabla (DISENO_DASHBOARD.md §4): cabecera fija 12/500 --text-3, filas de 44 px con separador
// --border-subtle y hover --bg-2, números a la derecha en mono tabular, ordenable (flecha +
// aria-sort), paginación abajo a la derecha y scroll horizontal en pantallas pequeñas.
@Component({
  selector: 'xa-tabla',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './tabla.html',
  styleUrl: './tabla.css',
})
export class Tabla<T> {
  readonly columnas = input.required<ColumnaTabla<T>[]>();
  readonly filas = input.required<T[]>();
  readonly titulo = input.required<string>(); // <caption> (visible solo para lectores)
  readonly porPagina = input(10);

  protected readonly textos = ES.tabla;
  private readonly celdas = contentChildren(CeldaTabla);
  protected readonly orden = signal<{ clave: string; direccion: Direccion } | null>(null);
  // Vuelve a la primera página si cambian las filas (otro filtro).
  protected readonly pagina = linkedSignal({ source: this.filas, computation: () => 0 });

  protected readonly plantillas = computed(() => new Map(this.celdas().map((c) => [c.xaCelda(), c.plantilla])));

  private readonly ordenadas = computed(() => {
    const o = this.orden();
    const filas = [...this.filas()];
    const col = o ? this.columnas().find((c) => c.clave === o.clave) : undefined;
    if (!o || !col) {
      return filas;
    }
    const clave = col.orden ?? col.valor ?? (() => null);
    const signo = o.direccion === 'ascending' ? 1 : -1;
    return filas.sort((a, b) => {
      const va = clave(a);
      const vb = clave(b);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : 1) * signo;
    });
  });

  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.filas().length / this.porPagina())));
  protected readonly visibles = computed(() => {
    const inicio = this.pagina() * this.porPagina();
    return this.ordenadas().slice(inicio, inicio + this.porPagina());
  });

  protected ariaSort(clave: string): Direccion | 'none' {
    const o = this.orden();
    return o?.clave === clave ? o.direccion : 'none';
  }

  protected ordenarPor(clave: string): void {
    const o = this.orden();
    this.orden.set({ clave, direccion: o?.clave === clave && o.direccion === 'descending' ? 'ascending' : 'descending' });
    this.pagina.set(0);
  }

  protected texto(fila: T, col: ColumnaTabla<T>): string {
    return col.valor ? col.valor(fila) : String((fila as Record<string, unknown>)[col.clave] ?? '');
  }
}
