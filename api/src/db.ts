import mongoose from 'mongoose';
import { asegurarIndices } from './modelos';

// Siempre sobre una base de datos explícita (MONGODB_DB, R-33): el cluster puede ser
// compartido con otros proyectos.
export async function conectarBd(uri: string, baseDatos: string): Promise<void> {
  // Los índices se crean explícitamente con asegurarIndices(), no en segundo plano.
  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, { dbName: baseDatos, serverSelectionTimeoutMS: 10_000 });
  await asegurarIndices();
}

export async function desconectarBd(): Promise<void> {
  await mongoose.disconnect();
}
