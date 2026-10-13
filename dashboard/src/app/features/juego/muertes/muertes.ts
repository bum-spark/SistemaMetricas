import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { EstadisticasService } from '../../../core/api/estadisticas.service';
import { DatosMapaCalor, MuertesNivelCausa } from '../../../core/api/tipos';
import { ES } from '../../../i18n/es';
import { cargadoEnDe, cargaReactiva } from '../../../shared/carga';
import { GraficaChart } from '../../../shared/charts/chart/chart';
import { agregarCeldas } from '../../../shared/charts/mapa-calor/geometria';
import { MapaCalor } from '../../../shared/charts/mapa-calor/mapa-calor';
import { colorCategorico, opcionesBase } from '../../../shared/charts/chart-theme';
import { formatearDecimal, formatearEntero, formatearPorcentaje, SIN_DATO } from '../../../shared/formato/formato';
import { Boton } from '../../../shared/ui/boton/boton';
import { Cabecera } from '../../../shared/ui/cabecera/cabecera';
import { EstadoError, EstadoVacio, Skeleton } from '../../../shared/ui/estado/estados';
import { Kpi } from '../../../shared/ui/kpi/kpi';
import { OpcionTab, Tabs } from '../../../shared/ui/tabs/tabs';
import { ColumnaTabla, Tabla } from '../../../shared/ui/tabla/tabla';
import { Tarjeta } from '../../../shared/ui/tarjeta/tarjeta';
import { FILTROS_VACIOS, hayFiltros } from '../filtros';
import { JuegoActualService } from '../juego-actual.service';
import { FilaMuerte, filasMuertes, kpisMuertes } from './muertes-calculos';

// Tamaños de celda del mapa de calor, en unidades del mundo del juego (la API acepta > 0 y ≤ 1000).
export const CELDAS_MAPA = [1, 2, 5, 10] as const;
const TODAS = '__todas__';

// /juegos/:slug/muertes (DISENO_DASHBOARD.md §6): KPIs, barras apiladas por nivel y causa
// (paleta categórica por posición de la causa en el catálogo, §5), tabla con conteo y % y mapa
// de calor (?nivelId=&celda= en la URL; pestañas por causa). Endpoints: muertes y mapa-calor.
@Component({
  selector: 'xa-muertes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cabecera, EstadoError, EstadoVacio, GraficaChart, Kpi, MapaCalor, Skeleton, Tabla, Tabs, Tarjeta],
  templateUrl: './muertes.html',
  styleUrl: './muertes.css',
})
export class Muertes {
  protected readonly juego = inject(JuegoActualService);
  private readonly api = inject(EstadisticasService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly consulta = toSignal(this.ruta.queryParamMap, { initialValue: this.ruta.snapshot.queryParamMap });
  protected readonly celdas = CELDAS_MAPA;
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

  // ---------- Mapa de calor ----------
  // Nivel de ?nivelId= si está en el catálogo (p. ej. desde el botón del Resumen); si no, el primero.
  protected readonly nivelesCatalogo = computed(() => [...(this.juego.catalogo()?.niveles ?? [])].sort((a, b) => a.orden - b.orden));
  protected readonly nivelMapa = computed(() => {
    const pedido = this.consulta().get('nivelId');
    const niveles = this.nivelesCatalogo();
    return niveles.find((n) => n.nivelId === pedido)?.nivelId ?? niveles[0]?.nivelId ?? null;
  });
  protected readonly celdaMapa = computed(() => {
    const valor = Number(this.consulta().get('celda'));
    return (CELDAS_MAPA as readonly number[]).includes(valor) ? valor : CELDAS_MAPA[0];
  });
  protected readonly causaMapa = signal<string>(TODAS);
  protected readonly opcionesCausa = computed<OpcionTab[]>(() => [
    { valor: TODAS, etiqueta: this.textos.todas },
    ...(this.juego.catalogo()?.causasMuerte ?? []).map((c) => ({ valor: c.causa, etiqueta: c.nombre })),
  ]);
  protected readonly nombreCausa = (causa: string) => this.juego.catalogo()?.causasMuerte.find((c) => c.causa === causa)?.nombre ?? causa;

  private readonly mapa = cargaReactiva(() => {
    const id = this.juego.juegoId();
    const nivelId = this.nivelMapa();
    return id && nivelId ? this.api.obtener<DatosMapaCalor>(id, 'mapa-calor', this.juego.filtrosApi(), { nivelId, celda: this.celdaMapa() }) : null;
  });
  protected readonly mapaCargando = computed(() => this.mapa.carga().estado === 'cargando');
  protected readonly mapaError = computed(() => this.mapa.carga().estado === 'error');
  protected readonly datosMapa = computed(() => {
    const c = this.mapa.carga();
    return c.estado === 'listo' ? c.datos : null;
  });
  protected readonly celdasMapa = computed(() => {
    const d = this.datosMapa();
    const causa = this.causaMapa();
    return d ? agregarCeldas(d.celdas, causa === TODAS ? null : causa) : [];
  });
  protected readonly altMapa = computed(() => {
    const celdas = this.celdasMapa();
    const max = celdas.reduce<(typeof celdas)[number] | null>((m, c) => (!m || c.muertes > m.muertes ? c : m), null);
    const total = celdas.reduce((s, c) => s + c.muertes, 0);
    return max ? this.textos.mapaAlt(formatearEntero(total), String(max.x), String(max.y), formatearEntero(max.muertes)) : this.textos.sinMuertesNivel;
  });

  protected cambiarMapa(cambios: { nivelId?: string; celda?: number }): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: cambios, queryParamsHandling: 'merge' });
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLSelectElement).value;
  }

  protected reintentarMapa(): void {
    this.mapa.reintentar();
  }

  protected reintentar(): void {
    this.muertes.reintentar();
  }

  protected limpiarFiltros(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
