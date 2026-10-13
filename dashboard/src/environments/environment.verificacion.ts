// Build de verificación (npm run build:verificacion): igual que producción, pero la API está
// en el mismo origen (/api/v1), servida por un mock local detrás del servidor que imita
// vercel.json. Así se prueban los endpoints reales con la CSP de producción sin relajarla.
export const environment = {
  appName: 'Estudio Xolos',
  apiUrl: '/api/v1',
};
