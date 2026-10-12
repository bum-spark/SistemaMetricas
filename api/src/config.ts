import { z } from 'zod';
import { baseDeUri } from './mongoUri';

const listaSeparadaPorComas = z
  .string()
  .transform((valor) =>
    valor
      .split(',')
      .map((origen) => origen.trim())
      .filter((origen) => origen.length > 0),
  );

// Nombres válidos de base de datos en MongoDB (sin / \ . " $ espacios, máx. 63 bytes).
const PATRON_NOMBRE_BD = /^[A-Za-z0-9_-]{1,63}$/;

const esquemaEntorno = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Único lugar donde vive el nombre del estudio: valor por defecto de APP_NAME.
    APP_NAME: z.string().trim().min(1).default('Estudio Xolos'),
    CORS_ORIGIN: listaSeparadaPorComas.default(['http://localhost:4200']),
    MONGODB_URI: z
      .string({ error: 'es obligatoria' })
      .regex(/^mongodb(\+srv)?:\/\//, 'debe empezar con mongodb:// o mongodb+srv://'),
    // Base de datos explícita y sin valor por defecto (R-33): el cluster puede ser compartido.
    MONGODB_DB: z
      .string({ error: 'es obligatoria (ej. xolos_analytics)' })
      .regex(PATRON_NOMBRE_BD, 'solo letras, números, guion y guion bajo (máx. 63)'),
    // Saltos de proxy delante de la API (Render/Railway = 1). Necesario para leer la IP
    // real del jugador en el rate limit (R-05, S-23). 0 = sin proxy.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    // Límites por minuto (R-05, R-10, S-26). Configurables para la prueba de carga (S-31).
    RATE_LIMIT_INGESTA_IP: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_INGESTA_KEY: z.coerce.number().int().min(1).default(1000),
    RATE_LIMIT_PUBLICO_IP: z.coerce.number().int().min(1).default(600),
  })
  .superRefine((env, ctx) => {
    const enUri = baseDeUri(env.MONGODB_URI);
    if (enUri !== undefined && enUri !== env.MONGODB_DB) {
      ctx.addIssue({
        code: 'custom',
        path: ['MONGODB_DB'],
        message: `la URI apunta a la base "${enUri}" pero MONGODB_DB es "${env.MONGODB_DB}"; quita la base de la URI o usa la misma`,
      });
    }
  });

export interface Config {
  entorno: 'development' | 'test' | 'production';
  puerto: number;
  appName: string;
  corsOrigenes: string[];
  mongoUri: string;
  mongoDb: string;
  trustProxy: number;
  limites: {
    ingestaPorIp: number;
    ingestaPorKey: number;
    publicoPorIp: number;
  };
}

export class ConfigInvalidaError extends Error {
  constructor(public readonly problemas: string[]) {
    super(`Configuración inválida:\n- ${problemas.join('\n- ')}`);
    this.name = 'ConfigInvalidaError';
  }
}

// Una variable definida pero vacía (p. ej. un campo en blanco en el panel del hosting)
// cuenta como no definida: toma su valor por defecto o falla como obligatoria (S-41).
function sinVacias(entorno: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(entorno).filter(([, valor]) => valor !== undefined && valor.trim() !== ''));
}

export function cargarConfig(entorno: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquemaEntorno.safeParse(sinVacias(entorno));
  if (!resultado.success) {
    throw new ConfigInvalidaError(
      resultado.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const env = resultado.data;
  return {
    entorno: env.NODE_ENV,
    puerto: env.PORT,
    appName: env.APP_NAME,
    corsOrigenes: env.CORS_ORIGIN,
    mongoUri: env.MONGODB_URI,
    mongoDb: env.MONGODB_DB,
    trustProxy: env.TRUST_PROXY,
    limites: {
      ingestaPorIp: env.RATE_LIMIT_INGESTA_IP,
      ingestaPorKey: env.RATE_LIMIT_INGESTA_KEY,
      publicoPorIp: env.RATE_LIMIT_PUBLICO_IP,
    },
  };
}
