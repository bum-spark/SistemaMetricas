import type { Catalogo } from '../dominio/catalogo';
import type { Plataforma, TipoEvento } from '../dominio/constantes';
import { Aleatorio, hashTexto } from './aleatorio';
import {
  AJUSTE_COMPLETAR_BUILD,
  BUILDS,
  FACTOR_MUERTE_BUILD_NUEVA,
  FPS_POR_PLATAFORMA,
  PLATAFORMAS_PESOS,
  type PerfilJuego,
  type PerfilNivel,
  type ZonaMuerte,
} from './perfiles';

// Generador de datos de prueba (seed-datos). Función pura y determinista: no toca la base
// y con la misma semilla y la misma fecha de referencia produce exactamente los mismos
// documentos. Los eventos tienen los mismos tipos y campos que acepta la ingesta
// (incluidos eventoId y secuencia); todo lleva origen "seed".

export const DIAS_DE_DATOS = 14;
const DIA_MS = 24 * 60 * 60 * 1000;
const SEG = 1000;

export interface EntradaGenerador {
  juegoId: string;
  catalogo: Catalogo;
  perfil: PerfilJuego;
  semilla: number;
  // Fin (exclusivo) del rango de fechas; los datos cubren los DIAS_DE_DATOS anteriores.
  referencia: Date;
  jugadores?: number;
}

export interface JugadorSeed {
  juegoId: string;
  playerId: string;
  consentimiento: true;
  cuentaId: null;
  primeraVez: Date;
  ultimaVez: Date;
  origen: 'seed';
}

export interface SesionSeed {
  sessionId: string;
  juegoId: string;
  playerId: string;
  buildVersion: string;
  plataforma: Plataforma;
  creadaEn: Date;
  inicio: Date;
  fin: Date | null;
  ultimoEventoEn: Date;
  ultimoRecibidoEn: Date;
  origen: 'seed';
}

export interface EventoSeed {
  eventoId: string;
  juegoId: string;
  playerId: string;
  sessionId: string;
  secuencia: number;
  timestamp: Date;
  buildVersion: string;
  plataforma: Plataforma;
  tipo: TipoEvento;
  data: Record<string, unknown>;
  versionEsquema: 1;
  recibidoEn: Date;
  origen: 'seed';
}

export interface LogroSeed {
  juegoId: string;
  playerId: string;
  logroId: string;
  sessionId: string;
  obtenidoEn: Date;
}

export interface DatosSeed {
  jugadores: JugadorSeed[];
  sesiones: SesionSeed[];
  eventos: EventoSeed[];
  logros: LogroSeed[];
}

type Resultado = 'muerte' | 'completado' | 'abandono';

interface Paso {
  nivel: PerfilNivel;
  resultado: Resultado;
  // Después de completar este nivel el jugador cierra el juego (abandono "entre niveles").
  cierraDespues: boolean;
}

// Hora local de juego: más jugadores por la tarde y la noche.
const PESOS_HORA = Array.from({ length: 24 }, (_, h) => ({ valor: h, peso: h < 7 ? 1 : h < 12 ? 3 : h < 17 ? 5 : h < 23 ? 9 : 4 }));

const ERRORES_FATALES = [
  { codigo: 'NULL_REF', mensaje: 'NullReferenceException en el controlador del jugador' },
  { codigo: 'OOM', mensaje: 'Memoria insuficiente al cargar texturas' },
  { codigo: 'GPU_LOST', mensaje: 'Se perdió el dispositivo gráfico' },
];

const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const redondear = (v: number) => Math.round(v * 100) / 100;

class Simulacion {
  readonly datos: DatosSeed = { jugadores: [], sesiones: [], eventos: [], logros: [] };
  private readonly r: Aleatorio;
  private readonly inicioRango: number;
  private readonly finRango: number;

  constructor(private readonly e: EntradaGenerador) {
    this.r = new Aleatorio(hashTexto(`${e.semilla}:${e.perfil.slug}`));
    this.finRango = e.referencia.getTime();
    this.inicioRango = this.finRango - DIAS_DE_DATOS * DIA_MS;
  }

  ejecutar(): DatosSeed {
    const total = this.e.jugadores ?? this.e.perfil.jugadoresPorDefecto;
    for (let i = 0; i < total; i++) {
      this.jugador();
    }
    return this.datos;
  }

  // ---------- Plan de un jugador (qué tan lejos llega) ----------

