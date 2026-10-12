import { PATRON_UUID_V4 } from '../dominio/constantes';

export const campoUuid = {
  type: String,
  required: true,
  match: [PATRON_UUID_V4, '{PATH} debe ser un UUID v4'] as [RegExp, string],
} as const;

// El `_id` de Mongo no se expone como llave de negocio (CLAUDE.md §6); tampoco los
// campos sensibles que cada modelo indique (hashes).
// Sin anotar el retorno como SchemaOptions: un tipo genérico rompe la inferencia de Mongoose.
export function opcionesEsquema(coleccion: string, ocultar: string[] = []) {
  const ocultos = new Set(['_id', ...ocultar]);
  return {
    collection: coleccion,
    versionKey: false as const,
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(ret).filter(([clave]) => !ocultos.has(clave))),
    },
  };
}
