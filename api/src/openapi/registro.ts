import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

// Fragmento de `paths` de OpenAPI que exporta cada módulo de rutas.
export type RutasOpenApi = Record<string, Record<string, unknown>>;

// Registro de los esquemas zod que se publican en `components.schemas`.
// Los mismos objetos que validan las peticiones son los que se documentan.
const registro = z.registry<{ id: string }>();

export function registrarEsquema<T extends z.ZodType>(id: string, esquema: T): T {
  registro.add(esquema, { id });
  return esquema;
}

export function refEsquema(esquema: z.ZodType): { $ref: string } {
  const meta = registro.get(esquema);
  if (!meta) {
    throw new Error('El esquema no está registrado para OpenAPI; usa registrarEsquema().');
  }
  return { $ref: `#/components/schemas/${meta.id}` };
}

// JSON Schema 2020-12 (el dialecto de OpenAPI 3.1). Se quitan `$schema` y `$id`,
// que sobran dentro de un documento OpenAPI.
export function generarComponentes(): Record<string, JsonSchema> {
  const { schemas } = z.toJSONSchema(registro, {
    target: 'draft-2020-12',
    uri: (id) => `#/components/schemas/${id}`,
  });
  const componentes: Record<string, JsonSchema> = {};
  for (const [id, esquema] of Object.entries(schemas)) {
    const { $schema: _schema, $id: _id, ...resto } = esquema as JsonSchema;
    componentes[id] = resto;
  }
  return componentes;
}
