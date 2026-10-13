import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EstadisticasService } from '../../../core/api/estadisticas.service';
import { DatosSesiones, PasoEmbudo } from '../../../core/api/tipos';
import { ES } from '../../../i18n/es';
import { cargadoEnDe, cargaReactiva } from '../../../shared/carga';
import { Embudo, mayorCaida } from '../../../shared/charts/embudo/embudo';
import { formatearDuracion, formatearEntero, formatearPorcentaje } from '../../../shared/formato/formato';
import { Boton } from '../../../shared/ui/boton/boton';
import { Cabecera } from '../../../shared/ui/cabecera/cabecera';
import { EstadoError, EstadoVacio, Skeleton } from '../../../shared/ui/estado/estados';
import { Kpi } from '../../../shared/ui/kpi/kpi';
import { Tarjeta } from '../../../shared/ui/tarjeta/tarjeta';
import { FILTROS_VACIOS, hayFiltros } from '../filtros';
import { JuegoActualService } from '../juego-actual.service';
import { pasosVisibles } from '../pasos';

// /juegos/:slug (Resumen, DISENO_DASHBOARD.md §6): versión actual junto al nombre, 4 KPIs
// (jugadores, sesiones, duración mediana con "esperado", % terminaron), embudo compacto y
// la mayor caída entre dos pasos. Endpoints: sesiones y embudo.
@Component({
  selector: 'xa-resumen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cabecera, Embudo, EstadoError, EstadoVacio, Kpi, Skeleton, Tarjeta],
  templateUrl: './resumen.html',
  styleUrl: './resumen.css',
})
export class Resumen {
  protected readonly juego = inject(JuegoActualService);
  private readonly api = inject(EstadisticasService);
  protected readonly textos = ES.resumen;
  protected readonly textosJuego = ES.juego;
  protected readonly textosJuegos = ES.juegos;
  protected readonly textosFiltros = ES.filtros;

  private readonly sesiones = cargaReactiva(() => {
    const id = this.juego.juegoId();
    return id ? this.api.obtener<DatosSesiones>(id, 'sesiones', this.juego.filtrosApi()) : null;
  });
  private readonly embudo = cargaReactiva(() => {
    const id = this.juego.juegoId();
    return id ? this.api.obtener<PasoEmbudo[]>(id, 'embudo', this.juego.filtrosApi()) : null;
  });

  protected readonly cargando = computed(
    () => this.sesiones.carga().estado === 'cargando' || this.embudo.carga().estado === 'cargando' || !this.juego.catalogo(),
  );
  protected readonly cargadoEn = computed(() => cargadoEnDe(this.sesiones.carga(), this.embudo.carga()));
  protected readonly conError = computed(() => this.sesiones.carga().estado === 'error' || this.embudo.carga().estado === 'error');

  private readonly datosSesiones = computed(() => {
    const c = this.sesiones.carga();
    return c.estado === 'listo' ? c.datos : null;
  });
  protected readonly pasos = computed(() => {
    const c = this.embudo.carga();
    return c.estado === 'listo' ? pasosVisibles(c.datos, this.juego.catalogo()) : [];
  });
  protected readonly sinDatos = computed(() => (this.datosSesiones()?.sesiones ?? 0) === 0 && (this.pasos()[0]?.jugadores ?? 0) === 0);
  protected readonly conFiltros = computed(() => hayFiltros(this.juego.filtros()));

  protected readonly kpis = computed(() => {
    const s = this.datosSesiones();
    const pasos = this.pasos();
    const ultimo = pasos.at(-1);
    const esperado = this.juego.catalogo()?.duracionEsperadaMs;
    return {
      jugadores: formatearEntero(s?.jugadores),
      sesiones: formatearEntero(s?.sesiones),
      inferidas: s && s.inferidas > 0 ? this.textos.inferidas(formatearEntero(s.inferidas)) : null,
      duracion: formatearDuracion(s?.medianaMs),
      esperado: esperado ? this.textos.esperado(formatearDuracion(esperado)) : null,
      terminaron: formatearPorcentaje(ultimo?.porcentaje),
      deJugadores: ultimo && pasos[0] ? this.textos.deJugadores(formatearEntero(ultimo.jugadores), formatearEntero(pasos[0].jugadores)) : null,
    };
  });

  protected readonly caida = computed(() => {
    const pasos = this.pasos();
    const c = mayorCaida(pasos);
    return c
      ? {
          desde: pasos[c.desde]!.etiqueta,
          hasta: pasos[c.hasta]!.etiqueta,
          porcentaje: formatearPorcentaje(c.porcentaje),
          detalle: this.textos.caidaDetalle(formatearEntero(c.jugadores)),
        }
      : null;
  });

  protected reintentar(): void {
    this.sesiones.reintentar();
    this.embudo.reintentar();
  }

  protected limpiarFiltros(): void {
    this.juego.aplicarFiltros(FILTROS_VACIOS);
  }
}
