import { randomUUID } from 'node:crypto';
import os from 'node:os';
import mongoose from 'mongoose';
import { asegurarIndices } from '../../src/modelos';

// Cada archivo de tests usa su propia base de datos dentro del servidor en memoria.
export function usarBdPrueba(): void {
  beforeAll(async () => {
    const uri = process.env.MONGO_URI_TESTS;
    if (!uri) {
      throw new Error('MONGO_URI_TESTS no está definida: ¿corrió el globalSetup de Jest?');
    }
    mongoose.set('autoIndex', false);
    await mongoose.connect(uri, {
      dbName: `prueba_${randomUUID().slice(0, 8)}`,
      // El driver 7 carga `os` con import() dinámico, que falla dentro del sandbox CJS de
      // Jest: los metadatos del handshake quedan vacíos y el servidor rechaza la conexión.
      // Se le pasa el módulo directamente (opción pública del driver). En producción no hace falta.
      runtimeAdapters: { os },
    });
    await asegurarIndices();
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((coleccion) => coleccion.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}
