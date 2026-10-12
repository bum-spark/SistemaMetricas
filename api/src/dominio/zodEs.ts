import { z } from 'zod';

// Mensajes de validación de zod en español (los ve el SDK en `rechazados` y el dashboard en los 400).
z.config(z.locales.es());

export function describirIssue(issue: z.core.$ZodIssue, prefijo = ''): string {
  const ruta = [prefijo, ...issue.path.map(String)].filter((parte) => parte.length > 0).join('.');
  return ruta.length > 0 ? `${ruta}: ${issue.message}` : issue.message;
}
