import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

// Campo con etiqueta arriba y error debajo (DISENO_DASHBOARD.md §4, "Inputs y selects").
// El <input> o <select> se proyecta y debe llevar el mismo id que `para`, y
// aria-describedby="<para>-error" cuando hay error.
@Component({
  selector: 'xa-campo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'xa-campo', '[class.xa-campo--error]': '!!error()' },
  template: `
    <label class="xa-campo__etiqueta" [attr.for]="para()">{{ etiqueta() }}</label>
    <ng-content />
    @if (error()) {
      <p class="xa-campo__error" [id]="para() + '-error'">{{ error() }}</p>
    }
  `,
  styleUrl: './campo.css',
})
export class Campo {
  readonly etiqueta = input.required<string>();
  readonly para = input.required<string>();
  readonly error = input<string | null>(null);
}
