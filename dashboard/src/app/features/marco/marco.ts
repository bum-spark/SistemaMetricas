import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Funnel, LayoutDashboard, LogOut, LucideAngularModule, LucideIconData, Menu, X } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { JuegosService } from '../../core/juegos/juegos.service';
import { ES } from '../../i18n/es';
import { Marca } from '../../shared/ui/marca/marca';
import { SelectorJuego } from './selector-juego';

interface Seccion {
  ruta: string;
  etiqueta: string;
  icono: LucideIconData;
}

// Secciones de un juego, en el orden de DISENO_DASHBOARD.md §3. La ruta es relativa a
// /juegos/:slug. Solo se listan las pantallas ya construidas: cada una se agrega aquí (en su
// lugar del orden) en el mismo commit que la construye, para no enlazar vistas vacías.
// Pendientes: Niveles, Muertes, Logros y exploración.
const SECCIONES: readonly Seccion[] = [
  { ruta: '', etiqueta: ES.marco.secciones.resumen, icono: LayoutDashboard },
  { ruta: 'progresion', etiqueta: ES.marco.secciones.progresion, icono: Funnel },
];

// Slug del juego en la URL actual (/juegos/:slug/...), o null en /juegos.
export function slugDeUrl(url: string): string | null {
  const [, primero, segundo] = url.split(/[?#]/)[0]!.split('/');
  return primero === 'juegos' && segundo ? decodeURIComponent(segundo) : null;
}

// Marco de las vistas autenticadas (DISENO_DASHBOARD.md §3): sidebar de 232 px (64 px abajo de
// 1024, menú hamburguesa abajo de 768) y barra superior de 56 px con el selector de juego.
@Component({
  selector: 'xa-marco',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, Marca, SelectorJuego],
  templateUrl: './marco.html',
  styleUrl: './marco.css',
})
export class Marco {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly juegos = inject(JuegosService);
  protected readonly textos = ES.marco;
  protected readonly textosMarca = ES.marca;
  protected readonly secciones = SECCIONES;
  protected readonly iconos = { menu: Menu, cerrar: X, salir: LogOut };
  protected readonly admin = this.auth.admin;
  protected readonly menuAbierto = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly slug = computed(() => slugDeUrl(this.url()));
  // Las secciones solo se muestran para un juego que existe en la lista del admin.
  protected readonly slugValido = computed(() => (this.juegos.porSlug(this.slug()) ? this.slug() : null));

  constructor() {
    // El selector y la traducción slug → juegoId usan la lista; un error se muestra en /juegos.
    this.juegos.cargar().catch(() => undefined);
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menuAbierto.set(false));
  }

  protected rutaSeccion(seccion: Seccion): string[] {
    const slug = this.slugValido()!;
    return seccion.ruta ? ['/juegos', slug, seccion.ruta] : ['/juegos', slug];
  }

  protected salir(): void {
    this.auth.cerrarSesion();
    this.juegos.limpiar();
    void this.router.navigateByUrl('/login');
  }
}
