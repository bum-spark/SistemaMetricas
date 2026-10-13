import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ES } from '../../i18n/es';
import { Boton } from '../../shared/ui/boton/boton';
import { Campo } from '../../shared/ui/campo/campo';
import { desdeUltimosDias, FILTROS_VACIOS, hayFiltros } from './filtros';
import { JuegoActualService } from './juego-actual.service';

type Atajo = 7 | 30 | 'todo';

// Barra de filtros (DISENO_DASHBOARD.md §4): rango de fechas con atajos (7 días, 30 días, Todo),
// versión de build y plataforma (opciones de GET /juegos/:juegoId) y "Limpiar filtros".
// Cada cambio se escribe en la URL; las vistas reaccionan a ella.
@Component({
  selector: 'xa-barra-filtros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Campo],
  templateUrl: './barra-filtros.html',
  styleUrl: './barra-filtros.css',
})
export class BarraFiltros {
  protected readonly juego = inject(JuegoActualService);
  protected readonly textos = ES.filtros;
  protected readonly filtros = this.juego.filtros;
  protected readonly opciones = computed(() => {
    const d = this.juego.detalle();
    return d.estado === 'listo' ? d.datos.filtros : { buildVersions: [], plataformas: [] };
  });
  protected readonly conFiltros = computed(() => hayFiltros(this.filtros()));

  protected atajoActivo(): Atajo | null {
    const f = this.filtros();
    if (!f.desde && !f.hasta) {
      return 'todo';
    }
    if (f.hasta) {
      return null;
    }
    return f.desde === desdeUltimosDias(7) ? 7 : f.desde === desdeUltimosDias(30) ? 30 : null;
  }

  protected aplicarAtajo(atajo: Atajo): void {
    this.juego.aplicarFiltros(atajo === 'todo' ? { desde: null, hasta: null } : { desde: desdeUltimosDias(atajo), hasta: null });
  }

  protected cambiar(campo: 'desde' | 'hasta' | 'buildVersion' | 'plataforma', evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    this.juego.aplicarFiltros({ [campo]: valor || null });
  }

  protected limpiar(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
