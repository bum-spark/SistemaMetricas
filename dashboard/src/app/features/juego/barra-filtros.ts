import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FunnelX, LucideAngularModule } from 'lucide-angular';
import { ES } from '../../i18n/es';
import { desdeUltimosDias, FILTROS_VACIOS, hayFiltros, OrigenDatos } from './filtros';
import { JuegoActualService } from './juego-actual.service';

type Atajo = 7 | 30 | 'todo';

// Barra de filtros en una fila (DISENO_DASHBOARD.md §4): atajos de fecha, rango de fechas,
// build y plataforma (opciones de GET /juegos/:juegoId), origen de los datos y "Limpiar
// filtros" como botón de icono. La etiqueta va dentro del control y cada control conserva su
// nombre accesible. Cada cambio se escribe en la URL; las vistas reaccionan a ella.
@Component({
  selector: 'xa-barra-filtros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './barra-filtros.html',
  styleUrl: './barra-filtros.css',
})
export class BarraFiltros {
  protected readonly juego = inject(JuegoActualService);
  protected readonly textos = ES.filtros;
  protected readonly iconoLimpiar = FunnelX;
  protected readonly origenes: { valor: OrigenDatos | null; etiqueta: string }[] = [
    { valor: null, etiqueta: ES.filtros.origenes.todos },
    { valor: 'real', etiqueta: ES.filtros.origenes.real },
    { valor: 'seed', etiqueta: ES.filtros.origenes.seed },
  ];
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

  protected cambiarOrigen(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.juego.aplicarFiltros({ origen: valor === 'real' || valor === 'seed' ? valor : null });
  }

  protected limpiar(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
