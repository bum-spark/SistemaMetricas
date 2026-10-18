import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JuegoModelo } from '../../src/modelos';
import { actualizarJuego, leerLimites } from '../../src/scripts/actualizarJuego';
import { crearJuego } from '../../src/scripts/crearJuego';
import { usarBdPrueba } from '../mongo/bdPrueba';
import { cabeceraPng } from './imagenes';

usarBdPrueba();

describe('actualizar-juego --nivel', () => {
  // Carpeta pública temporal con un PNG de 1200×300 (proporción 4:1).
  const publica = mkdtempSync(path.join(os.tmpdir(), 'xa-publica-'));
  mkdirSync(path.join(publica, 'niveles/la-casa-del-bosque'), { recursive: true });
  writeFileSync(path.join(publica, 'niveles/la-casa-del-bosque/casa_abandonada.png'), cabeceraPng(1200, 300));
  const actualizar = (cambios: Parameters<typeof actualizarJuego>[1]) => actualizarJuego('la-casa-del-bosque', cambios, { carpetaPublica: publica });
  const niveles = async () => (await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean())!.catalogo.niveles;

  it('cambia solo la imagen y los límites de ese nivel, e informa antes y después', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    const antes = await niveles();
    const r = await actualizar({
      nivel: { nivelId: 'casa_abandonada', imagenUrl: '/niveles/la-casa-del-bosque/casa_abandonada.png', limites: { minX: -2, maxX: 118, minY: 0, maxY: 30 } },
    });

    expect(r.nivel).toEqual({
      nivelId: 'casa_abandonada',
      antes: { imagenUrl: '/niveles/la-casa-del-bosque/casa_abandonada.svg', limites: { minX: 0, maxX: 120, minY: 0, maxY: 30 } },
      despues: { imagenUrl: '/niveles/la-casa-del-bosque/casa_abandonada.png', limites: { minX: -2, maxX: 118, minY: 0, maxY: 30 } },
    });
    expect(r.cambios.map((c) => c.campo)).toEqual(['nivel casa_abandonada.imagenUrl', 'nivel casa_abandonada.limites']);
    expect(r.avisos).toEqual([]);
    const despues = await niveles();
    expect(despues.find((n) => n.nivelId === 'casa_abandonada')).toMatchObject({
      imagenUrl: '/niveles/la-casa-del-bosque/casa_abandonada.png',
      limites: { minX: -2, maxX: 118, minY: 0, maxY: 30 },
      nombre: 'Casa abandonada',
      orden: 1,
    });
    // Los demás niveles quedan idénticos.
    expect(despues.filter((n) => n.nivelId !== 'casa_abandonada')).toEqual(antes.filter((n) => n.nivelId !== 'casa_abandonada'));
  });

  it('solo los límites, sin tocar la imagen; si ya son iguales no escribe', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    expect((await actualizar({ nivel: { nivelId: 'hospital_cuarto', limites: { minX: 0, maxX: 100, minY: 0, maxY: 30 } } })).cambios).toEqual([]);
    const r = await actualizar({ nivel: { nivelId: 'hospital_cuarto', limites: { minX: 0, maxX: 90, minY: 0, maxY: 30 } } });
    expect(r.cambios).toEqual([{ campo: 'nivel hospital_cuarto.limites', antes: '0,100,0,30', despues: '0,90,0,30' }]);
    expect((await niveles()).find((n) => n.nivelId === 'hospital_cuarto')!.imagenUrl).toBe('/niveles/la-casa-del-bosque/hospital_cuarto.svg');
  });

  it('avisa si la proporción de la imagen difiere más de 2 % de la de los límites (sin impedir el cambio)', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    const ok = await actualizar({
      nivel: { nivelId: 'casa_abandonada', imagenUrl: '/niveles/la-casa-del-bosque/casa_abandonada.png', limites: { minX: 0, maxX: 121, minY: 0, maxY: 30 } },
    });
    expect(ok.avisos).toEqual([]); // 0.8 %
    const mal = await actualizar({ nivel: { nivelId: 'casa_abandonada', limites: { minX: 0, maxX: 100, minY: 0, maxY: 30 } } });
    expect(mal.avisos).toHaveLength(1);
    expect(mal.avisos[0]).toMatch(/1200×300 px.*difiere 20\.0 %/);
    expect(mal.cambios).toHaveLength(1);
  });

  it('avisa si la imagen no está en dashboard/public', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    const r = await actualizar({ nivel: { nivelId: 'casa_abandonada', imagenUrl: '/niveles/la-casa-del-bosque/no-subida.webp' } });
    expect(r.avisos[0]).toMatch(/no existe en dashboard\/public/);
  });

  it('valida el nivel, imagenUrl como la API y la ruta convertida por Git Bash, sin escribir nada', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    const antes = await niveles();
    await expect(actualizar({ nivel: { nivelId: 'sotano', limites: { minX: 0, maxX: 1, minY: 0, maxY: 1 } } })).rejects.toThrow(/no existe en el catálogo.*casa_abandonada/);
    await expect(actualizar({ nivel: { nivelId: 'casa_abandonada', imagenUrl: 'niveles/sin-barra.png' } })).rejects.toThrow(/imagenUrl: .*http\(s\)/);
    await expect(actualizar({ nivel: { nivelId: 'casa_abandonada', imagenUrl: 'C:/Program Files/Git/niveles/la-casa-del-bosque/x.png' } })).rejects.toThrow(/MSYS_NO_PATHCONV=1/);
    await expect(actualizar({ nivel: { nivelId: 'casa_abandonada' } })).rejects.toThrow(/No hay nada que cambiar en el nivel/);
    expect(await niveles()).toEqual(antes);
  });

  it('leerLimites exige 4 números y min < max', () => {
    expect(leerLimites('-2.5, 118, 0 ,30')).toEqual({ minX: -2.5, maxX: 118, minY: 0, maxY: 30 });
    expect(() => leerLimites('0,120,0')).toThrow(/4 números/);
    expect(() => leerLimites('0,120,0,abc')).toThrow(/4 números/);
    expect(() => leerLimites('0,120,0,')).toThrow(/4 números/);
    expect(() => leerLimites('120,0,0,30')).toThrow(/minX < maxX/);
    expect(() => leerLimites('0,120,30,30')).toThrow(/minY < maxY/);
  });
});

