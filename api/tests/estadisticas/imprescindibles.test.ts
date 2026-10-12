import request from 'supertest';
import { crearAppDePrueba } from '../helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { consultar, juegoConSeed, tokenAdmin, type JuegoSembrado } from './helpers';
import {
  oraculoEmbudo,
  oraculoLogros,
  oraculoMuertes,
  oraculoSesiones,
  oraculoTiempoNivel,
  type FiltrosOraculo,
} from './oraculo';

// Tests de solo lectura: el seed (semilla fija) se inserta una vez para todo el archivo.
usarBdPrueba({ limpiarEntreTests: false });

const { app } = crearAppDePrueba();
let casa: JuegoSembrado;
let faro: JuegoSembrado;
let get: ReturnType<typeof consultar>;

beforeAll(async () => {
  casa = await juegoConSeed('la-casa-del-bosque', 80);
  faro = await juegoConSeed('faro-nocturno-demo', 40);
  get = consultar(app, await tokenAdmin(app));
});

const oraculos = {
  sesiones: (j: JuegoSembrado, f: FiltrosOraculo) => oraculoSesiones(j.datos, f, new Date()),
  'tiempo-nivel': (j: JuegoSembrado, f: FiltrosOraculo) => oraculoTiempoNivel(j.datos, j.catalogo, f),
  embudo: (j: JuegoSembrado, f: FiltrosOraculo) => oraculoEmbudo(j.datos, j.catalogo, f),
  muertes: (j: JuegoSembrado, f: FiltrosOraculo) => oraculoMuertes(j.datos, j.catalogo, f),
  logros: (j: JuegoSembrado, f: FiltrosOraculo) => oraculoLogros(j.datos, j.catalogo, f),
};
const METRICAS = Object.keys(oraculos) as (keyof typeof oraculos)[];

describe.each(METRICAS)('GET /estadisticas/:juegoId/%s', (metrica) => {
  it('con los datos del seed da exactamente los valores esperados (La Casa del Bosque)', async () => {
    const res = await get(casa.juegoId, metrica);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      juegoId: casa.juegoId,
      filtros: { desde: null, hasta: null, buildVersion: null, plataforma: null, origen: 'todos' },
      datos: oraculos[metrica](casa, {}),
    });
  });

  it('funciona con otro catálogo (Faro Nocturno: 4 niveles, otras causas y logros)', async () => {
    const res = await get(faro.juegoId, metrica);
    expect(res.body.datos).toEqual(oraculos[metrica](faro, {}));
  });

  it.each<[string, FiltrosOraculo]>([
    ['buildVersion=1.0.1', { buildVersion: '1.0.1' }],
    ['plataforma=android', { plataforma: 'android' }],
    ['origen=seed', { origen: 'seed' }],
    ['origen=real (sin datos reales)', { origen: 'real' }],
    ['buildVersion=1.0.0 + plataforma=windows', { buildVersion: '1.0.0', plataforma: 'windows' }],
  ])('respeta el filtro %s', async (_nombre, filtros) => {
    const res = await get(casa.juegoId, metrica, filtros as Record<string, string>);
    expect(res.status).toBe(200);
    expect(res.body.datos).toEqual(oraculos[metrica](casa, filtros));
    expect(res.body.filtros).toMatchObject(filtros);
  });

  it('respeta el rango desde/hasta (últimos 7 días del seed)', async () => {
    const hasta = new Date(Math.max(...casa.datos.eventos.map((e) => e.timestamp.getTime())) + 1).toISOString();
    const desde = new Date(new Date(hasta).getTime() - 7 * 86400e3).toISOString();
    const res = await get(casa.juegoId, metrica, { desde, hasta });
    expect(res.body.datos).toEqual(oraculos[metrica](casa, { desde, hasta }));
  });
});

describe('juego sin datos en el filtro (Faro con origen=real)', () => {
  const real = { origen: 'real' };

  it('sesiones: totales en cero, sin promedio ni mediana y el histograma completo en cero', async () => {
    expect((await get(faro.juegoId, 'sesiones', real)).body.datos).toEqual({
      sesiones: 0,
      jugadores: 0,
      promedioMs: null,
      medianaMs: null,
      inferidas: 0,
      distribucion: [0, 5, 10, 15, 20, 25, 30, 45, 60].map((m) => ({ desdeMs: m * 60000, sesiones: 0 })),
    });
  });

  it('embudo: un paso por nivel del catálogo más "terminaron", todos en cero', async () => {
    expect((await get(faro.juegoId, 'embudo', real)).body.datos).toEqual(
      ['muelle', 'escalera_faro', 'sala_lampara', 'azotea', 'terminaron'].map((paso) => ({ paso, jugadores: 0, porcentaje: 0 })),
    );
  });

  it('tiempo-nivel: los 4 niveles con intentos 0 y valores null', async () => {
    const tiempos = (await get(faro.juegoId, 'tiempo-nivel', real)).body.datos as unknown[];
    expect(tiempos).toHaveLength(4);
    expect(tiempos[0]).toEqual({
      nivelId: 'muelle',
      completado: { intentos: 0, promedioMs: null, medianaMs: null },
      muerte: { intentos: 0, promedioMs: null, medianaMs: null },
      abandono: { intentos: 0, promedioMs: null, medianaMs: null },
    });
  });

  it('muertes: lista vacía; logros: todos los del catálogo en 0 %', async () => {
    expect((await get(faro.juegoId, 'muertes', real)).body.datos).toEqual([]);
    expect((await get(faro.juegoId, 'logros', real)).body.datos).toEqual([
      { logroId: 'primer_paso', nombre: 'Primer paso', jugadores: 0, porcentaje: 0 },
      { logroId: 'luz_encendida', nombre: 'Luz encendida', jugadores: 0, porcentaje: 0 },
      { logroId: 'coleccionista', nombre: 'Coleccionista', jugadores: 0, porcentaje: 0 },
    ]);
  });
});

describe('validación y documentación', () => {
  it.each([
    [{ origen: 'importado' }],
    [{ plataforma: 'switch' }],
    [{ desde: '2026-10-01' }],
    [{ desde: '2026-10-10T00:00:00Z', hasta: '2026-10-01T00:00:00Z' }],
  ])('400 VALIDACION_FALLIDA con filtros inválidos %j', async (filtros) => {
    const res = await get(casa.juegoId, 'sesiones', filtros);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION_FALLIDA');
  });

  it('401 sin token y 400 si el juegoId no es UUID', async () => {
    expect((await request(app).get(`/api/v1/estadisticas/${casa.juegoId}/embudo`)).status).toBe(401);
    expect((await get('la-casa', 'embudo')).status).toBe(400);
  });

  it('OpenAPI documenta las 5 rutas con filtros, BearerAuth y el esquema de datos de cada una', async () => {
    const { body } = await request(app).get('/api/v1/docs/openapi.json');
    for (const [ruta, esquema] of [
      ['sesiones', 'DatosSesiones'],
      ['tiempo-nivel', 'DatosTiempoNivel'],
      ['embudo', 'DatosEmbudo'],
      ['muertes', 'DatosMuertes'],
      ['logros', 'DatosLogros'],
    ]) {
      const op = body.paths[`/estadisticas/{juegoId}/${ruta}`].get;
      expect(op.security).toEqual([{ BearerAuth: [] }]);
      expect((op.parameters as { name: string }[]).map((p) => p.name)).toEqual(['juegoId', 'desde', 'hasta', 'buildVersion', 'plataforma', 'origen']);
      expect(op.responses['200'].content['application/json'].schema.properties.datos).toEqual({ $ref: `#/components/schemas/${esquema}` });
    }
  });
});
