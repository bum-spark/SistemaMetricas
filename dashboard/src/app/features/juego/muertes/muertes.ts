import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { EstadisticasService } from '../../../core/api/estadisticas.service';
import { MuertesNivelCausa } from '../../../core/api/tipos';
import { ES } from '../../../i18n/es';
import { cargadoEnDe, cargaReactiva } from '../../../shared/carga';
import { GraficaChart } from '../../../shared/charts/chart/chart';
import { colorCategorico, opcionesBase } from '../../../shared/charts/chart-theme';
import { formatearDecimal, formatearEntero, formatearPorcentaje, SIN_DATO } from '../../../shared/formato/formato';
import { Boton } from '../../../shared/ui/boton/boton';
import { Cabecera } from '../../../shared/ui/cabecera/cabecera';
import { EstadoError, EstadoVacio, Skeleton } from '../../../shared/ui/estado/estados';
import { Kpi } from '../../../shared/ui/kpi/kpi';
import { ColumnaTabla, Tabla } from '../../../shared/ui/tabla/tabla';
import { Tarjeta } from '../../../shared/ui/tarjeta/tarjeta';
import { FILTROS_VACIOS, hayFiltros } from '../filtros';
import { JuegoActualService } from '../juego-actual.service';
import { FilaMuerte, filasMuertes, kpisMuertes } from './muertes-calculos';

// /juegos/:slug/muertes (DISENO_DASHBOARD.md §6): KPIs, barras apiladas por nivel y causa
// (paleta categórica por posición de la causa en el catálogo, §5) y tabla con conteo y %.
// Endpoint: muertes. El mapa de calor se agrega en su propio commit.
@Component({
  selector: 'xa-muertes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cabecera, EstadoError, EstadoVacio, GraficaChart, Kpi, Skeleton, Tabla, Tarjeta],
  templateUrl: './muertes.html',
  styleUrl: './muertes.css',
})
export class Muertes {
  protected readonly juego = inject(JuegoActualService);
  private readonly api = inject(EstadisticasService);
  protected readonly textos = ES.muertes;
  protected readonly textosJuego = ES.juego;
  protected readonly textosFiltros = ES.filtros;

  private readonly muertes = cargaReactiva(() => {
    const id = this.juego.juegoId();
    return id ? this.api.obtener<MuertesNivelCausa[]>(id, 'muertes', this.juego.filtrosApi()) : null;
  });

  protected readonly cargando = computed(() => this.muertes.carga().estado === 'cargando' || !this.juego.catalogo());
  protected readonly conError = computed(() => this.muertes.carga().estado === 'error');
  protected readonly cargadoEn = computed(() => cargadoEnDe(this.muertes.carga()));
  protected readonly filas = computed<FilaMuerte[]>(() => {
    const c = this.muertes.carga();
    const catalogo = this.juego.catalogo();
    return c.estado === 'listo' && catalogo ? filasMuertes(catalogo, c.datos) : [];
  });
  protected readonly sinDatos = computed(() => this.filas().length === 0);
  protected readonly conFiltros = computed(() => hayFiltros(this.juego.filtros()));

  protected readonly kpis = computed(() => {
    const k = kpisMuertes(this.filas());
    const pct = (n: number) => formatearPorcentaje(k.total > 0 ? (n / k.total) * 100 : null);
    return {
      total: formatearEntero(k.total),
      totalContexto: this.textos.kpiTotalContexto(formatearEntero(k.niveles)),
      causa: k.causa?.nombre ?? SIN_DATO,
      causaContexto: k.causa ? this.textos.kpiCausaContexto(formatearEntero(k.causa.muertes), pct(k.causa.muertes)) : null,
      nivel: k.nivel?.nombre ?? SIN_DATO,
      nivelContexto: k.nivel ? this.textos.kpiNivelContexto(formatearEntero(k.nivel.muertes), pct(k.nivel.muertes)) : null,
      repetida: formatearDecimal(k.repetida?.muertesPorJugador),
      repetidaContexto: k.repetida ? this.textos.kpiRepetidaContexto(k.repetida.causa, k.repetida.nivel) : null,
    };
  });

