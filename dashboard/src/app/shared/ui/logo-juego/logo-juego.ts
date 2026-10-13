import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { ES } from '../../../i18n/es';
import { inicial } from '../../formato/formato';

// Ruta del dashboard para logos servidos desde public/ (mismo patrón que valida la API).
const RUTA_LOGO_DASHBOARD = /^\/juegos\/[a-z0-9]+(?:-[a-z0-9]+)*\/logo\.png$/;

// Logo del juego en su recuadro --bg-3 (DISENO_DASHBOARD.md §3, "Marca"). Siempre sale de
// `logoUrl`; sin logo o si la imagen falla, muestra la inicial del nombre.
@Component({
  selector: 'xa-logo-juego',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"xa-logo-juego xa-logo-juego--" + tamano()' },
  template: `
    @if (logoUrl() && !fallo()) {
      <img
        [src]="logoUrl()"
        [attr.srcset]="srcset()"
        [attr.width]="lado()"
        [attr.height]="lado()"
        [alt]="decorativo() ? '' : alt()"
        (error)="fallo.set(true)"
      />
    } @else {
      <span class="xa-logo-juego__inicial" [attr.aria-hidden]="decorativo() ? 'true' : null" [attr.aria-label]="decorativo() ? null : alt()" [attr.role]="decorativo() ? null : 'img'">
        {{ letra() }}
      </span>
    }
  `,
  styleUrl: './logo-juego.css',
})
export class LogoJuego {
  readonly nombre = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly tamano = input<'tarjeta' | 'selector'>('tarjeta');
  // true cuando el nombre ya está escrito junto al logo (alt vacío para no repetirlo).
  readonly decorativo = input(false);

  // Se reinicia al cambiar de logo (el selector reutiliza el componente al cambiar de juego).
  protected readonly fallo = linkedSignal({ source: this.logoUrl, computation: () => false });
  protected readonly alt = computed(() => ES.marca.logoJuego(this.nombre()));
  protected readonly letra = computed(() => inicial(this.nombre()));
  // Imagen de 40 px en la tarjeta y 20 px en el selector (recuadro menos padding).
  protected readonly lado = computed(() => (this.tamano() === 'tarjeta' ? 40 : 20));
  protected readonly srcset = computed(() => {
    const url = this.logoUrl();
    return url && RUTA_LOGO_DASHBOARD.test(url) ? `${url} 1x, ${url.replace(/\.png$/, '@2x.png')} 2x` : null;
  });
}
