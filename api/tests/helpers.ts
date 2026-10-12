import { crearApp } from '../src/app';
import { cargarConfig } from '../src/config';

export function crearAppDePrueba(env: NodeJS.ProcessEnv = {}) {
  const config = cargarConfig({ NODE_ENV: 'test', ...env });
  const erroresRegistrados: unknown[] = [];
  const app = crearApp(config, { registrarError: (err) => erroresRegistrados.push(err) });
  return { app, config, erroresRegistrados };
}
