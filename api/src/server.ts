import { crearApp } from './app';
import { cargarConfig } from './config';

// En local se lee api/.env; en el hosting las variables vienen del entorno.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno y los valores por defecto.
}

const config = cargarConfig();
const app = crearApp(config);

app.listen(config.puerto, () => {
  console.log(`[${config.appName}] API escuchando en el puerto ${config.puerto} (${config.entorno})`);
});
