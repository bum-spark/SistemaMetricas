import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { CONFIG } from '../config';
import { AuthService } from './auth.service';

// Agrega el JWT a las peticiones a la API; ante un 401 cierra la sesión y manda a login
// conservando la URL de destino (DISENO_DASHBOARD.md §6 y §8). El 401 del propio login
// (credenciales incorrectas) lo maneja la pantalla de login.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(CONFIG.apiUrl)) {
    return next(req);
  }
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const esLogin = req.url === `${CONFIG.apiUrl}/auth/login`;
  const conToken = token && !esLogin ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(conToken).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !esLogin) {
        auth.cerrarSesion();
        void router.navigate(['/login'], { queryParams: { destino: router.url, motivo: 'expirada' } });
      }
      return throwError(() => err);
    }),
  );
};
