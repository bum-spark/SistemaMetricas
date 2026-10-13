import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { CONFIG } from '../config';
import { FiltrosApi, RespuestaEstadistica } from './tipos';

// Cliente de /estadisticas/:juegoId/<endpoint> (ESQUEMA_EVENTOS.md §7.2 y §10).
@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private readonly http = inject(HttpClient);

  obtener<T>(juegoId: string, endpoint: string, filtros: FiltrosApi, extra: Record<string, string | number> = {}): Observable<T> {
    const params: Record<string, string | number> = { ...extra };
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor) {
        params[clave] = valor as string;
      }
    }
    return this.http
      .get<RespuestaEstadistica<T>>(`${CONFIG.apiUrl}/estadisticas/${encodeURIComponent(juegoId)}/${endpoint}`, { params })
      .pipe(map((r) => r.datos));
  }
}
