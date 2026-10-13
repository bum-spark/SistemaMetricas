import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type TonoBadge = 'success' | 'warning' | 'danger' | 'petal' | 'neutro';

// Badge / chip (DISENO_DASHBOARD.md §4): fondo -soft del color y texto del color pleno.
@Component({
  selector: 'xa-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"xa-badge xa-badge--" + tono()' },
  template: '<ng-content />',
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      height: var(--badge-alto);
      padding: 0 var(--space-2);
      border-radius: var(--radius-full);
      font-size: var(--fs-etiqueta);
      line-height: var(--lh-etiqueta);
      font-weight: var(--fw-medium);
      white-space: nowrap;
    }
    :host(.xa-badge--success) { background: var(--success-soft); color: var(--success); }
    :host(.xa-badge--warning) { background: var(--warning-soft); color: var(--warning); }
    :host(.xa-badge--danger) { background: var(--danger-soft); color: var(--danger); }
    :host(.xa-badge--petal) { background: var(--petal-soft); color: var(--petal); }
    :host(.xa-badge--neutro) { background: var(--bg-3); color: var(--text-2); }
  `,
})
export class Badge {
  readonly tono = input<TonoBadge>('neutro');
}
