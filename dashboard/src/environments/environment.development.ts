// Desarrollo local (`npm start`): siempre la API local del puerto 3000 (`npm run dev` en /api),
// para que nunca se toquen datos reales por accidente. Contra la API de producción:
// `npm run start:produccion` (usa environment.ts).
export const environment = {
  appName: 'Estudio Xolos',
  apiUrl: 'http://localhost:3000/api/v1',
};
