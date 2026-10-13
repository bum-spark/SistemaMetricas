import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Admin, RespuestaLogin } from '../api/tipos';
import { CONFIG } from '../config';

interface Sesion {
  token: string;
  expiraEn: string;
  admin: Admin;
}

const CLAVE = 'xa.sesion';

// JWT en memoria; copia en sessionStorage solo para sobrevivir a recargas (DISENO_DASHBOARD.md §8).
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sesion = signal<Sesion | null>(leerGuardada());

  readonly admin = computed(() => this.sesion()?.admin ?? null);
  readonly token = computed(() => this.sesion()?.token ?? null);

  // Se consulta en cada navegación: un token vencido cuenta como sin sesión.
  estaAutenticado(ahora = Date.now()): boolean {
    const s = this.sesion();
    if (!s) {
      return false;
    }
    if (Date.parse(s.expiraEn) <= ahora) {
      this.cerrarSesion();
      return false;
    }
    return true;
  }

  iniciarSesion(email: string, password: string): Observable<RespuestaLogin> {
    return this.http.post<RespuestaLogin>(`${CONFIG.apiUrl}/auth/login`, { email, password }).pipe(
      tap((r) => {
        const sesion: Sesion = { token: r.token, expiraEn: r.expiraEn, admin: r.admin };
        this.sesion.set(sesion);
        guardar(sesion);
      }),
    );
  }

  cerrarSesion(): void {
    this.sesion.set(null);
    guardar(null);
  }
}

function leerGuardada(): Sesion | null {
  try {
    const texto = sessionStorage.getItem(CLAVE);
    if (!texto) {
      return null;
    }
    const s = JSON.parse(texto) as Partial<Sesion>;
    return typeof s.token === 'string' && typeof s.expiraEn === 'string' && s.admin ? (s as Sesion) : null;
  } catch {
    return null;
  }
}

function guardar(sesion: Sesion | null): void {
  try {
    if (sesion) {
      sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
    } else {
      sessionStorage.removeItem(CLAVE);
    }
  } catch {
    // Sin sessionStorage (modo privado estricto): la sesión vive solo en memoria.
  }
}
