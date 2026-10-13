import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { forkJoin } from 'rxjs';
import { EstadisticasService } from '../../../core/api/estadisticas.service';
import { PasoEmbudo, ReintentosNivel, TiempoNivel } from '../../../core/api/tipos';
import { ES } from '../../../i18n/es';
import { cargadoEnDe, cargaReactiva } from '../../../shared/carga';
import { GraficaChart } from '../../../shared/charts/chart/chart';
import { opcionesBase, token } from '../../../shared/charts/chart-theme';
import { formatearDecimal, formatearDuracion, formatearEntero, formatearPorcentaje, SIN_DATO } from '../../../shared/formato/formato';
import { Boton } from '../../../shared/ui/boton/boton';
import { Cabecera } from '../../../shared/ui/cabecera/cabecera';
import { EstadoError, EstadoVacio, Skeleton } from '../../../shared/ui/estado/estados';
import { Insignia } from '../../../shared/ui/insignia/insignia';
import { Kpi } from '../../../shared/ui/kpi/kpi';
import { CeldaTabla, ColumnaTabla, Tabla } from '../../../shared/ui/tabla/tabla';
import { Tarjeta } from '../../../shared/ui/tarjeta/tarjeta';
import { FILTROS_VACIOS, hayFiltros } from '../filtros';
import { JuegoActualService } from '../juego-actual.service';
import { FilaNivel, filasNiveles, kpisNiveles, porcentajesGrupos } from './niveles-calculos';

interface DatosNiveles {
  tiempos: TiempoNivel[];
  reintentos: ReintentosNivel[];
  embudo: PasoEmbudo[];
}

const RESULTADOS = ['completado', 'muerte', 'abandono'] as const;

// /juegos/:slug/niveles (DISENO_DASHBOARD.md §6): KPIs, tiempo por nivel (barras agrupadas por
// resultado, §5), intentos para pasar (distribución de /reintentos) y tabla por nivel con
// diagnóstico. Endpoints: tiempo-nivel, reintentos y embudo (jugadores por nivel).
@Component({
  selector: 'xa-niveles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cabecera, CeldaTabla, EstadoError, EstadoVacio, GraficaChart, Insignia, Kpi, Skeleton, Tabla, Tarjeta],
  templateUrl: './niveles.html',
  styleUrl: './niveles.css',
})
export class Niveles {
  protected readonly juego = inject(JuegoActualService);
  private readonly api = inject(EstadisticasService);
  protected readonly textos = ES.niveles;
  protected readonly textosJuego = ES.juego;
  protected readonly textosFiltros = ES.filtros;

  private readonly datos = cargaReactiva<DatosNiveles>(() => {
    const id = this.juego.juegoId();
    const f = this.juego.filtrosApi();
    return id
      ? forkJoin({
          tiempos: this.api.obtener<TiempoNivel[]>(id, 'tiempo-nivel', f),
          reintentos: this.api.obtener<ReintentosNivel[]>(id, 'reintentos', f),
          embudo: this.api.obtener<PasoEmbudo[]>(id, 'embudo', f),
        })
      : null;
  });

  protected readonly cargando = computed(() => this.datos.carga().estado === 'cargando' || !this.juego.catalogo());
  protected readonly conError = computed(() => this.datos.carga().estado === 'error');
  protected readonly cargadoEn = computed(() => cargadoEnDe(this.datos.carga()));
  private readonly listos = computed(() => {
    const c = this.datos.carga();
    return c.estado === 'listo' ? c.datos : null;
  });

  protected readonly filas = computed<FilaNivel[]>(() => {
    const d = this.listos();
    const catalogo = this.juego.catalogo();
    return d && catalogo ? filasNiveles(catalogo, d.tiempos, d.reintentos, d.embudo) : [];
  });
  protected readonly sinDatos = computed(() => this.filas().every((f) => f.sesiones === 0 && f.medianaCompletarMs === null));
  protected readonly conFiltros = computed(() => hayFiltros(this.juego.filtros()));

  protected readonly kpis = computed(() => {
    const k = kpisNiveles(this.filas(), this.listos()?.reintentos ?? []);
    return {
      masLargo: k.masLargo?.nombre ?? SIN_DATO,
      masLargoContexto: k.masLargo ? this.textos.kpiMasLargoContexto(formatearDuracion(k.masLargo.medianaMs)) : null,
      intentos: formatearDecimal(k.intentosPasar),
      limpia: formatearPorcentaje(k.sesiones > 0 ? (k.pasadasLimpias / k.sesiones) * 100 : null),
      limpiaContexto: k.sesiones > 0 ? this.textos.kpiLimpiaContexto(formatearEntero(k.pasadasLimpias), formatearEntero(k.sesiones)) : null,
      masRendido: k.masRendido?.nombre ?? SIN_DATO,
      masRendidoContexto: k.masRendido ? this.textos.kpiRendidosContexto(formatearPorcentaje(k.masRendido.porcentaje)) : null,
    };
  });

