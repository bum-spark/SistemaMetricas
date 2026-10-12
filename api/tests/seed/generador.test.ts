import { CATALOGOS } from '../../src/catalogos';
import { esquemaCatalogo } from '../../src/dominio/catalogo';
import { validarEvento } from '../../src/dominio/eventos';
import { DIAS_DE_DATOS, generarDatosSeed, type DatosSeed } from '../../src/seed/generador';
import { medirSeed } from '../../src/seed/metricas';
import { PERFIL_FARO_NOCTURNO_DEMO, PERFIL_LA_CASA_DEL_BOSQUE, type PerfilJuego } from '../../src/seed/perfiles';

const REFERENCIA = new Date('2026-10-12T00:00:00.000Z');
const JUEGO_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function generar(perfil: PerfilJuego, semilla = 42): { datos: DatosSeed; catalogo: ReturnType<typeof esquemaCatalogo.parse> } {
  const catalogo = esquemaCatalogo.parse(CATALOGOS[perfil.slug]!.catalogo);
  return { datos: generarDatosSeed({ juegoId: JUEGO_ID, catalogo, perfil, semilla, referencia: REFERENCIA }), catalogo };
}

const casa = generar(PERFIL_LA_CASA_DEL_BOSQUE);
const faro = generar(PERFIL_FARO_NOCTURNO_DEMO);

