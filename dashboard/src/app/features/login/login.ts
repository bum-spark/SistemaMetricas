import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EstadoApiService } from '../../core/api/estado-api.service';
import { SaludService } from '../../core/api/salud.service';
import { destinoSeguro } from '../../core/auth/auth.guard';
import { AuthService } from '../../core/auth/auth.service';
import { ES } from '../../i18n/es';
import { Badge, TonoBadge } from '../../shared/ui/badge/badge';
import { Boton } from '../../shared/ui/boton/boton';
import { Campo } from '../../shared/ui/campo/campo';
import { Marca } from '../../shared/ui/marca/marca';

// /login (DISENO_DASHBOARD.md §6): tarjeta de 400 px con marca, correo, contraseña y "Entrar".
// Error genérico ante credenciales incorrectas (no revela si falló el correo o la contraseña).
@Component({
  selector: 'xa-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Badge, Boton, Campo, Marca],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly estadoApi = inject(EstadoApiService);
  private readonly salud = inject(SaludService);
  // Chip "API: en línea / despertando" con GET /salud (también despierta a Render mientras se escribe).
  protected readonly chipSalud = computed(() => {
    const estado = this.salud.estado();
    const tonos: Record<typeof estado, TonoBadge> = { 'comprobando': 'neutro', 'en-linea': 'success', 'despertando': 'warning', 'sin-conexion': 'danger' };
    return { texto: ES.api.estado[estado], tono: tonos[estado] };
  });
  protected readonly textos = ES.login;
  protected readonly textosApi = ES.api;

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly enviando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly errorGeneral = signal<string | null>(
    this.ruta.snapshot.queryParamMap.get('motivo') === 'expirada' ? ES.login.sesionExpirada : null,
  );

  constructor() {
    this.salud.comprobar();
    inject(DestroyRef).onDestroy(() => this.salud.detener());
  }

  protected errorEmail(): string | null {
    const c = this.formulario.controls.email;
    if (!this.mostrarErrores(c.touched)) {
      return null;
    }
    if (c.hasError('required')) {
      return this.textos.emailObligatorio;
    }
    return c.hasError('email') ? this.textos.emailInvalido : null;
  }

  protected errorPassword(): string | null {
    const c = this.formulario.controls.password;
    return this.mostrarErrores(c.touched) && c.hasError('required') ? this.textos.passwordObligatoria : null;
  }

  protected entrar(): void {
    this.intentoEnviar.set(true);
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }
    const { email, password } = this.formulario.getRawValue();
    this.enviando.set(true);
    this.errorGeneral.set(null);
    this.auth.iniciarSesion(email.trim(), password).subscribe({
      next: () => {
        const destino = destinoSeguro(this.ruta.snapshot.queryParamMap.get('destino'));
        void this.router.navigateByUrl(destino);
      },
      error: (err: unknown) => {
        this.enviando.set(false);
        this.errorGeneral.set(mensajeDeError(err));
      },
    });
  }

  private mostrarErrores(tocado: boolean): boolean {
    return tocado || this.intentoEnviar();
  }
}

function mensajeDeError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return ES.login.errorInesperado;
  }
  switch (err.status) {
    case 0:
      return ES.login.sinConexion;
    case 400:
    case 401:
      return ES.login.credencialesIncorrectas;
    case 429:
      return ES.login.demasiadosIntentos;
    default:
      return ES.login.errorInesperado;
  }
}
