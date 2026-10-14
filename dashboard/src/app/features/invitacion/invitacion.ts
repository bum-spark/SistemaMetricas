import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Check, LucideAngularModule, X } from 'lucide-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { InvitacionValida } from '../../core/api/tipos';
import { InvitadosService } from '../../core/invitados/invitados.service';
import { ES } from '../../i18n/es';
import { formatearFechaHora } from '../../shared/formato/formato';
import { Boton } from '../../shared/ui/boton/boton';
import { Campo } from '../../shared/ui/campo/campo';
import { Marca } from '../../shared/ui/marca/marca';
import { Skeleton } from '../../shared/ui/estado/estados';

// Igual que la API (S-33): mínimo 12 caracteres.
export const LONGITUD_MINIMA_PASSWORD = 12;

type Estado = 'validando' | 'formulario' | 'invalido' | 'listo';

// Lee el token del fragmento (#token=…); la pantalla lo borra de la URL en el acto con
// history.replaceState: así no queda en el historial, en marcadores ni en capturas. El
// fragmento no viaja al servidor, ni en peticiones ni en el Referer.
export function tokenDelFragmento(hash: string): string | null {
  const valor = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return valor && valor.length > 0 ? valor : null;
}

// /invitacion (pública, S-67): el invitado crea su contraseña con el enlace de un solo uso.
// Tarjeta sobria como la del login, sin el fondo animado (esa excepción es solo del login).
@Component({
  selector: 'xa-invitacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule, Boton, Campo, Marca, Skeleton],
  templateUrl: './invitacion.html',
  styleUrl: './invitacion.css',
})
export class Invitacion {
  private readonly servicio = inject(InvitadosService);
  protected readonly textos = ES.invitacion;
  protected readonly iconos = { cumple: Check, noCumple: X };
  protected readonly minimo = LONGITUD_MINIMA_PASSWORD;

  // El token solo vive en memoria de esta pantalla.
  private readonly token: string | null;
  protected readonly estado = signal<Estado>('validando');
  protected readonly invitacion = signal<InvitacionValida | null>(null);
  protected readonly motivoInvalido = signal<string>(ES.invitacion.invalidoAyuda);
  protected readonly enviando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly errorGeneral = signal<string | null>(null);

  protected readonly formulario = inject(FormBuilder).nonNullable.group({ password: [''], confirmacion: [''] });
  private readonly valores = toSignal(this.formulario.valueChanges, { initialValue: this.formulario.getRawValue() });
  protected readonly reglas = computed(() => {
    const { password = '', confirmacion = '' } = this.valores();
    return {
      longitud: password.length >= LONGITUD_MINIMA_PASSWORD,
      coinciden: password.length > 0 && password === confirmacion,
    };
  });
  protected readonly vence = computed(() => {
    const i = this.invitacion();
    return i ? formatearFechaHora(i.expiraEn) : null;
  });

  constructor() {
    this.token = tokenDelFragmento(window.location.hash);
    // Borra el fragmento de la barra de direcciones y del historial (conserva el estado del router).
    if (window.location.hash) {
      history.replaceState(history.state, '', window.location.pathname + window.location.search);
    }
    if (!this.token) {
      this.motivoInvalido.set(ES.invitacion.sinToken);
      this.estado.set('invalido');
      return;
    }
    void this.validar(this.token);
  }

  private async validar(token: string): Promise<void> {
    try {
      this.invitacion.set(await this.servicio.validar(token));
      this.estado.set('formulario');
    } catch (err) {
      this.mostrarInvalido(err);
    }
  }

  protected async crear(): Promise<void> {
    this.intentoEnviar.set(true);
    const r = this.reglas();
    if (!r.longitud || !r.coinciden || this.enviando() || !this.token) return;
    this.enviando.set(true);
    this.errorGeneral.set(null);
    try {
      await this.servicio.aceptar(this.token, this.formulario.getRawValue().password);
      this.formulario.reset();
      this.estado.set('listo');
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 400 && (err.error as { error?: { codigo?: string } })?.error?.codigo === 'INVITACION_INVALIDA') {
        this.mostrarInvalido(err);
      } else {
        this.errorGeneral.set(err instanceof HttpErrorResponse && err.status === 429 ? ES.invitacion.demasiadosIntentos : ES.invitacion.errorInesperado);
      }
    } finally {
      this.enviando.set(false);
    }
  }

  private mostrarInvalido(err: unknown): void {
    this.motivoInvalido.set(err instanceof HttpErrorResponse && err.status === 429 ? ES.invitacion.demasiadosIntentos : ES.invitacion.invalidoAyuda);
    this.estado.set('invalido');
  }
}
