import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule, UserPlus, Users } from 'lucide-angular';
import { EstadoInvitado, InvitacionEmitida, Invitado } from '../../core/api/tipos';
import { InvitadosService } from '../../core/invitados/invitados.service';
import { JuegosService } from '../../core/juegos/juegos.service';
import { ES } from '../../i18n/es';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/formato';
import { Badge, TonoBadge } from '../../shared/ui/badge/badge';
import { Boton } from '../../shared/ui/boton/boton';
import { Cabecera } from '../../shared/ui/cabecera/cabecera';
import { Campo } from '../../shared/ui/campo/campo';
import { EstadoError, EstadoVacio, Skeleton } from '../../shared/ui/estado/estados';
import { LogoJuego } from '../../shared/ui/logo-juego/logo-juego';
import { Modal } from '../../shared/ui/modal/modal';
import { CeldaTabla, ColumnaTabla, Tabla } from '../../shared/ui/tabla/tabla';

type Modo = { tipo: 'invitar' } | { tipo: 'juegos'; invitado: Invitado } | { tipo: 'enlace'; emitida: InvitacionEmitida } | null;

const TONOS: Record<EstadoInvitado, TonoBadge> = { pendiente: 'warning', activo: 'success', desactivado: 'neutro' };

// /invitados (solo rol admin, S-67): tabla de invitados con estado, juegos y último acceso;
// invitar, restablecer el enlace, activar/desactivar y cambiar juegos. El enlace llega una sola
// vez y solo vive en memoria mientras el modal está abierto.
@Component({
  selector: 'xa-invitados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LucideAngularModule, Badge, Boton, Cabecera, Campo, EstadoError, EstadoVacio, Skeleton, LogoJuego, Modal, Tabla, CeldaTabla],
  templateUrl: './invitados.html',
  styleUrl: './invitados.css',
})
export class Invitados {
  private readonly servicio = inject(InvitadosService);
  protected readonly juegosServicio = inject(JuegosService);
  protected readonly textos = ES.invitados;
  protected readonly iconos = { invitar: UserPlus, vacio: Users };
  protected readonly fechaHora = formatearFechaHora;

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly invitados = signal<Invitado[]>([]);
  protected readonly cargadoEn = signal<Date | null>(null);
  protected readonly modo = signal<Modo>(null);
  protected readonly formularioAbierto = computed(() => this.modo()?.tipo === 'invitar' || this.modo()?.tipo === 'juegos');
  // Invitado cuyos juegos se editan (null al invitar a alguien nuevo).
  protected readonly editando = computed(() => {
    const m = this.modo();
    return m?.tipo === 'juegos' ? m.invitado : null;
  });
  // Enlace recién emitido: solo existe mientras su modal está abierto.
  protected readonly emitida = computed(() => {
    const m = this.modo();
    return m?.tipo === 'enlace' ? m.emitida : null;
  });
  protected readonly enCurso = signal<string | null>(null); // correo con una acción en curso
  protected readonly errorAccion = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly errorModal = signal<string | null>(null);
  protected readonly copiado = signal<'si' | 'error' | null>(null);

