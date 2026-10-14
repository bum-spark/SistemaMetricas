import { JuegoModelo } from '../../src/modelos';
import { actualizarJuego } from '../../src/scripts/actualizarJuego';
import { crearJuego } from '../../src/scripts/crearJuego';
import { usarBdPrueba } from '../mongo/bdPrueba';

usarBdPrueba();

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
