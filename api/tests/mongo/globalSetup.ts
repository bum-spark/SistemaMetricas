import { MongoMemoryServer } from 'mongodb-memory-server';

// MongoDB 7.0+ es obligatorio por $median (R-17). Versión exacta para que todos
// los equipos prueben contra lo mismo; se puede cambiar con MONGOMS_VERSION.
export const VERSION_MONGO_TESTS = '7.0.43';

export default async function globalSetup(): Promise<void> {
  process.env.MONGOMS_VERSION ??= VERSION_MONGO_TESTS;
  const servidor = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION },
  });
  (globalThis as { __MONGO_SERVIDOR__?: MongoMemoryServer }).__MONGO_SERVIDOR__ = servidor;
  // Los workers de Jest heredan las variables de entorno definidas aquí.
  process.env.MONGO_URI_TESTS = servidor.getUri();
}