  private plan(build: string): Paso[] {
    const { niveles, probSeguirTrasCompletar } = this.e.perfil;
    const nueva = build === BUILDS.nueva;
    const pasos: Paso[] = [];
    for (let k = 0; k < niveles.length; k++) {
      const nivel = niveles[k]!;
      const probMuerte = nivel.probMuerte * (nueva ? FACTOR_MUERTE_BUILD_NUEVA : 1);
      const probCompletar = acotar(nivel.probCompletar + (nueva ? AJUSTE_COMPLETAR_BUILD : -AJUSTE_COMPLETAR_BUILD), 0.05, 0.97);
      const completa = this.r.probabilidad(probCompletar);
      // Muertes antes de completar (o antes de rendirse).
      const muertes = completa ? this.r.geometrica(probMuerte, 10) : 1 + this.r.geometrica(0.5, 6);
      for (let m = 0; m < muertes; m++) {
        pasos.push({ nivel, resultado: 'muerte', cierraDespues: false });
      }
      if (!completa) {
        pasos.push({ nivel, resultado: 'abandono', cierraDespues: true });
        return pasos;
      }
      const ultimo = k === niveles.length - 1;
      const sigue = !ultimo && this.r.probabilidad(probSeguirTrasCompletar);
      pasos.push({ nivel, resultado: 'completado', cierraDespues: !sigue });
      if (!sigue) {
        return pasos;
      }
    }
    return pasos;
  }

  // ---------- Jugador y sesiones ----------

  private inicioDeJugador(): number {
    // Día uniforme en el rango y hora con forma de "tarde-noche"; nunca a menos de 3 h del final.
    for (;;) {
      const dia = this.r.entero(0, DIAS_DE_DATOS - 1);
      const hora = this.r.ponderado(PESOS_HORA);
      const t = this.inicioRango + dia * DIA_MS + hora * 3600 * SEG + this.r.entero(0, 3599) * SEG;
      if (t < this.finRango - 3 * 3600 * SEG) {
        return t;
      }
    }
  }

  private jugador(): void {
    const playerId = this.r.uuid();
    const inicio = this.inicioDeJugador();
    // Primera semana mayormente 1.0.0; segunda semana mayormente 1.0.1.
    const segundaSemana = inicio - this.inicioRango >= (DIAS_DE_DATOS / 2) * DIA_MS;
    const build = this.r.probabilidad(0.9) === segundaSemana ? BUILDS.nueva : BUILDS.vieja;
    const plataforma = this.r.ponderado(PLATAFORMAS_PESOS);
    const pasos = this.plan(build);

    // ¿La primera sesión termina en crash? ¿En qué paso? ¿Vuelve a abrir el juego?
    const crashEn = this.r.probabilidad(this.e.perfil.probCrash) ? this.r.entero(0, pasos.length - 1) : -1;
    const vuelve = crashEn >= 0 && this.r.probabilidad(0.75);

    const estado = { logros: new Set<string>(), coleccionables: new Set<string>(), tutorialHecho: false };
    const jugador: JugadorSeed = {
      juegoId: this.e.juegoId,
      playerId,
      consentimiento: true,
      cuentaId: null,
      primeraVez: new Date(0),
      ultimaVez: new Date(0),
      origen: 'seed',
    };

    const primera = this.sesion({ playerId, build, plataforma, inicio, pasos, desde: 0, crashEn, estado });
    jugador.primeraVez = primera.creadaEn;
    jugador.ultimaVez = primera.ultimoRecibidoEn;
    if (vuelve) {
      // Reabre el juego unos minutos después y retoma en el nivel donde se cerró.
      const reinicio = primera.ultimoEventoEn.getTime() + this.r.entero(1, 12) * 60 * SEG;
      const segunda = this.sesion({ playerId, build, plataforma, inicio: reinicio, pasos, desde: crashEn, crashEn: -1, estado });
      jugador.ultimaVez = segunda.ultimoRecibidoEn;
    }
    this.datos.jugadores.push(jugador);
  }

