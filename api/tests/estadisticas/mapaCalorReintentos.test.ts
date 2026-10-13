import request from 'supertest';
import { crearAppDePrueba } from '../helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { consultar, juegoConSeed, tokenAdmin, type JuegoSembrado } from './helpers';
import { oraculoMapaCalor, oraculoReintentos, type FiltrosOraculo } from './oraculo';

// Solo lectura: el seed (semilla fija) se inserta una vez para todo el archivo.
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

const FILTROS: [string, FiltrosOraculo][] = [
  ['sin filtros', {}],
  ['buildVersion=1.0.1', { buildVersion: '1.0.1' }],
  ['plataforma=windows', { plataforma: 'windows' }],
  ['origen=seed', { origen: 'seed' }],
  ['origen=real (sin datos reales)', { origen: 'real' }],
];

describe('GET /estadisticas/:juegoId/mapa-calor', () => {
  it.each(['casa_abandonada', 'hospital_cuarto', 'habitacion_llamas'])('%s con celda 1: valores exactos y forma completa', async (nivelId) => {
    const res = await get(casa.juegoId, 'mapa-calor', { nivelId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      juegoId: casa.juegoId,
      filtros: { desde: null, hasta: null, buildVersion: null, plataforma: null, origen: 'todos', nivelId, celda: 1 },
      datos: oraculoMapaCalor(casa.datos, casa.catalogo, {}, nivelId, 1),
    });
    expect(res.body.datos.imagenUrl).toBe(`/niveles/la-casa-del-bosque/${nivelId}.svg`);
  });

  it.each([0.5, 2.5, 5, 20])('agrupa con celda %s y conserva el total de muertes', async (celda) => {
    const res = await get(casa.juegoId, 'mapa-calor', { nivelId: 'habitacion_llamas', celda: String(celda) });
    const esperado = oraculoMapaCalor(casa.datos, casa.catalogo, {}, 'habitacion_llamas', celda);
    expect(res.body.datos).toEqual(esperado);
    expect(esperado.totalMuertes).toBe(oraculoMapaCalor(casa.datos, casa.catalogo, {}, 'habitacion_llamas', 1).totalMuertes);
  });

  it.each(FILTROS)('respeta el filtro %s', async (_n, filtros) => {
    const res = await get(casa.juegoId, 'mapa-calor', { ...(filtros as Record<string, string>), nivelId: 'casa_abandonada' });
    expect(res.body.datos).toEqual(oraculoMapaCalor(casa.datos, casa.catalogo, filtros, 'casa_abandonada', 1));
  });

  it('otro catálogo (Faro, nivel vertical escalera_faro)', async () => {
    const res = await get(faro.juegoId, 'mapa-calor', { nivelId: 'escalera_faro', celda: '3' });
    expect(res.body.datos).toEqual(oraculoMapaCalor(faro.datos, faro.catalogo, {}, 'escalera_faro', 3));
    expect(res.body.datos.limites).toEqual({ minX: 0, maxX: 30, minY: 0, maxY: 90 });
  });

  it('las celdas más pobladas caen en las zonas calientes del seed (puntos calientes)', async () => {
    const { celdas } = (await get(casa.juegoId, 'mapa-calor', { nivelId: 'casa_abandonada', celda: '5' })).body.datos as {
      celdas: { x: number; y: number; muertes: number }[];
    };
    const top = [...celdas].sort((a, b) => b.muertes - a.muertes)[0]!;
    // Zona principal del perfil: fantasma en (46, 6) → celda (45, 5) con celda 5.
    expect([top.x, top.y]).toEqual([45, 5]);
  });

  it('sin muertes en el filtro: celdas vacías y total 0, pero con imagen y límites', async () => {
    const res = await get(casa.juegoId, 'mapa-calor', { nivelId: 'casa_abandonada', origen: 'real' });
    expect(res.body.datos).toMatchObject({ totalMuertes: 0, celdas: [], imagenUrl: '/niveles/la-casa-del-bosque/casa_abandonada.svg' });
  });

  it.each([
    ['falta nivelId', {}, /nivelId/],
    ['nivelId fuera del catálogo', { nivelId: 'sotano' }, /no está en el catálogo/],
    ['nivelId de otro juego', { nivelId: 'muelle' }, /no está en el catálogo/],
    ['celda 0', { nivelId: 'casa_abandonada', celda: '0' }, /celda/],
    ['celda no numérica', { nivelId: 'casa_abandonada', celda: 'grande' }, /celda/],
  ])('400 VALIDACION_FALLIDA si %s', async (_n, consulta, mensaje) => {
    const res = await get(casa.juegoId, 'mapa-calor', consulta);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION_FALLIDA');
    expect(JSON.stringify(res.body.error)).toMatch(mensaje);
  });
});

