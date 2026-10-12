import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { cargarConfig, ConfigInvalidaError } from '../config';
import { conectarBd, desconectarBd } from '../db';

// Base común de los scripts de /scripts. Reglas:
// - Antes de escribir se imprime el host de la base de datos, SIN credenciales.
// - Si la URI no es local, hace falta --confirmar.
// - Ningún secreto (contraseñas, URI completa, API keys) va a los logs; la API key
//   solo se muestra una vez, con mostrarSecretoUnaVez().

export class ErrorScript extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorScript';
  }
}

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// "mongodb+srv://usuario:clave@cluster0.x.mongodb.net/metricas?..." → ["cluster0.x.mongodb.net"]
export function hostsDeUri(uri: string): string[] {
  const sinEsquema = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const sinCredenciales = sinEsquema.includes('@') ? sinEsquema.slice(sinEsquema.lastIndexOf('@') + 1) : sinEsquema;
  const autoridad = sinCredenciales.split(/[/?]/)[0] ?? '';
  return autoridad
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

function sinPuerto(host: string): string {
  if (host.startsWith('[')) {
    return host.slice(0, host.indexOf(']') + 1);
  }
  return host.split(':')[0] ?? host;
}

export function esUriLocal(uri: string): boolean {
  const hosts = hostsDeUri(uri);
  return hosts.length > 0 && hosts.every((host) => HOSTS_LOCALES.has(sinPuerto(host)));
}

// Quita credenciales de cualquier texto que pueda contener una URI.
export function censurar(texto: string): string {
  return texto.replace(/\/\/[^@/\s]+@/g, '//***:***@');
}

export function verificarDestino(uri: string, confirmar: boolean, log: (linea: string) => void): void {
  const local = esUriLocal(uri);
  log(`Base de datos: ${hostsDeUri(uri).join(', ') || '(host desconocido)'}${local ? ' (local)' : ' (REMOTA)'}`);
  if (!local && !confirmar) {
    throw new ErrorScript('La base de datos no es local. Vuelve a ejecutar con --confirmar si de verdad quieres escribir en ella.');
  }
}

export function mostrarSecretoUnaVez(etiqueta: string, secreto: string, escribir: (texto: string) => void): void {
  const linea = '='.repeat(Math.max(etiqueta.length, secreto.length) + 4);
  escribir(
    [
      '',
      linea,
      `  ${etiqueta}`,
      `  ${secreto}`,
      linea,
      '  Guárdala ahora: no se vuelve a mostrar y no se puede recuperar (solo rotar).',
      '',
    ].join('\n'),
  );
}

export type ArgsScript = Record<string, string | boolean | undefined>;

export interface ContextoScript {
  args: ArgsScript;
  log: (linea: string) => void;
}

export function leerArgs(argv: string[], opciones: ParseArgsOptionsConfig): ArgsScript {
  try {
    const { values } = parseArgs({
      args: argv,
      options: { ...opciones, confirmar: { type: 'boolean', default: false } },
      strict: true,
      allowPositionals: false,
    });
    return values;
  } catch (err) {
    throw new ErrorScript(err instanceof Error ? err.message : 'argumentos inválidos');
  }
}

export function texto(args: ArgsScript, nombre: string): string | undefined {
  const valor = args[nombre];
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : undefined;
}

// Carga .env, valida argumentos, verifica el destino, conecta, ejecuta y desconecta.
// Los errores terminan con código 1 y nunca muestran credenciales.
export async function ejecutarScript(
  nombre: string,
  argv: string[],
  opciones: ParseArgsOptionsConfig,
  cuerpo: (ctx: ContextoScript) => Promise<void>,
): Promise<void> {
  const log = (linea: string) => console.log(`[${nombre}] ${linea}`);
  let conectado = false;
  try {
    try {
      process.loadEnvFile();
    } catch {
      // Sin .env: se usan las variables del entorno.
    }
    const args = leerArgs(argv, opciones);
    const config = cargarConfig();
    verificarDestino(config.mongoUri, args.confirmar === true, log);
    await conectarBd(config.mongoUri);
    conectado = true;
    await cuerpo({ args, log });
  } catch (err) {
    const esperado = err instanceof ErrorScript || err instanceof ConfigInvalidaError;
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error(`[${nombre}] ${esperado ? 'Error' : 'Error inesperado'}: ${censurar(mensaje)}`);
    process.exitCode = 1;
  } finally {
    if (conectado) {
      await desconectarBd();
    }
  }
}
