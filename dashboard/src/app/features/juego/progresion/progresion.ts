import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EstadisticasService } from '../../../core/api/estadisticas.service';
import { PasoEmbudo } from '../../../core/api/tipos';
import { ES } from '../../../i18n/es';
import { cargadoEnDe, cargaReactiva } from '../../../shared/carga';
import { Embudo } from '../../../shared/charts/embudo/embudo';
import { formatearEntero, formatearPorcentaje, SIN_DATO } from '../../../shared/formato/formato';
import { DatosInsignia } from '../../../shared/umbrales';
import { Boton } from '../../../shared/ui/boton/boton';
import { Cabecera } from '../../../shared/ui/cabecera/cabecera';
import { EstadoError, EstadoVacio, Skeleton } from '../../../shared/ui/estado/estados';
import { Insignia } from '../../../shared/ui/insignia/insignia';
import { CeldaTabla, ColumnaTabla, Tabla } from '../../../shared/ui/tabla/tabla';
import { Tarjeta } from '../../../shared/ui/tarjeta/tarjeta';
import { FILTROS_VACIOS, hayFiltros } from '../filtros';
import { insigniasEmbudo } from '../insignias-embudo';
import { JuegoActualService } from '../juego-actual.service';
import { pasosVisibles } from '../pasos';

export interface FilaPaso {
  numero: number;
  etiqueta: string;
  jugadores: number;
  delInicio: number;
  delAnterior: number | null;
  caida: number | null; // % perdido respecto al paso anterior
  perdidos: number | null;
  insignias: DatosInsignia[];
}

// /juegos/:slug/progresion (DISENO_DASHBOARD.md §6): embudo completo y tabla por paso. Solo el
// endpoint `embudo`; abandono y tutorial se agregarán cuando existan sus endpoints.
@Component({
  selector: 'xa-progresion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cabecera, CeldaTabla, Embudo, EstadoError, EstadoVacio, Insignia, Skeleton, Tabla, Tarjeta],
  templateUrl: './progresion.html',
  styleUrl: './progresion.css',
})
export class Progresion {
  protected readonly juego = inject(JuegoActualService);
  private readonly api = inject(EstadisticasService);
  protected readonly textos = ES.progresion;
  protected readonly textosJuego = ES.juego;
  protected readonly textosFiltros = ES.filtros;

  private readonly embudo = cargaReactiva(() => {
    const id = this.juego.juegoId();
    return id ? this.api.obtener<PasoEmbudo[]>(id, 'embudo', this.juego.filtrosApi()) : null;
  });

  protected readonly cargando = computed(() => this.embudo.carga().estado === 'cargando' || !this.juego.catalogo());
  protected readonly conError = computed(() => this.embudo.carga().estado === 'error');
  protected readonly cargadoEn = computed(() => cargadoEnDe(this.embudo.carga()));
  protected readonly pasos = computed(() => {
    const c = this.embudo.carga();
    return c.estado === 'listo' ? pasosVisibles(c.datos, this.juego.catalogo()) : [];
  });
  protected readonly insignias = computed(() => insigniasEmbudo(this.pasos()));
  protected readonly sinDatos = computed(() => (this.pasos()[0]?.jugadores ?? 0) === 0);
  protected readonly conFiltros = computed(() => hayFiltros(this.juego.filtros()));

  protected readonly filas = computed<FilaPaso[]>(() =>
    this.pasos().map((p, i, todos) => {
      const previo = i > 0 ? todos[i - 1]! : null;
      const perdidos = previo ? Math.max(0, previo.jugadores - p.jugadores) : null;
      return {
        numero: i + 1,
        etiqueta: p.etiqueta,
        jugadores: p.jugadores,
        delInicio: p.porcentaje,
        delAnterior: previo ? (previo.jugadores > 0 ? (p.jugadores / previo.jugadores) * 100 : 0) : null,
        caida: previo && perdidos !== null ? (previo.jugadores > 0 ? (perdidos / previo.jugadores) * 100 : 0) : null,
        perdidos,
        insignias: this.insignias()[i] ?? [],
      };
    }),
  );

  protected readonly columnas: ColumnaTabla<FilaPaso>[] = [
    { clave: 'paso', titulo: ES.progresion.paso, orden: (f) => f.numero },
    { clave: 'jugadores', titulo: ES.progresion.jugadores, numerica: true, ordenable: true, valor: (f) => formatearEntero(f.jugadores), orden: (f) => f.jugadores },
    { clave: 'delInicio', titulo: ES.progresion.delInicio, numerica: true, valor: (f) => formatearPorcentaje(f.delInicio) },
    { clave: 'delAnterior', titulo: ES.progresion.delAnterior, numerica: true, valor: (f) => (f.delAnterior === null ? SIN_DATO : formatearPorcentaje(f.delAnterior)) },
    { clave: 'caida', titulo: ES.progresion.caida, numerica: true, ordenable: true, orden: (f) => f.caida },
    { clave: 'diagnostico', titulo: ES.progresion.diagnostico },
  ];

  protected readonly alternativa = computed(() => {
    const p = this.pasos();
    const ultimo = p.at(-1);
    return p[0] && ultimo ? this.textos.altEmbudo(formatearEntero(p[0].jugadores), formatearEntero(ultimo.jugadores), formatearPorcentaje(ultimo.porcentaje)) : '';
  });

  protected readonly porcentaje = formatearPorcentaje;
  protected readonly entero = formatearEntero;

  protected reintentar(): void {
    this.embudo.reintentar();
  }

  protected limpiarFiltros(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
