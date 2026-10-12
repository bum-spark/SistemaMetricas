import { crearApp } from '../src/app';
import { cargarConfig } from '../src/config';

export function crearAppDePrueba(env: NodeJS.ProcessEnv = {}) {
  const config = cargarConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017/sin-uso', ...env });
  const erroresRegistrados: unknown[] = [];
  const app = crearApp(config, { registrarError: (err) => erroresRegistrados.push(err) });
  return { app, config, erroresRegistrados };
}
