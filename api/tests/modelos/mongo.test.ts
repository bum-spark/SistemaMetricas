import mongoose from 'mongoose';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

describe('servidor MongoDB de pruebas', () => {
  it('es MongoDB 7.0 o superior (necesario para $median)', async () => {
    const info = await mongoose.connection.db!.admin().buildInfo();
    const [mayor] = String(info.version).split('.').map(Number);
    expect(mayor).toBeGreaterThanOrEqual(7);
  });

  it('soporta $median en agregaciones', async () => {
    const coleccion = mongoose.connection.collection('prueba_median');
    await coleccion.insertMany([{ v: 1 }, { v: 3 }, { v: 10 }]);
    const [resultado] = await coleccion
      .aggregate<{ mediana: number }>([
        { $group: { _id: null, mediana: { $median: { input: '$v', method: 'approximate' } } } },
      ])
      .toArray();
    expect(resultado?.mediana).toBe(3);
    await coleccion.drop();
  });
});