describe.each([
  ['La Casa del Bosque', casa, PERFIL_LA_CASA_DEL_BOSQUE],
  ['Faro Nocturno (demo)', faro, PERFIL_FARO_NOCTURNO_DEMO],
])('seed de %s', (_nombre, { datos, catalogo }, perfil) => {
  it('es determinista: la misma semilla produce exactamente los mismos datos', () => {
    expect(generar(perfil, 42).datos).toEqual(datos);
  });

  it('otra semilla produce datos distintos', () => {
    expect(generar(perfil, 7).datos.eventos[0]!.eventoId).not.toBe(datos.eventos[0]!.eventoId);
  });

  it('cada evento pasa la misma validación que la ingesta (tipos, campos, catálogo)', () => {
    const rechazados = datos.eventos
      .map((e) => {
        const crudo = { ...e, timestamp: e.timestamp.toISOString(), recibidoEn: undefined, origen: undefined };
        delete crudo.recibidoEn;
        delete crudo.origen;
        const r = validarEvento(crudo, { juegoId: JUEGO_ID, catalogo, ahora: new Date(e.timestamp.getTime() + 3600e3) });
        return r.ok ? null : `${e.tipo}: ${r.rechazo.mensaje}`;
      })
      .filter(Boolean);
    expect(rechazados).toEqual([]);
  });

  it('todo va con origen "seed" y referencias consistentes (jugador → sesión → evento)', () => {
    const jugadores = new Set(datos.jugadores.map((j) => j.playerId));
    const sesiones = new Map(datos.sesiones.map((s) => [s.sessionId, s.playerId]));
    expect(datos.jugadores.every((j) => j.origen === 'seed' && j.consentimiento)).toBe(true);
    expect(datos.sesiones.every((s) => s.origen === 'seed' && jugadores.has(s.playerId))).toBe(true);
    expect(datos.eventos.every((e) => e.origen === 'seed' && sesiones.get(e.sessionId) === e.playerId)).toBe(true);
    expect(new Set(datos.eventos.map((e) => e.eventoId)).size).toBe(datos.eventos.length);
  });

  it('la secuencia va de 1 en 1 por sesión, con timestamps que no retroceden', () => {
    const porSesion = new Map<string, typeof datos.eventos>();
    for (const e of datos.eventos) {
      porSesion.set(e.sessionId, [...(porSesion.get(e.sessionId) ?? []), e]);
    }
    for (const eventos of porSesion.values()) {
      expect(eventos.map((e) => e.secuencia)).toEqual(eventos.map((_, i) => i + 1));
      expect(eventos[0]!.tipo).toBe('sesion_inicio');
      for (let i = 1; i < eventos.length; i++) {
        expect(eventos[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(eventos[i - 1]!.timestamp.getTime());
      }
    }
  });

  it('los campos de la sesión salen de sus eventos (relojes de R-34)', () => {
    for (const s of datos.sesiones) {
      const eventos = datos.eventos.filter((e) => e.sessionId === s.sessionId);
      expect(s.inicio).toEqual(eventos[0]!.timestamp);
      expect(s.ultimoEventoEn.getTime()).toBe(Math.max(...eventos.map((e) => e.timestamp.getTime())));
      expect(s.ultimoRecibidoEn.getTime()).toBe(Math.max(...eventos.map((e) => e.recibidoEn.getTime())));
      expect(s.fin === null).toBe(!eventos.some((e) => e.tipo === 'sesion_fin'));
    }
  });

  it('los logros obtenidos son únicos por jugador y cada uno tiene su evento logro', () => {
    const claves = datos.logros.map((l) => `${l.playerId}:${l.logroId}`);
    expect(new Set(claves).size).toBe(claves.length);
    const eventosLogro = new Set(datos.eventos.filter((e) => e.tipo === 'logro').map((e) => `${e.playerId}:${String(e.data.logroId)}`));
    expect(claves.every((c) => eventosLogro.has(c))).toBe(true);
  });

  it(`cubre los últimos ${DIAS_DE_DATOS} días antes de la referencia`, () => {
    const { rangoFechas } = medirSeed(datos, catalogo, perfil);
    expect(rangoFechas.desde.getTime()).toBeGreaterThanOrEqual(REFERENCIA.getTime() - DIAS_DE_DATOS * 86400e3);
    expect(rangoFechas.desde.getTime()).toBeLessThan(REFERENCIA.getTime() - (DIAS_DE_DATOS - 1) * 86400e3);
    expect(rangoFechas.hasta.getTime()).toBeLessThan(REFERENCIA.getTime());
    expect(rangoFechas.hasta.getTime()).toBeGreaterThan(REFERENCIA.getTime() - 86400e3);
  });

  it('tiene sesiones con crash (sin sesion_fin), plataformas variadas y las dos builds', () => {
    const m = medirSeed(datos, catalogo, perfil);
    expect(m.fraccionCrash).toBeGreaterThan(0.04);
    expect(m.fraccionCrash).toBeLessThan(0.18);
    expect(m.plataformas.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(m.porBuild).sort()).toEqual(['1.0.0', '1.0.1']);
  });

  it('la build 1.0.1 es mejor: más jugadores terminan y hay menos muertes por nivel', () => {
    const { porBuild } = medirSeed(datos, catalogo, perfil);
    expect(porBuild['1.0.1']!.tasaTermino).toBeGreaterThan(porBuild['1.0.0']!.tasaTermino);
    expect(porBuild['1.0.1']!.muertesPorNivelIniciado).toBeLessThan(porBuild['1.0.0']!.muertesPorNivelIniciado);
  });

  it('las muertes se concentran en las zonas calientes de cada nivel (mapa de calor)', () => {
    const { muertesEnZonas } = medirSeed(datos, catalogo, perfil);
    expect(Object.keys(muertesEnZonas).sort()).toEqual(perfil.niveles.map((n) => n.nivelId).sort());
    for (const fraccion of Object.values(muertesEnZonas)) {
      expect(fraccion).toBeGreaterThan(0.65);
    }
  });

  it('las coordenadas de muerte están dentro de los límites del nivel', () => {
    for (const e of datos.eventos.filter((ev) => ev.tipo === 'muerte')) {
      const l = catalogo.niveles.find((n) => n.nivelId === e.data.nivelId)!.limites!;
      expect(e.data.x as number).toBeGreaterThanOrEqual(l.minX);
      expect(e.data.x as number).toBeLessThanOrEqual(l.maxX);
      expect(e.data.y as number).toBeGreaterThanOrEqual(l.minY);
      expect(e.data.y as number).toBeLessThanOrEqual(l.maxY);
    }
  });

  it('la mediana de duración de sesión queda cerca de duracionEsperadaMs (±25 %)', () => {
    const { medianaDuracionMs } = medirSeed(datos, catalogo, perfil);
    const esperada = catalogo.duracionEsperadaMs!;
    expect(medianaDuracionMs).toBeGreaterThan(esperada * 0.75);
    expect(medianaDuracionMs).toBeLessThan(esperada * 1.25);
  });
});

describe('forma del embudo', () => {
  it('La Casa del Bosque ≈ 100 % → 70 % → 45 % → 30 % terminan (±7 puntos)', () => {
    const m = medirSeed(casa.datos, casa.catalogo, PERFIL_LA_CASA_DEL_BOSQUE);
    const [n1, n2, n3] = m.embudo.map((e) => e.porcentaje);
    expect(n1).toBe(100);
    expect(Math.abs(n2! - 70)).toBeLessThanOrEqual(7);
    expect(Math.abs(n3! - 45)).toBeLessThanOrEqual(7);
    expect(Math.abs(m.terminaron - 30)).toBeLessThanOrEqual(7);
  });

  it('Faro Nocturno (demo) decrece nivel a nivel, sin tutorial ni flor', () => {
    const m = medirSeed(faro.datos, faro.catalogo, PERFIL_FARO_NOCTURNO_DEMO);
    const valores = [...m.embudo.map((e) => e.porcentaje), m.terminaron];
    expect(valores[0]).toBe(100);
    for (let i = 1; i < valores.length; i++) {
      expect(valores[i]!).toBeLessThan(valores[i - 1]!);
    }
    expect(faro.datos.eventos.some((e) => e.tipo === 'flor_recogida' || e.tipo === 'tutorial_completado')).toBe(false);
  });

  it('La Casa del Bosque incluye tutorial, flor, pétalos, piezas de carta y el logro la_verdad', () => {
    const tipos = new Set(casa.datos.eventos.map((e) => e.tipo));
    expect([...tipos]).toEqual(expect.arrayContaining(['tutorial_completado', 'flor_recogida', 'coleccionable_encontrado', 'dialogo_saltado', 'pausa', 'rendimiento', 'error']));
    expect(casa.datos.logros.some((l) => l.logroId === 'la_verdad')).toBe(true);
  });
});
