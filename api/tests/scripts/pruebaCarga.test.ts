import mongoose from 'mongoose';
import { cargarConfig } from '../../src/config';
import { BASE_PROHIBIDA, ejecutarPrueba, main, tablaMarkdown, verificarBaseCarga } from '../../src/scripts/pruebaCarga';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const config = (limiteIp: string) =>
  cargarConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    MONGODB_DB: 'xolos_carga',
    JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
    RATE_LIMIT_INGESTA_IP: limiteIp,
    RATE_LIMIT_INGESTA_KEY: '1000000',
  });

describe('prueba de carga (S-31)', () => {
  it('se niega a usar la base del proyecto, con cualquier mayúscula o espacio', () => {
    expect(() => verificarBaseCarga(BASE_PROHIBIDA)).toThrow(/no puede correr contra "xolos_analytics"/);
    expect(() => verificarBaseCarga(' XOLOS_ANALYTICS ')).toThrow(/S-31/);
    expect(() => verificarBaseCarga('xolos_carga')).not.toThrow();
  });

  it('main termina con error y sin conectarse si MONGODB_DB es xolos_analytics', async () => {
    const antes = { ...process.env };
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const conectar = jest.spyOn(mongoose, 'connect');
    try {
      process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:1';
      process.env['MONGODB_DB'] = 'xolos_analytics';
      await main([]);
      expect(process.exitCode).toBe(1);
      expect(conectar).not.toHaveBeenCalled();
      expect(error.mock.calls[0]![0]).toContain('xolos_analytics');
    } finally {
      process.env = antes;
      process.exitCode = 0;
      error.mockRestore();
      conectar.mockRestore();
    }
  });

  it('con límites altos mide la ingesta y la lectura sin 429', async () => {
    const { escenarios, condiciones } = await ejecutarPrueba(config('1000000'), 1, 2, 5);
    const [ingesta, lectura] = escenarios;
    expect(ingesta!.respuestas2xx).toBeGreaterThan(0);
    expect(ingesta!.respuestas429).toBe(0);
    expect(lectura!.respuestas2xx).toBeGreaterThan(0);
    expect(ingesta!.latenciaP99).toBeGreaterThanOrEqual(ingesta!.latenciaP50);
    expect(condiciones.join('\n')).toMatch(/MongoDB \d+\.\d+/);
    expect(tablaMarkdown(escenarios)).toContain('| Ingesta POST /eventos |');
  }, 60_000);

  it('con los límites normales aparece el 429', async () => {
    const { escenarios } = await ejecutarPrueba(config('5'), 1, 2, 5);
    expect(escenarios[0]!.respuestas429).toBeGreaterThan(0);
  }, 60_000);
});
