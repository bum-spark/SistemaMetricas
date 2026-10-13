import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { CONFIG } from '../config';
import { EstadoApiService } from './estado-api.service';

// Si una petición a la API tarda más de 8 s, se avisa que el servidor se está despertando.
export const apiLentaInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(CONFIG.apiUrl)) {
    return next(req);
  }
  const estado = inject(EstadoApiService);
  let lenta = false;
  const temporizador = setTimeout(() => {
    lenta = true;
    estado.marcarLenta();
  }, CONFIG.msAvisoApiDormida);
  return next(req).pipe(
    finalize(() => {
      clearTimeout(temporizador);
      if (lenta) {
        estado.terminarLenta();
      }
    }),
  );
};
