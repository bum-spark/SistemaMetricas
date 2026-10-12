import request from 'supertest';
import { duracionesDeSesiones } from '../../src/estadisticas/duracionSesiones';
import { SesionModelo } from '../../src/modelos';
import { crearAppDePrueba } from '../helpers';
import { abrirSesion, evento, loteEjemplo, prepararJuego, type Contexto, type JuegoPrueba } from '../ingesta/helpers';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

const { app } = crearAppDePrueba();
let juego: JuegoPrueba;

beforeEach(async () => {
  juego = await prepararJuego();
});

const minutos = (n: number) => n * 60 * 1000;
const enviar = (cuerpo: unknown) => request(app).post('/api/v1/eventos').set('X-Api-Key', juego.apiKey).send(cuerpo as object);

async function nuevaSesion(): Promise<Contexto> {
  return { juegoId: juego.juegoId, ...(await abrirSesion(app, juego)) };
}

// Evento con un timestamp de cliente explícito.
const en = (ctx: Contexto, secuencia: number, fechaCliente: Date, tipo: string, data: Record<string, unknown> = {}) =>
  evento(ctx, secuencia, tipo, data, { timestamp: fechaCliente.toISOString() });

describe('duración de sesiones con relojes separados (R-34)', () => {
  it('sesión cerrada: duración = fin − inicio y finInferido false, aunque se acabe de recibir', async () => {
    const ctx = await nuevaSesion();
    const lote = loteEjemplo(ctx); // secuencias 1..11, un segundo entre eventos
    await enviar(lote);

    const [d] = await duracionesDeSesiones(juego.juegoId, new Date());
    expect(d).toEqual({ sessionId: ctx.sessionId, duracionMs: 10_000, finInferido: false });
  });

  it('sesión con crash: activa mientras se reciben eventos; después de 30 min sin recibir, termina con el último timestamp del cliente', async () => {
    const ctx = await nuevaSesion();
    const t0 = new Date(Date.now() - minutos(20));
    await enviar([
      en(ctx, 1, t0, 'sesion_inicio'),
      en(ctx, 2, new Date(t0.getTime() + minutos(3)), 'nivel_inicio', { nivelId: 'casa_abandonada', intento: 1 }),
      en(ctx, 3, new Date(t0.getTime() + minutos(7)), 'pausa', { duracionMs: 1000 }),
    ]);

    // Recién recibida: todavía activa, no entra.
    expect(await duracionesDeSesiones(juego.juegoId, new Date())).toEqual([]);
    // 31 min después de la última ingesta (hora del servidor): terminada por inferencia.
    const despues = new Date(Date.now() + minutos(31));
    expect(await duracionesDeSesiones(juego.juegoId, despues)).toEqual([
      { sessionId: ctx.sessionId, duracionMs: minutos(7), finInferido: true },
    ]);
  });

  it('sesión sin eventos o sin sesion_inicio: no entra en las métricas de duración', async () => {
    await nuevaSesion(); // sin ningún evento
    const sinInicio = await nuevaSesion();
    await enviar([evento(sinInicio, 1, 'pausa', { duracionMs: 5 })]); // eventos, pero sin sesion_inicio

    const muchoDespues = new Date(Date.now() + minutos(120));
    expect(await duracionesDeSesiones(juego.juegoId, muchoDespues)).toEqual([]);
    expect(await SesionModelo.countDocuments({ juegoId: juego.juegoId })).toBe(2);
  });

  it('reloj del cliente atrasado 2 h: la duración sale de los timestamps del cliente y el fin lo decide el servidor', async () => {
    const ctx = await nuevaSesion();
    const atrasado = new Date(Date.now() - minutos(120)); // el reloj del dispositivo va 2 h tarde
    await enviar([
      en(ctx, 1, atrasado, 'sesion_inicio'),
      en(ctx, 2, new Date(atrasado.getTime() + minutos(12)), 'nivel_inicio', { nivelId: 'casa_abandonada', intento: 1 }),
    ]);

    const sesion = await SesionModelo.findOne({ sessionId: ctx.sessionId }).lean();
    expect(sesion?.ultimoEventoEn).toEqual(new Date(atrasado.getTime() + minutos(12)));
    expect(sesion!.ultimoRecibidoEn!.getTime()).toBeGreaterThan(Date.now() - minutos(1));

    // Con el reloj mezclado, el último timestamp (hace 1 h 48 min) la habría dado por terminada ya.
    // Con relojes separados sigue activa: se recibió hace segundos.
    expect(await duracionesDeSesiones(juego.juegoId, new Date(Date.now() + minutos(10)))).toEqual([]);

    // Pasados 30 min sin recibir nada, termina, con la duración real según el juego: 12 min.
    expect(await duracionesDeSesiones(juego.juegoId, new Date(Date.now() + minutos(31)))).toEqual([
      { sessionId: ctx.sessionId, duracionMs: minutos(12), finInferido: true },
    ]);
  });

  it('una sesión cerrada con el reloj atrasado da la duración correcta (no se mezcla con creadaEn)', async () => {
    const ctx = await nuevaSesion();
    const atrasado = new Date(Date.now() - minutos(90));
    await enviar([en(ctx, 1, atrasado, 'sesion_inicio'), en(ctx, 2, new Date(atrasado.getTime() + minutos(18)), 'sesion_fin', { motivo: 'cierre_normal' })]);

    expect(await duracionesDeSesiones(juego.juegoId, new Date())).toEqual([
      { sessionId: ctx.sessionId, duracionMs: minutos(18), finInferido: false },
    ]);
  });
});
