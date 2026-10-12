import type { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  const servidor = (globalThis as { __MONGO_SERVIDOR__?: MongoMemoryServer }).__MONGO_SERVIDOR__;
  await servidor?.stop();
}
