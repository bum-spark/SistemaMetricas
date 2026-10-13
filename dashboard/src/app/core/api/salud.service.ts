import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { CONFIG } from '../config';

export type EstadoSalud = 'comprobando' | 'en-linea' | 'despertando' | 'sin-conexion';

// Ping a GET /salud para el chip del login. Un ping al cargar; si la API no responde en 5 s
// (o responde con error mientras Render la arranca) queda "despertando" y se reintenta cada
// 5 s hasta ~90 s. Nunca hay polling permanente: al terminar o al destruir la vista, se detiene.
@Injectable({ providedIn: 'root' })
export class SaludService {
  static readonly ESPERA_MS = 5000;
  static readonly MAXIMO_MS = 90_000;

  private readonly http = inject(HttpClient);
  private readonly estadoInterno = signal<EstadoSalud>('comprobando');
  readonly estado = this.estadoInterno.asReadonly();
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private generacion = 0;

  comprobar(): void {
    this.detener();
    const generacion = ++this.generacion;
    const inicio = Date.now();
    this.estadoInterno.set('comprobando');
    const intentar = async (): Promise<void> => {
      try {
        await firstValueFrom(this.http.get(`${CONFIG.apiUrl}/salud`).pipe(timeout(SaludService.ESPERA_MS)));
        if (generacion === this.generacion) {
          this.estadoInterno.set('en-linea');
        }
      } catch {
        if (generacion !== this.generacion) {
          return;
        }
        if (Date.now() - inicio + SaludService.ESPERA_MS > SaludService.MAXIMO_MS) {
          this.estadoInterno.set('sin-conexion');
          return;
        }
        this.estadoInterno.set('despertando');
        this.temporizador = setTimeout(() => void intentar(), SaludService.ESPERA_MS);
      }
    };
    void intentar();
  }

  detener(): void {
    this.generacion++;
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }
}
