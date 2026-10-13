import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EstadisticasService } from '../../../core/api/estadisticas.service';
import { LogroObtenido } from '../../../core/api/tipos';
import { ES } from '../../../i18n/es';
import { cargadoEnDe, cargaReactiva } from '../../../shared/carga';
import { formatearEntero, formatearPorcentaje, SIN_DATO } from '../../../shared/formato/formato';
import { Boton } from '../../../shared/ui/boton/boton';
import { Cabecera } from '../../../shared/ui/cabecera/cabecera';
import { EstadoError, EstadoVacio, Skeleton } from '../../../shared/ui/estado/estados';
import { Insignia } from '../../../shared/ui/insignia/insignia';
import { Kpi } from '../../../shared/ui/kpi/kpi';
import { Tarjeta } from '../../../shared/ui/tarjeta/tarjeta';
import { FILTROS_VACIOS, hayFiltros } from '../filtros';
import { JuegoActualService } from '../juego-actual.service';
import { FilaLogro, filasLogros, kpisLogros } from './logros-calculos';

// /juegos/:slug/logros (DISENO_DASHBOARD.md §5 y §6): lista de barras horizontales con nombre,
// descripción, jugadores y % de TODOS los logros del catálogo (también los de 0 %), con la
// rareza calculada con umbrales.ts, y 4 KPIs. Endpoint: logros. Los coleccionables llegarán
// con `atencion` (aún no existe), así que no hay tarjeta para ellos.
@Component({
  selector: 'xa-logros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cabecera, EstadoError, EstadoVacio, Insignia, Kpi, Skeleton, Tarjeta],
  templateUrl: './logros.html',
  styleUrl: './logros.css',
})
export class Logros {
  protected readonly juego = inject(JuegoActualService);
  private readonly api = inject(EstadisticasService);
  protected readonly textos = ES.logros;
  protected readonly textosJuego = ES.juego;
  protected readonly textosFiltros = ES.filtros;
  protected readonly porcentaje = formatearPorcentaje;
  protected readonly entero = formatearEntero;

  private readonly logros = cargaReactiva(() => {
    const id = this.juego.juegoId();
    return id ? this.api.obtener<LogroObtenido[]>(id, 'logros', this.juego.filtrosApi()) : null;
  });

  protected readonly cargando = computed(() => this.logros.carga().estado === 'cargando' || !this.juego.catalogo());
  protected readonly conError = computed(() => this.logros.carga().estado === 'error');
  protected readonly cargadoEn = computed(() => cargadoEnDe(this.logros.carga()));
  protected readonly filas = computed<FilaLogro[]>(() => {
    const c = this.logros.carga();
    const catalogo = this.juego.catalogo();
    return c.estado === 'listo' && catalogo ? filasLogros(catalogo, c.datos) : [];
  });
  // Vacío solo si el juego no tiene logros en su catálogo; con logros, se muestran aunque estén en 0 %.
  protected readonly sinDatos = computed(() => this.filas().length === 0);
  protected readonly conFiltros = computed(() => hayFiltros(this.juego.filtros()));

  protected readonly kpis = computed(() => {
    const k = kpisLogros(this.filas());
    return {
      obtenidos: formatearEntero(k.obtenidos),
      obtenidosContexto: this.textos.kpiObtenidosContexto(formatearEntero(k.catalogo)),
      comun: k.comun?.nombre ?? SIN_DATO,
      comunContexto: k.comun ? this.textos.kpiPorcentaje(formatearPorcentaje(k.comun.porcentaje)) : null,
      raro: k.raro?.nombre ?? SIN_DATO,
      raroContexto: k.raro ? this.textos.kpiPorcentaje(formatearPorcentaje(k.raro.porcentaje)) : null,
      sinObtener: formatearEntero(k.sinObtener),
      sinObtenerContexto: this.textos.kpiSinObtenerContexto(formatearEntero(k.catalogo)),
    };
  });

  // Ancho de la barra; un logro con jugadores nunca queda invisible.
  protected ancho(porcentaje: number): string {
    return `${porcentaje > 0 ? Math.max(0.5, Math.min(100, porcentaje)) : 0}%`;
  }

  protected reintentar(): void {
    this.logros.reintentar();
  }

  protected limpiarFiltros(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