  // Niveles del catálogo que tienen muertes, en su orden; causas en el orden del catálogo.
  private readonly niveles = computed(() => {
    const vistos = new Map<string, { nombre: string; orden: number }>();
    for (const f of this.filas()) {
      vistos.set(f.nivelId, { nombre: f.nombreNivel, orden: f.ordenNivel });
    }
    return [...vistos.entries()].sort((a, b) => a[1].orden - b[1].orden).map(([nivelId, v]) => ({ nivelId, nombre: v.nombre }));
  });

  protected readonly datosBarras = computed<ChartData<'bar'>>(() => {
    const catalogo = this.juego.catalogo();
    const filas = this.filas();
    const niveles = this.niveles();
    return {
      labels: niveles.map((n) => n.nombre),
      datasets: (catalogo?.causasMuerte ?? []).map((c, i) => ({
        label: c.nombre,
        backgroundColor: colorCategorico(i),
        data: niveles.map((n) => filas.find((f) => f.nivelId === n.nivelId && f.causa === c.causa)?.muertes ?? 0),
      })),
    };
  });

  protected readonly opcionesBarras = computed<ChartOptions<'bar'>>(() => {
    const base = opcionesBase(true);
    const catalogo = this.juego.catalogo();
    const filas = this.filas();
    const niveles = this.niveles();
    return {
      ...base,
      scales: {
        x: { ...base.scales?.['x'], stacked: true, ticks: { ...base.scales?.['x']?.ticks, callback: (v) => formatearEntero(Number(v)) } },
        y: { ...base.scales?.['y'], stacked: true },
      },
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (item: TooltipItem<'bar'>) => {
              const causa = catalogo?.causasMuerte[item.datasetIndex];
              const fila = filas.find((f) => f.nivelId === niveles[item.dataIndex]?.nivelId && f.causa === causa?.causa);
              return this.textos.tooltip(causa?.nombre ?? '', formatearEntero(Number(item.raw)), formatearPorcentaje(fila?.porcentajeNivel ?? 0));
            },
          },
        },
      },
    };
  });

  protected readonly altBarras = computed(() => {
    const max = this.filas().reduce<FilaMuerte | null>((m, f) => (!m || f.muertes > m.muertes ? f : m), null);
    return max ? this.textos.barrasAlt(max.nombreNivel, max.nombreCausa, formatearEntero(max.muertes)) : '';
  });

  protected readonly filasTabla = computed(() => [...this.filas()].sort((a, b) => a.ordenNivel - b.ordenNivel || a.posicionCausa - b.posicionCausa));

  protected readonly columnas: ColumnaTabla<FilaMuerte>[] = [
    { clave: 'nivel', titulo: ES.muertes.nivel, valor: (f) => f.nombreNivel },
    { clave: 'causa', titulo: ES.muertes.causa, valor: (f) => f.nombreCausa },
    { clave: 'muertes', titulo: ES.muertes.cantidad, numerica: true, ordenable: true, valor: (f) => formatearEntero(f.muertes), orden: (f) => f.muertes },
    { clave: 'delNivel', titulo: ES.muertes.delNivel, numerica: true, ordenable: true, valor: (f) => formatearPorcentaje(f.porcentajeNivel), orden: (f) => f.porcentajeNivel },
    { clave: 'jugadores', titulo: ES.muertes.jugadores, numerica: true, ordenable: true, valor: (f) => formatearEntero(f.jugadores), orden: (f) => f.jugadores },
    { clave: 'porJugador', titulo: ES.muertes.porJugador, numerica: true, ordenable: true, valor: (f) => formatearDecimal(f.muertesPorJugador), orden: (f) => f.muertesPorJugador },
  ];

  protected reintentar(): void {
    this.muertes.reintentar();
  }

  protected limpiarFiltros(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
