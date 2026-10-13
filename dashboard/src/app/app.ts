import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { CONFIG } from './core/config';
import { ES } from './i18n/es';

@Component({
  selector: 'xa-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    // Título de la pestaña: "<APP_NAME> Analytics" (DISENO_DASHBOARD.md §3, "Marca").
    inject(Title).setTitle(`${CONFIG.appName} ${ES.marca.analytics}`);
  }
}