  // Juegos que este admin puede asignar: los suyos (GET /juegos).
  protected readonly misJuegos = this.juegosServicio.juegos;
  private readonly nombres = computed(() => new Map(this.misJuegos().map((j) => [j.juegoId, j.nombre])));

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    nombre: [''],
  });
  protected readonly seleccion = signal<ReadonlySet<string>>(new Set());
  protected readonly intentoEnviar = signal(false);

  protected readonly columnas: ColumnaTabla<Invitado>[] = [
    { clave: 'correo', titulo: ES.invitados.columnas.correo, ordenable: true, orden: (i) => i.email },
    { clave: 'estado', titulo: ES.invitados.columnas.estado, ordenable: true, orden: (i) => i.estado },
    { clave: 'juegos', titulo: ES.invitados.columnas.juegos },
    {
      clave: 'ultimoAcceso',
      titulo: ES.invitados.columnas.ultimoAcceso,
      ordenable: true,
      valor: (i) => (i.ultimoAcceso ? formatearFecha(i.ultimoAcceso) : ES.invitados.nunca),
      orden: (i) => i.ultimoAcceso,
    },
    { clave: 'acciones', titulo: ES.invitados.columnas.acciones },
  ];

  constructor() {
    this.juegosServicio.cargar().catch(() => undefined);
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.estado.set('cargando');
    try {
      this.invitados.set(await this.servicio.listar());
      this.cargadoEn.set(new Date());
      this.estado.set('listo');
    } catch {
      this.estado.set('error');
    }
  }

  protected tonoDe(invitado: Invitado): TonoBadge {
    return TONOS[invitado.estado];
  }

  protected estadoDe(invitado: Invitado): string {
    return ES.invitados.estado[invitado.estado];
  }

  // Nombres de los juegos que este admin conoce; los demás solo se cuentan.
  protected juegosDe(invitado: Invitado): { nombres: string[]; ajenos: number } {
    const nombres = invitado.juegos.map((id) => this.nombres().get(id)).filter((n): n is string => n !== undefined);
    return { nombres, ajenos: invitado.juegos.length - nombres.length };
  }

  // ---------- Modales ----------

  protected abrirInvitar(): void {
    this.formulario.reset({ email: '', nombre: '' });
    this.seleccion.set(new Set(this.misJuegos().length === 1 ? [this.misJuegos()[0]!.juegoId] : []));
    this.prepararModal();
    this.modo.set({ tipo: 'invitar' });
  }

  protected abrirJuegos(invitado: Invitado): void {
    this.seleccion.set(new Set(invitado.juegos.filter((id) => this.nombres().has(id))));
    this.prepararModal();
    this.modo.set({ tipo: 'juegos', invitado });
  }

  protected cerrarModal(): void {
    // Al cerrar, el enlace sale de la memoria de la página.
    this.modo.set(null);
    this.copiado.set(null);
  }

  private prepararModal(): void {
    this.intentoEnviar.set(false);
    this.errorModal.set(null);
    this.guardando.set(false);
  }

  protected alternarJuego(juegoId: string, marcado: boolean): void {
    const s = new Set(this.seleccion());
    if (marcado) {
      s.add(juegoId);
    } else {
      s.delete(juegoId);
    }
    this.seleccion.set(s);
  }

  protected errorEmail(): string | null {
    const c = this.formulario.controls.email;
    if (!(c.touched || this.intentoEnviar())) return null;
    if (c.hasError('required')) return this.textos.correoObligatorio;
    return c.hasError('email') ? this.textos.correoInvalido : null;
  }

  protected errorJuegos(): string | null {
    return this.intentoEnviar() && this.seleccion().size === 0 ? this.textos.juegosObligatorios : null;
  }

  protected async enviarInvitacion(): Promise<void> {
    this.intentoEnviar.set(true);
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.seleccion().size === 0 || this.guardando()) return;
    const { email, nombre } = this.formulario.getRawValue();
    this.guardando.set(true);
    this.errorModal.set(null);
    try {
      const emitida = await this.servicio.invitar({
        email: email.trim(),
        ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
        juegos: [...this.seleccion()],
      });
      this.mostrarEnlace(emitida);
    } catch (err) {
      this.errorModal.set(err instanceof HttpErrorResponse && err.status === 409 ? this.textos.correoRepetido : this.textos.errorAccion);
    } finally {
      this.guardando.set(false);
    }
  }

  protected enviarFormulario(): void {
    const invitado = this.editando();
    void (invitado ? this.guardarJuegos(invitado) : this.enviarInvitacion());
  }

  protected async guardarJuegos(invitado: Invitado): Promise<void> {
    this.intentoEnviar.set(true);
    if (this.seleccion().size === 0 || this.guardando()) return;
    this.guardando.set(true);
    try {
      this.reemplazar(await this.servicio.actualizar(invitado.email, { juegos: [...this.seleccion()] }));
      this.cerrarModal();
    } catch {
      this.errorModal.set(this.textos.errorAccion);
    } finally {
      this.guardando.set(false);
    }
  }

  // ---------- Acciones de la tabla ----------

  protected async restablecer(invitado: Invitado): Promise<void> {
    await this.accion(invitado, async () => {
      const emitida = await this.servicio.restablecer(invitado.email);
      this.reemplazar(emitida.invitado);
      this.mostrarEnlace(emitida, false);
    });
  }

  protected async cambiarActivo(invitado: Invitado): Promise<void> {
    await this.accion(invitado, async () => {
      this.reemplazar(await this.servicio.actualizar(invitado.email, { activo: invitado.estado === 'desactivado' }));
    });
  }

  private async accion(invitado: Invitado, hacer: () => Promise<void>): Promise<void> {
    if (this.enCurso()) return;
    this.enCurso.set(invitado.email);
    this.errorAccion.set(null);
    try {
      await hacer();
    } catch {
      this.errorAccion.set(this.textos.errorAccion);
    } finally {
      this.enCurso.set(null);
    }
  }

  private mostrarEnlace(emitida: InvitacionEmitida, recargar = true): void {
    this.copiado.set(null);
    this.modo.set({ tipo: 'enlace', emitida });
    if (recargar) {
      void this.cargar();
    }
  }

  private reemplazar(actualizado: Invitado): void {
    this.invitados.update((lista) => lista.map((i) => (i.email === actualizado.email ? actualizado : i)));
  }

  protected async copiar(enlace: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(enlace);
      this.copiado.set('si');
    } catch {
      this.copiado.set('error');
    }
  }

  protected seleccionarTodo(evento: Event): void {
    (evento.target as HTMLInputElement).select();
  }

  protected alMarcar(juegoId: string, evento: Event): void {
    this.alternarJuego(juegoId, (evento.target as HTMLInputElement).checked);
  }
}
