import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CONFIG } from '../../../core/config';
import { ES } from '../../../i18n/es';

// Logo del estudio (silueta clara) con APP_NAME (DISENO_DASHBOARD.md §3, "Marca").
// - 'login': logo de 64 px centrado, APP_NAME como título de sección y "Analytics".
// - 'sidebar': logo de 28 px + APP_NAME; 'icono': solo el logo (sidebar colapsada).
@Component({
  selector: 'xa-marca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"xa-marca xa-marca--" + variante()' },
  template: `
    <img
      class="xa-marca__logo"
      src="marca/estudio-xolos.png"
      srcset="marca/estudio-xolos.png 1x, marca/estudio-xolos@2x.png 2x"
      [attr.width]="lado()"
      [attr.height]="lado()"
      [alt]="variante() === 'icono' ? textos.logoEstudio(appName) : ''"
    />
    @if (variante() !== 'icono') {
      <div class="xa-marca__texto">
        <span class="xa-marca__nombre">{{ appName }}</span>
        @if (variante() === 'login') {
          <span class="xa-marca__producto">{{ textos.analytics }}</span>
        }
      </div>
    }
  `,
  styleUrl: './marca.css',
})
export class Marca {
  readonly variante = input<'login' | 'sidebar' | 'icono'>('sidebar');
  protected readonly appName = CONFIG.appName;
  protected readonly textos = ES.marca;

  // Debe coincidir con --logo-estudio-login / --logo-estudio-sidebar (atributos width/height).
  protected lado(): number {
    return this.variante() === 'login' ? 64 : 28;
  }
}