  private sesion(p: {
    playerId: string;
    build: string;
    plataforma: Plataforma;
    inicio: number;
    pasos: Paso[];
    desde: number;
    crashEn: number;
    estado: { logros: Set<string>; coleccionables: Set<string>; tutorialHecho: boolean };
  }): SesionSeed {
    const sessionId = this.r.uuid();
    let t = p.inicio;
    let secuencia = 0;
    const intentos = new Map<string, number>();
    const eventos: EventoSeed[] = [];

    const emitir = (tipo: TipoEvento, data: Record<string, unknown> = {}) => {
      const timestamp = new Date(Math.round(t));
      eventos.push({
        eventoId: this.r.uuid(),
        juegoId: this.e.juegoId,
        playerId: p.playerId,
        sessionId,
        secuencia: ++secuencia,
        timestamp,
        buildVersion: p.build,
        plataforma: p.plataforma,
        tipo,
        data,
        versionEsquema: 1,
        recibidoEn: new Date(timestamp.getTime() + this.r.entero(150, 2500)),
        origen: 'seed',
      });
    };
    const logro = (logroId: string | undefined) => {
      if (logroId && !p.estado.logros.has(logroId)) {
        p.estado.logros.add(logroId);
        emitir('logro', { logroId });
        this.datos.logros.push({ juegoId: this.e.juegoId, playerId: p.playerId, logroId, sessionId, obtenidoEn: new Date(Math.round(t)) });
      }
    };

    emitir('sesion_inicio');
    t += this.r.entero(2, 6) * SEG;

    let terminoConFin = false;
    let nivelAnterior: string | undefined;
    for (let i = p.desde; i < p.pasos.length; i++) {
      const paso = p.pasos[i]!;
      const { nivel } = paso;
      const nivelId = nivel.nivelId;
      if (nivelAnterior !== undefined && nivelAnterior !== nivelId) {
        t += this.r.entero(3, 15) * SEG; // carga del siguiente nivel
      }
      nivelAnterior = nivelId;
      const intento = (intentos.get(nivelId) ?? 0) + 1;
      intentos.set(nivelId, intento);
      emitir('nivel_inicio', { nivelId, intento });
      const inicioIntento = t;

      const duracion =
        paso.resultado === 'completado'
          ? this.r.lognormal(nivel.medianaCompletadoMs, nivel.sigma)
          : paso.resultado === 'muerte'
            ? this.r.lognormal(nivel.medianaCompletadoMs * 0.35, 0.55)
            : this.r.lognormal(nivel.medianaCompletadoMs * 0.45, 0.6);
      const duracionMs = Math.max(8 * SEG, Math.round(duracion));

      // Tutorial (solo la primera vez que el jugador juega el nivel con tutorial).
      const tutorial = this.e.perfil.tutorial;
      if (tutorial && tutorial.nivelId === nivelId && !p.estado.tutorialHecho && intento === 1) {
        p.estado.tutorialHecho = true;
        if (this.r.probabilidad(tutorial.prob)) {
          const duracionTutorial = Math.min(Math.round(this.r.lognormal(55 * SEG, 0.3)), duracionMs - 2 * SEG);
          t = inicioIntento + duracionTutorial;
          emitir('tutorial_completado', { duracionMs: duracionTutorial });
          logro(tutorial.logro);
        }
      }

      // Crash a mitad de este intento: error fatal (a veces) y nada más; sin nivel_fin ni sesion_fin.
      if (i === p.crashEn) {
        t = Math.max(t, inicioIntento + duracionMs * this.r.entre(0.2, 0.8));
        if (this.r.probabilidad(0.6)) {
          const err = this.r.elegir(ERRORES_FATALES);
          emitir('error', { codigo: err.codigo, mensaje: err.mensaje, fatal: true });
        }
        break;
      }

      this.eventosDentroDelIntento({ emitir, t: () => t, mover: (nuevo) => (t = nuevo), inicioIntento, duracionMs, nivel, completado: paso.resultado === 'completado', estado: p.estado, logro });
      t = Math.max(t, inicioIntento + duracionMs);

      if (paso.resultado === 'muerte') {
        emitir('muerte', { nivelId, intento, ...this.puntoDeMuerte(nivel) });
        emitir('nivel_fin', { nivelId, intento, resultado: 'muerte', duracionMs });
        t += this.r.entero(2, 5) * SEG;
        continue;
      }

      if (paso.resultado === 'completado') {
        if (this.e.perfil.usaFlor) {
          t -= SEG;
          emitir('flor_recogida', { nivelId, duracionMs: duracionMs - SEG });
          t += SEG;
        }
        emitir('nivel_fin', { nivelId, intento, resultado: 'completado', duracionMs });
        logro(nivel.logroAlCompletar);
        emitir('rendimiento', this.rendimiento(p.plataforma, nivelId));
      } else {
        // Se rinde: a veces sale por el menú (nivel_fin abandono) y a veces solo cierra.
        if (this.r.probabilidad(0.6)) {
          emitir('nivel_fin', { nivelId, intento, resultado: 'abandono', duracionMs });
        }
      }

      if (paso.cierraDespues) {
        const terminoJuego = paso.resultado === 'completado' && i === p.pasos.length - 1 && nivel === this.e.perfil.niveles.at(-1);
        t += this.r.entero(terminoJuego ? 10 : 2, terminoJuego ? 40 : 10) * SEG;
        emitir('sesion_fin', { motivo: terminoJuego ? 'cierre_normal' : 'menu_salir' });
        terminoConFin = true;
        break;
      }
    }

    this.datos.eventos.push(...eventos);
    const primerEvento = eventos[0]!;
    const sesion: SesionSeed = {
      sessionId,
      juegoId: this.e.juegoId,
      playerId: p.playerId,
      buildVersion: p.build,
      plataforma: p.plataforma,
      creadaEn: new Date(primerEvento.timestamp.getTime() - this.r.entero(300, 1500)),
      inicio: primerEvento.timestamp,
      fin: terminoConFin ? eventos.at(-1)!.timestamp : null,
      ultimoEventoEn: new Date(Math.max(...eventos.map((ev) => ev.timestamp.getTime()))),
      ultimoRecibidoEn: new Date(Math.max(...eventos.map((ev) => ev.recibidoEn.getTime()))),
      origen: 'seed',
    };
    this.datos.sesiones.push(sesion);
    return sesion;
  }