describe('GET /estadisticas/:juegoId/reintentos', () => {
  it.each(FILTROS)('valores exactos con %s (La Casa del Bosque)', async (_n, filtros) => {
    const res = await get(casa.juegoId, 'reintentos', filtros as Record<string, string>);
    expect(res.status).toBe(200);
    expect(res.body.datos).toEqual(oraculoReintentos(casa.datos, casa.catalogo, filtros));
  });

  it('otro catálogo (Faro: 4 niveles)', async () => {
    const res = await get(faro.juegoId, 'reintentos');
    expect(res.body.datos).toEqual(oraculoReintentos(faro.datos, faro.catalogo, {}));
    expect(res.body.datos).toHaveLength(4);
  });

  it('respeta el rango desde/hasta', async () => {
    const hasta = new Date(Math.max(...casa.datos.eventos.map((e) => e.timestamp.getTime())) + 1).toISOString();
    const desde = new Date(new Date(hasta).getTime() - 5 * 86400e3).toISOString();
    const res = await get(casa.juegoId, 'reintentos', { desde, hasta });
    expect(res.body.datos).toEqual(oraculoReintentos(casa.datos, casa.catalogo, { desde, hasta }));
  });

  it('con la build 1.0.1 quienes pasan necesitan menos intentos que con la 1.0.0 (forma del seed)', async () => {
    const promedio = async (build: string) =>
      ((await get(casa.juegoId, 'reintentos', { buildVersion: build })).body.datos as { pasaron: { promedioIntentos: number } }[])[2]!.pasaron.promedioIntentos;
    expect(await promedio('1.0.1')).toBeLessThan(await promedio('1.0.0'));
  });

  it('sin datos: cada nivel con sesiones 0, valores null y los 4 grupos de la distribución en 0', async () => {
    const res = await get(faro.juegoId, 'reintentos', { origen: 'real' });
    const vacia = [
      { minimo: 1, maximo: 1, sesiones: 0 },
      { minimo: 2, maximo: 3, sesiones: 0 },
      { minimo: 4, maximo: 6, sesiones: 0 },
      { minimo: 7, maximo: null, sesiones: 0 },
    ];
    expect(res.body.datos[0]).toEqual({
      nivelId: 'muelle',
      pasaron: { sesiones: 0, promedioIntentos: null, maxIntentos: null, distribucion: vacia },
      seRindieron: { sesiones: 0, promedioIntentos: null, maxIntentos: null, distribucion: vacia },
    });
  });

  it('la distribución suma las sesiones de cada grupo y usa los límites 1, 2–3, 4–6 y 7+', async () => {
    const datos = (await get(casa.juegoId, 'reintentos')).body.datos as {
      pasaron: { sesiones: number; distribucion: { minimo: number; maximo: number | null; sesiones: number }[] };
      seRindieron: { sesiones: number; distribucion: { sesiones: number }[] };
    }[];
    for (const nivel of datos) {
      expect(nivel.pasaron.distribucion.map((g) => [g.minimo, g.maximo])).toEqual([[1, 1], [2, 3], [4, 6], [7, null]]);
      expect(nivel.pasaron.distribucion.reduce((s, g) => s + g.sesiones, 0)).toBe(nivel.pasaron.sesiones);
      expect(nivel.seRindieron.distribucion.reduce((s, g) => s + g.sesiones, 0)).toBe(nivel.seRindieron.sesiones);
    }
    // El seed tiene sesiones que pasan a la primera.
    expect(datos[0]!.pasaron.distribucion[0]!.sesiones).toBeGreaterThan(0);
  });
});

describe('OpenAPI', () => {
  it('mapa-calor documenta nivelId (obligatorio) y celda además de los filtros comunes; reintentos, solo los comunes', async () => {
    const { body } = await request(app).get('/api/v1/docs/openapi.json');
    const mapa = body.paths['/estadisticas/{juegoId}/mapa-calor'].get;
    expect((mapa.parameters as { name: string; required?: boolean }[]).map((p) => p.name)).toEqual([
      'juegoId', 'desde', 'hasta', 'buildVersion', 'plataforma', 'origen', 'nivelId', 'celda',
    ]);
    expect((mapa.parameters as { name: string; required?: boolean }[]).find((p) => p.name === 'nivelId')?.required).toBe(true);
    expect(mapa.responses['200'].content['application/json'].schema.properties.datos).toEqual({ $ref: '#/components/schemas/DatosMapaCalor' });
    expect(body.paths['/estadisticas/{juegoId}/reintentos'].get.responses['200'].content['application/json'].schema.properties.datos).toEqual({
      $ref: '#/components/schemas/DatosReintentos',
    });
  });
});
