import { crearApp } from './app';
import { cargarConfig } from './config';
import { conectarBd } from './db';

// En local se lee api/.env; en el hosting las variables vienen del entorno.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno y los valores por defecto.
}

async function iniciar(): Promise<void> {
  const config = cargarConfig();
  await conectarBd(config.mongoUri);
  const app = crearApp(config);
  app.listen(config.puerto, () => {
    console.log(`[${config.appName}] API escuchando en el puerto ${config.puerto} (${config.entorno})`);
  });
}

iniciar().catch((err: unknown) => {
  console.error('No se pudo iniciar la API:', err);
  process.exit(1);
});