describe('actualizar-juego', () => {
  it('pone logoUrl a un juego creado sin él y solo cambia ese campo', async () => {
    const { juegoId } = await crearJuego({ slug: 'la-casa-del-bosque' });
    await JuegoModelo.updateOne({ juegoId }, { $unset: { logoUrl: '' } });
    const antes = (await JuegoModelo.findOne({ juegoId }).lean())!;

    const r = await actualizarJuego('la-casa-del-bosque', { logoUrl: '/logos/la-casa-del-bosque/logo.png' });

    expect(r.cambios).toEqual([{ campo: 'logoUrl', antes: null, despues: '/logos/la-casa-del-bosque/logo.png' }]);
    const despues = (await JuegoModelo.findOne({ juegoId }).lean())!;
    expect(despues.logoUrl).toBe('/logos/la-casa-del-bosque/logo.png');
    const { logoUrl: _a, ...restoAntes } = antes;
    const { logoUrl: _d, ...restoDespues } = despues;
    expect(restoDespues).toEqual(restoAntes);
  });

  it('acepta una URL https y no hace nada si el valor ya es el mismo', async () => {
    await crearJuego({ slug: 'faro-nocturno-demo' });
    expect((await actualizarJuego('faro-nocturno-demo', { logoUrl: 'https://cdn.ejemplo.com/faro.png' })).cambios).toHaveLength(1);
    expect((await actualizarJuego('faro-nocturno-demo', { logoUrl: 'https://cdn.ejemplo.com/faro.png' })).cambios).toEqual([]);
  });

  it('valida logoUrl igual que la API', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    await expect(actualizarJuego('la-casa-del-bosque', { logoUrl: '/logos/otro-juego/logo.png' })).rejects.toThrow(/slug del juego/);
    await expect(actualizarJuego('la-casa-del-bosque', { logoUrl: 'http://inseguro.com/logo.png' })).rejects.toThrow(/URL https/);
    expect((await JuegoModelo.findOne({ slug: 'la-casa-del-bosque' }).lean())!.logoUrl).toBe('/logos/la-casa-del-bosque/logo.png');
  });

  it('explica la ruta convertida por Git Bash, el juego inexistente y la falta de cambios', async () => {
    await crearJuego({ slug: 'la-casa-del-bosque' });
    await expect(actualizarJuego('la-casa-del-bosque', { logoUrl: 'C:/Program Files/Git/logos/la-casa-del-bosque/logo.png' })).rejects.toThrow(
      /MSYS_NO_PATHCONV=1/,
    );
    await expect(actualizarJuego('no-existe', { logoUrl: '/logos/no-existe/logo.png' })).rejects.toThrow(/No existe un juego/);
    await expect(actualizarJuego('la-casa-del-bosque', {})).rejects.toThrow(/No hay nada que cambiar/);
  });
});
