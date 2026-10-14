import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { InvitacionEmitida, InvitacionValida, Invitado, ListaInvitados } from '../api/tipos';
import { CONFIG } from '../config';

// Máximo que acepta GET /invitados por página; el estudio invita a pocas personas.
const LIMITE = 100;

// Invitados (ESQUEMA_EVENTOS.md §7.3, S-67). Las rutas de /invitados son solo para admins;
// validar y aceptar son públicas (pantalla /invitacion). El enlace que devuelven invitar y
// restablecer se muestra una sola vez y no se guarda en ningún lado.
@Injectable({ providedIn: 'root' })
export class InvitadosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${CONFIG.apiUrl}/invitados`;

  listar(): Promise<Invitado[]> {
    return firstValueFrom(this.http.get<ListaInvitados>(this.base, { params: { limite: LIMITE } })).then((r) => r.datos);
  }

  invitar(datos: { email: string; nombre?: string; juegos: string[] }): Promise<InvitacionEmitida> {
    return firstValueFrom(this.http.post<InvitacionEmitida>(this.base, datos));
  }

  actualizar(email: string, cambios: { juegos?: string[]; activo?: boolean }): Promise<Invitado> {
    return firstValueFrom(this.http.patch<Invitado>(`${this.base}/${encodeURIComponent(email)}`, cambios));
  }

  restablecer(email: string): Promise<InvitacionEmitida> {
    return firstValueFrom(this.http.post<InvitacionEmitida>(`${this.base}/${encodeURIComponent(email)}/restablecer`, {}));
  }

  // El token va en un header, no en la URL (no queda en logs ni en el historial).
  validar(token: string): Promise<InvitacionValida> {
    return firstValueFrom(
      this.http.get<InvitacionValida>(`${CONFIG.apiUrl}/auth/invitacion/validar`, { headers: { 'X-Invitacion-Token': token } }),
    );
  }

  aceptar(token: string, password: string): Promise<{ email: string }> {
    return firstValueFrom(this.http.post<{ email: string }>(`${CONFIG.apiUrl}/auth/invitacion/aceptar`, { token, password }));
  }
}
