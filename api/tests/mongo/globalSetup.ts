import { MongoMemoryServer } from 'mongodb-memory-server';

// MongoDB 7.0+ es obligatorio por $median (R-17). Versión exacta para que todos
// los equipos prueben contra lo mismo; se puede cambiar con MONGOMS_VERSION.
//
// Nota sobre la conexión (ver bdPrueba.ts): los tests conectan pasando
// `runtimeAdapters: { os }`. El driver `mongodb` 7 carga el módulo `os` con un
// import() dinámico, y dentro del sandbox CommonJS de Jest ese import falla en
// silencio: el handshake sale sin metadatos (`client.driver`) y el servidor rechaza
// la conexión ("Missing required sub-document 'driver'"). Pasarle `os` directamente
// (opción pública del driver) lo evita. En producción NO hace falta: fuera de Jest el
// import() funciona (verificado conectando la API compilada a MongoDB 7.0.43).
export const VERSION_MONGO_TESTS = '7.0.43';

export default async function globalSetup(): Promise<void> {
  process.env.MONGOMS_VERSION ??= VERSION_MONGO_TESTS;
  const servidor = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION },
    // Arrancar mongod puede tardar en una máquina lenta (por defecto, 10 s).
    instance: { launchTimeout: 60_000 },
  });
  (globalThis as { __MONGO_SERVIDOR__?: MongoMemoryServer }).__MONGO_SERVIDOR__ = servidor;
  // Los workers de Jest heredan las variables de entorno definidas aquí.
  process.env.MONGO_URI_TESTS = servidor.getUri();
}
