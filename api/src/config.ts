import { z } from 'zod';

const listaSeparadaPorComas = z
  .string()
  .transform((valor) =>
    valor
      .split(',')
      .map((origen) => origen.trim())
      .filter((origen) => origen.length > 0),
  );

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Único lugar donde vive el nombre del estudio: valor por defecto de APP_NAME.
  APP_NAME: z.string().trim().min(1).default('Estudio Xolos'),
  CORS_ORIGIN: listaSeparadaPorComas.default(['http://localhost:4200']),
  MONGODB_URI: z
    .string({ error: 'es obligatoria' })
    .regex(/^mongodb(\+srv)?:\/\//, 'debe empezar con mongodb:// o mongodb+srv://'),
});

export interface Config {
  entorno: 'development' | 'test' | 'production';
  puerto: number;
  appName: string;
  corsOrigenes: string[];
  mongoUri: string;
}

export class ConfigInvalidaError extends Error {
  constructor(public readonly problemas: string[]) {
    super(`Configuración inválida:\n- ${problemas.join('\n- ')}`);
    this.name = 'ConfigInvalidaError';
  }
}

export function cargarConfig(entorno: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquemaEntorno.safeParse(entorno);
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
  };
}