  // ---------- Tiempo por nivel: barras agrupadas, una serie por resultado ----------
  protected readonly datosTiempo = computed<ChartData<'bar'>>(() => {
    const d = this.listos();
    const filas = this.filas();
    const colores = { completado: token('--success'), muerte: token('--danger'), abandono: token('--warning') };
    return {
      labels: filas.map((f) => f.nombre),
      datasets: RESULTADOS.map((r) => ({
        label: this.textos.resultados[r],
        backgroundColor: colores[r],
        data: filas.map((f) => {
          const ms = d?.tiempos.find((t) => t.nivelId === f.nivelId)?.[r].medianaMs;
          return ms === null || ms === undefined ? null : ms / 1000;
        }) as number[],
      })),
    };
  });

  protected readonly opcionesTiempo = computed<ChartOptions<'bar'>>(() => {
    const base = opcionesBase(true);
    const d = this.listos();
    const filas = this.filas();
    return {
      ...base,
      scales: {
        ...base.scales,
        x: { ...base.scales?.['x'], ticks: { ...base.scales?.['x']?.ticks, callback: (v) => formatearDuracion(Number(v) * 1000) } },
      },
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (item: TooltipItem<'bar'>) => {
              const r = RESULTADOS[item.datasetIndex]!;
              const intentos = d?.tiempos.find((t) => t.nivelId === filas[item.dataIndex]?.nivelId)?.[r].intentos ?? 0;
              return this.textos.tooltipTiempo(this.textos.resultados[r], formatearDuracion(Number(item.raw) * 1000), formatearEntero(intentos));
            },
          },
        },
      },
    };
  });

  protected readonly altTiempo = computed(() => {
    const k = kpisNiveles(this.filas(), []);
    return k.masLargo ? this.textos.tiempoAlt(k.masLargo.nombre, formatearDuracion(k.masLargo.medianaMs)) : '';
  });

  // ---------- Intentos para pasar: barras apiladas al 100 % por grupo ----------
  protected readonly datosGrupos = computed<ChartData<'bar'>>(() => {
    const d = this.listos();
    const filas = this.filas();
    const colores = [token('--success'), token('--petal'), token('--warning'), token('--danger')];
    const porNivel = filas.map((f) => porcentajesGrupos(d?.reintentos.find((r) => r.nivelId === f.nivelId)));
    return {
      labels: filas.map((f) => f.nombre),
      datasets: this.textos.grupos.map((grupo, i) => ({
        label: grupo,
        backgroundColor: colores[i],
        data: porNivel.map((p) => p[i] ?? 0),
      })),
    };
  });

  protected readonly opcionesGrupos = computed<ChartOptions<'bar'>>(() => {
    const base = opcionesBase(true);
    const d = this.listos();
    const filas = this.filas();
    return {
      ...base,
      scales: {
        x: { ...base.scales?.['x'], stacked: true, max: 100, ticks: { ...base.scales?.['x']?.ticks, callback: (v) => formatearPorcentaje(Number(v)) } },
        y: { ...base.scales?.['y'], stacked: true },
      },
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (item: TooltipItem<'bar'>) => {
              const r = d?.reintentos.find((x) => x.nivelId === filas[item.dataIndex]?.nivelId);
              const sesiones = r?.pasaron.distribucion[item.datasetIndex]?.sesiones ?? 0;
              return this.textos.tooltipGrupo(this.textos.grupos[item.datasetIndex]!, formatearPorcentaje(Number(item.raw)), formatearEntero(sesiones));
            },
          },
        },
      },
    };
  });

  protected readonly altGrupos = computed(() => {
    const d = this.listos();
    const peor = this.filas()
      .map((f) => ({ f, limpia: porcentajesGrupos(d?.reintentos.find((r) => r.nivelId === f.nivelId))[0] ?? 0 }))
      .filter((x) => x.f.sesiones > 0)
      .sort((a, b) => a.limpia - b.limpia)[0];
    return peor ? this.textos.distribucionAlt(peor.f.nombre, formatearPorcentaje(peor.limpia)) : '';
  });

  // ---------- Tabla ----------
  protected readonly columnas: ColumnaTabla<FilaNivel>[] = [
    { clave: 'nivel', titulo: ES.niveles.nivel, ordenable: true, orden: (f) => -f.orden },
    { clave: 'jugadores', titulo: ES.niveles.jugadores, numerica: true, ordenable: true, valor: (f) => formatearEntero(f.jugadores), orden: (f) => f.jugadores },
    { clave: 'mediana', titulo: ES.niveles.medianaCompletar, numerica: true, ordenable: true, valor: (f) => formatearDuracion(f.medianaCompletarMs), orden: (f) => f.medianaCompletarMs },
    { clave: 'intentos', titulo: ES.niveles.intentosPasar, numerica: true, ordenable: true, valor: (f) => formatearDecimal(f.intentosPasar), orden: (f) => f.intentosPasar },
    { clave: 'rendidos', titulo: ES.niveles.rendidos, numerica: true, ordenable: true, valor: (f) => formatearPorcentaje(f.porcentajeRendidos), orden: (f) => f.porcentajeRendidos },
    { clave: 'diagnostico', titulo: ES.niveles.diagnostico },
  ];

  protected reintentar(): void {
    this.datos.reintentar();
  }

  protected limpiarFiltros(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
