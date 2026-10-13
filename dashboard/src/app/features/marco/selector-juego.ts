import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Check, ChevronDown, LucideAngularModule } from 'lucide-angular';
import { JuegosService } from '../../core/juegos/juegos.service';
import { ES } from '../../i18n/es';
import { LogoJuego } from '../../shared/ui/logo-juego/logo-juego';

// Selector de juego de la barra superior (DISENO_DASHBOARD.md §3): logo del juego (desde
// logoUrl) + nombre; abre una lista con los juegos permitidos. Escape o clic fuera la cierra.
@Component({
  selector: 'xa-selector-juego',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, LogoJuego],
  host: {
    '(document:click)': 'alClicFuera($event)',
    '(keydown.escape)': 'cerrar(true)',
  },
  template: `
    <button
      #disparador
      type="button"
      class="disparador"
      aria-haspopup="true"
      [attr.aria-expanded]="abierto()"
      aria-controls="selector-juego-lista"
      [attr.aria-label]="actual() ? textos.cambiar(actual()!.nombre) : textos.elegir"
      (click)="abierto.set(!abierto())"
    >
      @if (actual(); as juego) {
        <xa-logo-juego [nombre]="juego.nombre" [logoUrl]="juego.logoUrl" tamano="selector" [decorativo]="true" />
        <span class="nombre">{{ juego.nombre }}</span>
      } @else {
        <span class="nombre nombre--vacio">{{ textos.elegir }}</span>
      }
      <lucide-icon [img]="iconoAbrir" [size]="16" [strokeWidth]="1.75" aria-hidden="true" />
    </button>

    @if (abierto()) {
      <ul id="selector-juego-lista" class="lista">
        @for (juego of juegos.juegos(); track juego.juegoId) {
          <li>
            <a
              class="opcion"
              [routerLink]="['/juegos', juego.slug]"
              [attr.aria-current]="juego.slug === slug() ? 'page' : null"
              (click)="cerrar(false)"
            >
              <xa-logo-juego [nombre]="juego.nombre" [logoUrl]="juego.logoUrl" tamano="selector" [decorativo]="true" />
              <span class="nombre">{{ juego.nombre }}</span>
              @if (juego.slug === slug()) {
                <lucide-icon [img]="iconoActual" [size]="16" [strokeWidth]="1.75" aria-hidden="true" />
              }
            </a>
          </li>
        }
        <li class="separador" role="separator"></li>
        <li>
          <a class="opcion opcion--todos" routerLink="/juegos" (click)="cerrar(false)">{{ textos.todos }}</a>
        </li>
      </ul>
    }
  `,
  styleUrl: './selector-juego.css',
})
export class SelectorJuego {
  readonly slug = input<string | null>(null);
  protected readonly juegos = inject(JuegosService);
  protected readonly textos = ES.selector;
  protected readonly iconoAbrir = ChevronDown;
  protected readonly iconoActual = Check;
  protected readonly abierto = signal(false);
  protected readonly actual = computed(() => this.juegos.porSlug(this.slug()));
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly disparador = viewChild.required<ElementRef<HTMLButtonElement>>('disparador');

  protected cerrar(devolverFoco: boolean): void {
    if (!this.abierto()) {
      return;
    }
    this.abierto.set(false);
    if (devolverFoco) {
      this.disparador().nativeElement.focus();
    }
  }

  protected alClicFuera(evento: Event): void {
    if (this.abierto() && !(this.host.nativeElement as HTMLElement).contains(evento.target as Node)) {
      this.abierto.set(false);
    }
  }
}
