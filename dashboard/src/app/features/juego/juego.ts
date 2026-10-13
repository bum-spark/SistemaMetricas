import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ES } from '../../i18n/es';
import { EstadoError, EstadoVacio, Skeleton } from '../../shared/ui/estado/estados';
import { BarraFiltros } from './barra-filtros';
import { JuegoActualService } from './juego-actual.service';

// /juegos/:slug/... : traduce el slug con la lista de juegos (slug inexistente → vista de
// error, DISENO_DASHBOARD.md §6), carga el catálogo y muestra la barra de filtros sobre la vista.
@Component({
  selector: 'xa-juego',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, BarraFiltros, EstadoError, EstadoVacio, Skeleton],
  providers: [JuegoActualService],
  template: `
    @if (juego.resolviendo()) {
      <xa-skeleton class="esqueleto" />
    } @else if (juego.listaFallo()) {
      <xa-estado-error (reintentar)="juego.reintentarLista()" />
    } @else if (juego.noEncontrado()) {
      <xa-estado-vacio [titulo]="textos.noEncontradoTitulo" [ayuda]="textos.noEncontradoAyuda">
        <a routerLink="/juegos" class="volver">{{ textos.volver }}</a>
      </xa-estado-vacio>
    } @else {
      <xa-barra-filtros />
      @if (juego.detalle().estado === 'error') {
        <xa-estado-error [titulo]="textos.errorDetalle" (reintentar)="juego.reintentarDetalle()" />
      } @else {
        <router-outlet />
      }
    }
  `,
  styles: `
    :host { display: block; }
    .esqueleto { height: var(--space-8); }
    .volver {
      margin-top: var(--space-2);
      color: var(--petal);
      font-weight: var(--fw-medium);
    }
  `,
})
export class Juego {
  protected readonly juego = inject(JuegoActualService);
  protected readonly textos = ES.juego;
}
