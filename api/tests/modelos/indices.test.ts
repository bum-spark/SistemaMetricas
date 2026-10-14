import mongoose from 'mongoose';
import { MODELOS } from '../../src/modelos';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

interface IndiceEsperado {
  llaves: Record<string, number>;
  unico?: boolean;
  parcial?: Record<string, unknown>;
}

// Debe coincidir con ESQUEMA_EVENTOS.md §6.
const ESPERADOS: Record<string, IndiceEsperado[]> = {
  juegos: [
    { llaves: { juegoId: 1 }, unico: true },
    { llaves: { slug: 1 }, unico: true },
    { llaves: { apiKeyHash: 1 }, unico: true, parcial: { apiKeyHash: { $type: 'string' } } },
  ],
  jugadores: [
    { llaves: { juegoId: 1, playerId: 1 }, unico: true },
    { llaves: { juegoId: 1, primeraVez: 1 } },
  ],
  sesiones: [
    { llaves: { sessionId: 1 }, unico: true },
    { llaves: { juegoId: 1, inicio: 1 } },
    { llaves: { juegoId: 1, playerId: 1 } },
    { llaves: { juegoId: 1, buildVersion: 1, plataforma: 1 } },
  ],
  eventos: [
    { llaves: { juegoId: 1, eventoId: 1 }, unico: true },
    { llaves: { juegoId: 1, tipo: 1, timestamp: 1 } },
    { llaves: { juegoId: 1, sessionId: 1, secuencia: 1 } },
    { llaves: { juegoId: 1, playerId: 1 } },
    { llaves: { juegoId: 1, tipo: 1, buildVersion: 1 } },
  ],
  logros: [
    { llaves: { juegoId: 1, playerId: 1, logroId: 1 }, unico: true },
    { llaves: { juegoId: 1, logroId: 1 } },
  ],
  admins: [
    { llaves: { email: 1 }, unico: true },
    // Enlace de invitación vigente (S-67): solo los documentos que tienen uno.
    { llaves: { tokenInvitacionHash: 1 }, unico: true, parcial: { tokenInvitacionHash: { $type: 'string' } } },
  ],
};

describe('índices de las colecciones', () => {
  it('usa una sola base de datos con las 6 colecciones del diseño', async () => {
    const colecciones = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name).sort();
    expect(colecciones).toEqual(['admins', 'eventos', 'juegos', 'jugadores', 'logros', 'sesiones']);
    expect(MODELOS.map((m) => m.collection.collectionName).sort()).toEqual(colecciones);
  });

  it.each(Object.entries(ESPERADOS))('%s tiene exactamente los índices del diseño', async (coleccion, esperados) => {
    const indices = await mongoose.connection.collection(coleccion).indexes();
    const reales = indices
      .filter((i) => i.name !== '_id_')
      .map((i) => ({
        llaves: i.key,
        unico: i.unique === true,
        parcial: i.partialFilterExpression,
      }));
    const normalizados = esperados.map((e) => ({ llaves: e.llaves, unico: e.unico === true, parcial: e.parcial }));
    expect(reales).toHaveLength(normalizados.length);
    expect(reales).toEqual(expect.arrayContaining(normalizados));
  });
});
