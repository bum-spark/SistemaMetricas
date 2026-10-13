import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Rutas del dashboard: sin sesión válida → login, conservando a dónde quería ir.
export const authGuard: CanActivateFn = (_ruta, estado) => {
  const auth = inject(AuthService);
  if (auth.estaAutenticado()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login'], { queryParams: { destino: estado.url } });
};

// /login: con sesión válida no tiene caso mostrarlo.
export const soloInvitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.estaAutenticado() ? inject(Router).createUrlTree(['/juegos']) : true;
};

// Solo se aceptan destinos internos (evita redirecciones abiertas con ?destino=https://…).
export function destinoSeguro(destino: string | null | undefined): string {
  return destino?.startsWith('/') && !destino.startsWith('//') && !destino.startsWith('/login') ? destino : '/juegos';
}
