import autocannon from 'autocannon';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import mongoose from 'mongoose';
import { crearApp } from '../app';
import { LA_CASA_DEL_BOSQUE } from '../catalogos';
import { cargarConfig, ConfigInvalidaError, type Config } from '../config';
import { conectarBd, desconectarBd } from '../db';
import { esquemaCatalogo } from '../dominio/catalogo';
import { asegurarIndices, JuegoModelo } from '../modelos';
import { censurar } from '../mongoUri';
import { generarApiKey, hashApiKey } from '../seguridad/apiKey';
import { crearAdmin } from './crearAdmin';
import { ErrorScript, leerArgs, verificarDestino } from './comun';

// Prueba de carga (S-31). NUNCA contra la base del proyecto: usa una base aparte
// (MONGODB_DB, por defecto xolos_carga) que se vacía al empezar y se BORRA al terminar,
// con un juego y un admin creados solo para la prueba. Levanta la API en este mismo proceso
// en un puerto libre y la carga con autocannon:
//   1) ingesta: POST /eventos con lotes de N eventos (como el SDK de Unity);
//   2) lectura: GET /estadisticas/:juegoId/embudo (lo que pide el dashboard).
// Los límites de la API son los de la configuración: para medir capacidad se suben con
// RATE_LIMIT_INGESTA_IP y RATE_LIMIT_INGESTA_KEY; con los normales se comprueba el 429.

export const BASE_PROHIBIDA = 'xolos_analytics';
const BASE_POR_DEFECTO = 'xolos_carga';

interface Escenario {
  nombre: string;
  peticionesPorSegundo: number;
  latenciaP50: number;
  latenciaP99: number;
  peticiones: number;
  respuestas2xx: number;
  respuestas429: number;
  otrosNo2xx: number;
  errores: number;
  timeouts: number;
}

function log(linea: string): void {
  console.log(`[prueba-carga] ${linea}`);
}

// Rechaza la base del proyecto aunque venga con otras mayúsculas o espacios.
export function verificarBaseCarga(nombre: string): void {
  if (nombre.trim().toLowerCase() === BASE_PROHIBIDA) {
    throw new ErrorScript(`La prueba de carga no puede correr contra "${BASE_PROHIBIDA}" (S-31). Usa MONGODB_DB=${BASE_POR_DEFECTO}.`);
  }
}

function resumir(nombre: string, r: autocannon.Result): Escenario {
  const codigos = r.statusCodeStats as Record<string, { count: number }> | undefined;
  const conteo = (codigo: string) => codigos?.[codigo]?.count ?? 0;
  const dosCientos = Object.entries(codigos ?? {})
    .filter(([c]) => c.startsWith('2'))
    .reduce((s, [, v]) => s + v.count, 0);
  return {
    nombre,
    peticionesPorSegundo: r.requests.average,
    latenciaP50: r.latency.p50,
    latenciaP99: r.latency.p99,
    peticiones: r.requests.total,
    respuestas2xx: dosCientos,
    respuestas429: conteo('429'),
    otrosNo2xx: r.non2xx - conteo('429'),
    errores: r.errors,
    timeouts: r.timeouts,
  };
}

async function correr(opciones: autocannon.Options): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    autocannon(opciones, (err: unknown, resultado) => (err ? reject(err instanceof Error ? err : new Error('autocannon falló')) : resolve(resultado)));
  });
}

