import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JuegosService } from '../../core/juegos/juegos.service';
import { ES } from '../../i18n/es';
import { formatearEntero, formatearFraccion } from '../../shared/formato/formato';
import { Badge } from '../../shared/ui/badge/badge';
import { Cabecera } from '../../shared/ui/cabecera/cabecera';
import { EstadoError, EstadoVacio, Skeleton } from '../../shared/ui/estado/estados';
import { LogoJuego } from '../../shared/ui/logo-juego/logo-juego';

// /juegos (DISENO_DASHBOARD.md §6): una tarjeta por juego con logo, nombre, versión, estado y
// 3 mini-KPIs (jugadores, sesiones, % completado). Todo sale de GET /juegos.
@Component({
  selector: 'xa-juegos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Badge, Cabecera, LogoJuego, Skeleton, EstadoVacio, EstadoError],
  templateUrl: './juegos.html',
  styleUrl: './juegos.css',
})
export class Juegos {
  protected readonly servicio = inject(JuegosService);
  protected readonly textos = ES.juegos;
  protected readonly entero = formatearEntero;
  protected readonly fraccion = formatearFraccion;
  protected readonly esqueletos = [1, 2, 3];

  constructor() {
    this.servicio.cargar().catch(() => undefined);
  }

  protected reintentar(): void {
    this.servicio.cargar(true).catch(() => undefined);
  }
}
