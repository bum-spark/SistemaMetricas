import mongoose from 'mongoose';
import { asegurarIndices } from './modelos';

export async function conectarBd(uri: string): Promise<void> {
  // Los índices se crean explícitamente con asegurarIndices(), no en segundo plano.
  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  await asegurarIndices();
}

export async function desconectarBd(): Promise<void> {
  await mongoose.disconnect();
}