export async function ejecutarPrueba(config: Config, duracion: number, conexiones: number, lote: number): Promise<{ escenarios: Escenario[]; condiciones: string[] }> {
  const db = mongoose.connection.db!;
  // Base limpia (por si una corrida anterior se interrumpió) y los mismos índices que producción.
  verificarBaseCarga(db.databaseName);
  await db.dropDatabase();
  await asegurarIndices();

  const apiKey = generarApiKey();
  const juego = await JuegoModelo.create({
    juegoId: randomUUID(),
    nombre: 'Prueba de carga',
    slug: 'prueba-carga',
    versionActual: '1.0.0',
    apiKeyHash: hashApiKey(apiKey),
    apiKeyCreadaEn: new Date(),
    catalogo: esquemaCatalogo.parse(LA_CASA_DEL_BOSQUE.catalogo),
  });
  const password = randomUUID();
  await crearAdmin({ email: 'carga@prueba.local', password, nombre: 'Prueba de carga' });

  const servidor = crearApp(config, { registrarError: () => undefined }).listen(0);
  await new Promise((r) => servidor.once('listening', r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1`;
  try {
    // Una sesión por conexión de autocannon; cada lote avanza su `secuencia`.
    const sesiones: { playerId: string; sessionId: string; secuencia: number }[] = [];
    for (let i = 0; i < conexiones; i++) {
      const playerId = randomUUID();
      const res = await fetch(`${base}/sesiones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ juegoId: juego.juegoId, playerId, buildVersion: '1.0.0', plataforma: 'windows', consentimiento: true }),
      });
      if (res.status !== 201) {
        throw new ErrorScript(`No se pudo abrir una sesión de prueba (HTTP ${res.status}).`);
      }
      const { sessionId } = (await res.json()) as { sessionId: string };
      sesiones.push({ playerId, sessionId, secuencia: 0 });
    }
    let turno = 0;
    const loteDeEventos = () => {
      const s = sesiones[turno++ % sesiones.length]!;
      return Array.from({ length: lote }, (_, i) => {
        s.secuencia += 1;
        const intento = 1 + (s.secuencia % 3);
        const tipo = i % 2 === 0 ? 'nivel_inicio' : 'muerte';
        return {
          eventoId: randomUUID(),
          juegoId: juego.juegoId,
          playerId: s.playerId,
          sessionId: s.sessionId,
          secuencia: s.secuencia,
          timestamp: new Date().toISOString(),
          buildVersion: '1.0.0',
          plataforma: 'windows',
          versionEsquema: 1,
          tipo,
          data:
            tipo === 'nivel_inicio'
              ? { nivelId: 'casa_abandonada', intento }
              : { nivelId: 'casa_abandonada', intento, causa: 'fantasma', x: (s.secuencia % 120) + 0.5, y: (s.secuencia % 30) + 0.5 },
        };
      });
    };

    log(`Ingesta: ${duracion} s, ${conexiones} conexiones, lotes de ${lote} eventos…`);
    const ingesta = await correr({
      url: `${base}/eventos`,
      connections: conexiones,
      duration: duracion,
      requests: [
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
          setupRequest: (req) => ({ ...req, body: JSON.stringify(loteDeEventos()) }),
        },
      ],
    });

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'carga@prueba.local', password }),
    });
    const { token } = (await login.json()) as { token: string };
    log(`Lectura: ${duracion} s, ${conexiones} conexiones, GET /estadisticas/:juegoId/embudo…`);
    const lectura = await correr({
      url: `${base}/estadisticas/${juego.juegoId}/embudo`,
      connections: conexiones,
      duration: duracion,
      headers: { Authorization: `Bearer ${token}` },
    });

    const eventos = await mongoose.connection.db!.collection('eventos').countDocuments();
    const info = (await mongoose.connection.db!.admin().buildInfo()) as { version: string };
    const cpu = os.cpus();
    const condiciones = [
      `Máquina: ${cpu[0]?.model.trim() ?? 'CPU desconocida'} (${cpu.length} hilos), ${Math.round(os.totalmem() / 2 ** 30)} GB de RAM, ${os.type()} ${os.release()}`,
      `Node ${process.version}; MongoDB ${info.version} (${config.mongoUri.includes('127.0.0.1') || config.mongoUri.includes('localhost') ? 'local' : 'remoto'}); API y autocannon en el mismo equipo`,
      `Duración ${duracion} s por escenario, ${conexiones} conexiones, lotes de ${lote} eventos por POST /eventos`,
      `Límites: ingesta ${config.limites.ingestaPorIp}/min por IP y ${config.limites.ingestaPorKey}/min por API key`,
      `Eventos guardados durante la ingesta: ${eventos}`,
    ];
    return { escenarios: [resumir('Ingesta POST /eventos', ingesta), resumir('Lectura GET /estadisticas/:id/embudo', lectura)], condiciones };
  } finally {
    await new Promise((r) => servidor.close(r));
  }
}

export function tablaMarkdown(escenarios: Escenario[]): string {
  const ms = (n: number) => `${n} ms`;
  const filas = escenarios.map(
    (e) =>
      `| ${e.nombre} | ${e.peticionesPorSegundo.toFixed(1)} | ${ms(e.latenciaP50)} | ${ms(e.latenciaP99)} | ${e.peticiones} | ${e.respuestas2xx} | ${e.respuestas429} | ${e.otrosNo2xx} | ${e.errores} | ${e.timeouts} |`,
  );
  return [
    '| Escenario | Peticiones/s (promedio) | Latencia p50 | Latencia p99 | Peticiones | 2xx | 429 | Otros no 2xx | Errores | Timeouts |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...filas,
  ].join('\n');
}

export async function main(argv: string[]): Promise<void> {
  let conectado = false;
  try {
    try {
      process.loadEnvFile();
    } catch {
      // Sin .env: variables del entorno.
    }
    // Sin MONGODB_DB se usa la base de carga; nunca se toma un valor por defecto del proyecto.
    process.env['MONGODB_DB'] ||= BASE_POR_DEFECTO;
    // La prueba levanta la API; un secreto aleatorio solo para este proceso si no hay uno.
    process.env['JWT_SECRET'] ||= randomUUID() + randomUUID();
    const args = leerArgs(argv, { duracion: { type: 'string' }, conexiones: { type: 'string' }, lote: { type: 'string' } });
    const config = cargarConfig();
    verificarBaseCarga(config.mongoDb);
    verificarDestino(config.mongoUri, config.mongoDb, args['confirmar'] === true, log);
    const numero = (v: unknown, defecto: number, max: number) => {
      const n = Number(v ?? defecto);
      if (!Number.isInteger(n) || n < 1 || n > max) {
        throw new ErrorScript(`Valor inválido: ${String(v)} (entero entre 1 y ${max}).`);
      }
      return n;
    };
    const duracion = numero(args['duracion'], 20, 300);
    const conexiones = numero(args['conexiones'], 20, 500);
    const lote = numero(args['lote'], 20, 100);

    await conectarBd(config.mongoUri, config.mongoDb);
    conectado = true;
    const { escenarios, condiciones } = await ejecutarPrueba(config, duracion, conexiones, lote);
    console.log(['', '## Resultados', '', tablaMarkdown(escenarios), '', ...condiciones.map((c) => `- ${c}`), ''].join('\n'));
  } catch (err) {
    const esperado = err instanceof ErrorScript || err instanceof ConfigInvalidaError;
    console.error(`[prueba-carga] ${esperado ? 'Error' : 'Error inesperado'}: ${censurar(err instanceof Error ? err.message : String(err))}`);
    process.exitCode = 1;
  } finally {
    if (conectado) {
      // La base de carga se borra siempre al terminar (S-31).
      const db = mongoose.connection.db;
      if (db && db.databaseName.trim().toLowerCase() !== BASE_PROHIBIDA) {
        await db.dropDatabase();
        log(`Base "${db.databaseName}" borrada.`);
      }
      await desconectarBd();
    }
  }
}
