import { describirProblemas, esquemaCatalogo } from '../../src/dominio/catalogo';
import { catalogoMinimo } from '../modelos/fixtures';

function problemas(catalogo: unknown): string {
  const resultado = esquemaCatalogo.safeParse(catalogo);
  return resultado.success ? '' : describirProblemas(resultado.error);
}

describe('esquemaCatalogo', () => {
  it('acepta un catálogo válido y completa valores por defecto', () => {
    const resultado = esquemaCatalogo.parse(catalogoMinimo());
    expect(resultado.niveles[1]).toMatchObject({ descripcion: '', tieneTutorial: false });
  });

  it('acepta un catálogo sin duracionEsperadaMs (es opcional)', () => {
    const { duracionEsperadaMs: _omitida, ...sinDuracion } = catalogoMinimo();
    expect(esquemaCatalogo.safeParse(sinDuracion).success).toBe(true);
  });

  it('rechaza duracionEsperadaMs no positiva', () => {
    expect(problemas({ ...catalogoMinimo(), duracionEsperadaMs: 0 })).toMatch(/duracionEsperadaMs/);
  });

  it('rechaza tipos de evento que la API no sabe validar', () => {
    expect(problemas({ ...catalogoMinimo(), tiposEvento: ['sesion_inicio', 'palanca_activada'] })).toMatch(/tiposEvento/);
  });

  it('rechaza nivelId y orden repetidos', () => {
    const catalogo = catalogoMinimo();
    catalogo.niveles.push({ nivelId: 'nivel_uno', nombre: 'Copia', orden: 2 });
    const texto = problemas(catalogo);
    expect(texto).toMatch(/valor repetido: nivel_uno/);
    expect(texto).toMatch(/valor repetido: 2/);
  });

  it('rechaza logros y coleccionables que apuntan a niveles inexistentes', () => {
    const catalogo = catalogoMinimo();
    catalogo.logros = [{ logroId: 'fantasma', nombre: 'X', nivelId: 'nivel_tres' }];
    catalogo.coleccionables = [{ coleccionableId: 'gema_9', nivelId: 'nivel_tres', nombre: 'Gema' }];
    const texto = problemas(catalogo);
    expect(texto).toMatch(/logros\.0\.nivelId: nivel inexistente: nivel_tres/);
    expect(texto).toMatch(/coleccionables\.0\.nivelId: nivel inexistente: nivel_tres/);
  });

  it('exige IDs en snake_case', () => {
    const catalogo = catalogoMinimo();
    catalogo.causasMuerte = [{ causa: 'Caída Libre', nombre: 'Caída' }];
    expect(problemas(catalogo)).toMatch(/causasMuerte\.0\.causa: debe estar en snake_case/);
  });

  it('rechaza límites del mapa de calor invertidos', () => {
    const catalogo = catalogoMinimo();
    catalogo.niveles[0] = { ...catalogo.niveles[0]!, limites: { minX: 10, maxX: 0, minY: 0, maxY: 5 } };
    expect(problemas(catalogo)).toMatch(/niveles\.0\.limites/);
  });
});