  // Pausas, inactividad, diálogos y coleccionables, repartidos dentro del intento.
  private eventosDentroDelIntento(c: {
    emitir: (tipo: TipoEvento, data?: Record<string, unknown>) => void;
    t: () => number;
    mover: (t: number) => void;
    inicioIntento: number;
    duracionMs: number;
    nivel: PerfilNivel;
    completado: boolean;
    estado: { coleccionables: Set<string> };
    logro: (logroId: string | undefined) => void;
  }): void {
    const momentos: { en: number; accion: () => void }[] = [];
    const momento = () => c.inicioIntento + c.duracionMs * this.r.entre(0.1, 0.9);
    const nivelId = c.nivel.nivelId;

    if (this.r.probabilidad(0.3)) {
      const dialogoId = this.r.elegir(this.e.perfil.dialogos);
      momentos.push({ en: c.inicioIntento + c.duracionMs * this.r.entre(0.02, 0.2), accion: () => c.emitir('dialogo_saltado', { dialogoId, nivelId }) });
    }
    if (this.r.probabilidad(0.15)) {
      const duracionMs = Math.round(this.r.lognormal(45 * SEG, 0.6));
      momentos.push({ en: momento(), accion: () => c.emitir('pausa', { duracionMs, nivelId }) });
    }
    if (this.r.probabilidad(0.08)) {
      const duracionMs = Math.round(this.r.lognormal(70 * SEG, 0.5));
      momentos.push({ en: momento(), accion: () => c.emitir('inactividad', { duracionMs, nivelId }) });
    }
    const col = c.nivel.coleccionables;
    if (c.completado && col) {
      for (const coleccionableId of col.ids) {
        if (!c.estado.coleccionables.has(coleccionableId) && this.r.probabilidad(col.prob)) {
          momentos.push({
            en: momento(),
            accion: () => {
              c.estado.coleccionables.add(coleccionableId);
              c.emitir('coleccionable_encontrado', { coleccionableId, nivelId });
              if (col.logroAlCompletarTodos && col.ids.every((id) => c.estado.coleccionables.has(id))) {
                c.logro(col.logroAlCompletarTodos);
              }
            },
          });
        }
      }
    }
    momentos.sort((a, b) => a.en - b.en);
    for (const m of momentos) {
      c.mover(Math.max(c.t(), m.en));
      m.accion();
    }
  }

  // 90 % cerca de una zona caliente del nivel; 10 % en cualquier punto (ruido).
  private puntoDeMuerte(nivel: PerfilNivel): { causa: string; x: number; y: number } {
    const limites = this.e.catalogo.niveles.find((n) => n.nivelId === nivel.nivelId)?.limites;
    if (!limites) {
      throw new Error(`El nivel ${nivel.nivelId} no tiene límites en el catálogo.`);
    }
    if (this.r.probabilidad(0.1)) {
      return {
        causa: this.r.elegir(this.e.catalogo.causasMuerte).causa,
        x: redondear(this.r.entre(limites.minX, limites.maxX)),
        y: redondear(this.r.entre(limites.minY, limites.maxY)),
      };
    }
    const zona: ZonaMuerte = this.r.ponderado(nivel.zonas.map((z) => ({ valor: z, peso: z.peso })));
    return {
      causa: zona.causa,
      x: redondear(acotar(this.r.normal(zona.x, zona.radioX), limites.minX, limites.maxX)),
      y: redondear(acotar(this.r.normal(zona.y, zona.radioY), limites.minY, limites.maxY)),
    };
  }

  private rendimiento(plataforma: Plataforma, nivelId: string): Record<string, unknown> {
    const fps = redondear(Math.max(10, this.r.normal(FPS_POR_PLATAFORMA[plataforma], 4)));
    return this.r.probabilidad(0.5)
      ? { fpsPromedio: fps, tiempoCargaMs: Math.round(this.r.lognormal(plataforma === 'android' || plataforma === 'webgl' ? 3200 : 1800, 0.35)), nivelId }
      : { fpsPromedio: fps, nivelId };
  }
}

export function generarDatosSeed(entrada: EntradaGenerador): DatosSeed {
  return new Simulacion(entrada).ejecutar();
}
