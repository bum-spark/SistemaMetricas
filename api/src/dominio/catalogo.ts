import { z } from 'zod';
import { PATRON_ID_CATALOGO, TIPOS_EVENTO } from './constantes';

// Catálogo por juego (ESQUEMA_EVENTOS.md §5). Es la única definición de su forma:
// la usan el modelo de Mongoose, los scripts de alta y, más adelante, la ingesta.

const idCatalogo = z.string().regex(PATRON_ID_CATALOGO, 'debe estar en snake_case');
const texto = z.string().trim().min(1);

const esquemaLimites = z
  .object({ minX: z.number(), maxX: z.number(), minY: z.number(), maxY: z.number() })
  .refine((l) => l.minX < l.maxX && l.minY < l.maxY, 'minX < maxX y minY < maxY');

export const esquemaNivel = z.object({
  nivelId: idCatalogo,
  nombre: texto,
  orden: z.number().int().min(1),
  descripcion: z.string().default(''),
  tieneTutorial: z.boolean().default(false),
  imagenUrl: z.url().optional(),
  limites: esquemaLimites.optional(),
});

export const esquemaCausaMuerte = z.object({ causa: idCatalogo, nombre: texto });

export const esquemaLogroCatalogo = z.object({
  logroId: idCatalogo,
  nombre: texto,
  descripcion: z.string().default(''),
  nivelId: idCatalogo.optional(),
});

export const esquemaColeccionable = z.object({
  coleccionableId: idCatalogo,
  nivelId: idCatalogo,
  nombre: texto,
});

function revisarUnicos<T>(
  ctx: z.RefinementCtx,
  elementos: T[],
  clave: (e: T) => string | number,
  ruta: string,
): void {
  const vistos = new Set<string | number>();
  elementos.forEach((elemento, i) => {
    const valor = clave(elemento);
    if (vistos.has(valor)) {
      ctx.addIssue({ code: 'custom', path: [ruta, i], message: `valor repetido: ${valor}` });
    }
    vistos.add(valor);
  });
}

export const esquemaCatalogo = z
  .object({
    duracionEsperadaMs: z.number().int().positive().optional(),
    tiposEvento: z.array(z.enum(TIPOS_EVENTO)).min(1),
    niveles: z.array(esquemaNivel).min(1),
    causasMuerte: z.array(esquemaCausaMuerte).default([]),
    logros: z.array(esquemaLogroCatalogo).default([]),
    coleccionables: z.array(esquemaColeccionable).default([]),
  })
  .superRefine((catalogo, ctx) => {
    revisarUnicos(ctx, catalogo.tiposEvento, (t) => t, 'tiposEvento');
    revisarUnicos(ctx, catalogo.niveles, (n) => n.nivelId, 'niveles');
    revisarUnicos(ctx, catalogo.niveles, (n) => n.orden, 'niveles');
    revisarUnicos(ctx, catalogo.causasMuerte, (c) => c.causa, 'causasMuerte');
    revisarUnicos(ctx, catalogo.logros, (l) => l.logroId, 'logros');
    revisarUnicos(ctx, catalogo.coleccionables, (c) => c.coleccionableId, 'coleccionables');

    const niveles = new Set(catalogo.niveles.map((n) => n.nivelId));
    catalogo.logros.forEach((logro, i) => {
      if (logro.nivelId !== undefined && !niveles.has(logro.nivelId)) {
        ctx.addIssue({ code: 'custom', path: ['logros', i, 'nivelId'], message: `nivel inexistente: ${logro.nivelId}` });
      }
    });
    catalogo.coleccionables.forEach((col, i) => {
      if (!niveles.has(col.nivelId)) {
        ctx.addIssue({ code: 'custom', path: ['coleccionables', i, 'nivelId'], message: `nivel inexistente: ${col.nivelId}` });
      }
    });
  });

export type Catalogo = z.infer<typeof esquemaCatalogo>;
export type CatalogoEntrada = z.input<typeof esquemaCatalogo>;

export function describirProblemas(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`).join('; ');
}
