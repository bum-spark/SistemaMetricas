import { model, Schema, type InferSchemaType } from 'mongoose';
import { describirProblemas, esquemaCatalogo } from '../dominio/catalogo';
import { PATRON_SLUG, problemaLogoUrl } from '../dominio/constantes';
import { campoUuid, opcionesEsquema } from './comun';

const subdocumento = { _id: false } as const;

const esquemaCatalogoMongo = new Schema(
  {
    duracionEsperadaMs: { type: Number },
    tiposEvento: { type: [String], default: [] },
    niveles: {
      type: [
        new Schema(
          {
            nivelId: { type: String, required: true },
            nombre: { type: String, required: true },
            orden: { type: Number, required: true },
            descripcion: { type: String, default: '' },
            tieneTutorial: { type: Boolean, default: false },
            imagenUrl: { type: String },
            limites: {
              type: new Schema(
                { minX: Number, maxX: Number, minY: Number, maxY: Number },
                subdocumento,
              ),
            },
          },
          subdocumento,
        ),
      ],
      default: [],
    },
    causasMuerte: {
      type: [new Schema({ causa: { type: String, required: true }, nombre: { type: String, required: true } }, subdocumento)],
      default: [],
    },
    logros: {
      type: [
        new Schema(
          {
            logroId: { type: String, required: true },
            nombre: { type: String, required: true },
            descripcion: { type: String, default: '' },
            nivelId: { type: String },
          },
          subdocumento,
        ),
      ],
      default: [],
    },
    coleccionables: {
      type: [
        new Schema(
          {
            coleccionableId: { type: String, required: true },
            nivelId: { type: String, required: true },
            nombre: { type: String, required: true },
          },
          subdocumento,
        ),
      ],
      default: [],
    },
  },
  subdocumento,
);

function aObjetoPlano(valor: unknown): unknown {
  if (typeof valor === 'object' && valor !== null && 'toObject' in valor && typeof valor.toObject === 'function') {
    return (valor as { toObject: () => unknown }).toObject();
  }
  return valor;
}

const esquemaJuego = new Schema(
  {
    juegoId: { ...campoUuid, unique: true },
    nombre: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, match: PATRON_SLUG },
    versionActual: { type: String, required: true, trim: true },
    // Opcional: sin logo, el dashboard muestra un avatar con la inicial del nombre.
    logoUrl: {
      type: String,
      validate: {
        validator(this: { slug?: unknown }, valor: unknown): boolean {
          if (valor === undefined || valor === null) {
            return true;
          }
          const problema = typeof valor === 'string' ? problemaLogoUrl(valor, String(this.slug)) : 'logoUrl debe ser texto';
          if (problema) {
            throw new Error(problema);
          }
          return true;
        },
      },
    },
    activo: { type: Boolean, default: true },
    fechaCreacion: { type: Date, default: () => new Date() },
    // SHA-256 de la API key (S-19). null = revocada.
    apiKeyHash: { type: String, default: null },
    apiKeyCreadaEn: { type: Date, default: null },
    catalogo: {
      type: esquemaCatalogoMongo,
      required: true,
      validate: {
        // La forma y la consistencia del catálogo se definen una sola vez, en zod.
        validator(valor: unknown): boolean {
          const resultado = esquemaCatalogo.safeParse(aObjetoPlano(valor));
          if (!resultado.success) {
            throw new Error(`Catálogo inválido: ${describirProblemas(resultado.error)}`);
          }
          return true;
        },
      },
    },
  },
  opcionesEsquema('juegos', ['apiKeyHash']),
);

// Único solo entre keys activas: varios juegos pueden tener la key revocada (null).
esquemaJuego.index(
  { apiKeyHash: 1 },
  { unique: true, partialFilterExpression: { apiKeyHash: { $type: 'string' } } },
);

export type Juego = InferSchemaType<typeof esquemaJuego>;
export const JuegoModelo = model('Juego', esquemaJuego);
