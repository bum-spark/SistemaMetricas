import { CATALOGOS, FARO_NOCTURNO_DEMO, LA_CASA_DEL_BOSQUE } from '../../src/catalogos';
import { esquemaCatalogo } from '../../src/dominio/catalogo';

describe('catálogos de los juegos', () => {
  it.each(Object.entries(CATALOGOS))('%s es un catálogo válido', (_slug, definicion) => {
    const resultado = esquemaCatalogo.safeParse(definicion.catalogo);
    expect(resultado.success).toBe(true);
  });

  it('están registrados por su slug', () => {
    expect(Object.keys(CATALOGOS).sort()).toEqual(['faro-nocturno-demo', 'la-casa-del-bosque']);
  });

  it('La Casa del Bosque trae su logo del dashboard; Faro Nocturno (demo) no tiene logo', () => {
    expect(LA_CASA_DEL_BOSQUE.logoUrl).toBe('/logos/la-casa-del-bosque/logo.png');
    expect(FARO_NOCTURNO_DEMO.logoUrl).toBeUndefined();
  });
});

describe('La Casa del Bosque (ESQUEMA_EVENTOS.md §5.1)', () => {
  const c = esquemaCatalogo.parse(LA_CASA_DEL_BOSQUE.catalogo);

  it('tiene los niveles en el orden definitivo, con el tutorial en el primero', () => {
    expect([...c.niveles].sort((a, b) => a.orden - b.orden).map((n) => n.nivelId)).toEqual([
      'casa_abandonada',
      'hospital_cuarto',
      'habitacion_llamas',
    ]);
    expect(c.niveles.filter((n) => n.tieneTutorial).map((n) => n.nivelId)).toEqual(['casa_abandonada']);
  });

  it('tiene los 5 logros definidos y no incluye suelo_descubierto (A-06)', () => {
    expect(c.logros.map((l) => l.logroId)).toEqual([
      'tutorial_superado',
      'casa_abandonada_completada',
      'hospital_cuarto_completado',
      'habitacion_llamas_completada',
      'la_verdad',
    ]);
    expect(c.logros.find((l) => l.logroId === 'la_verdad')).toMatchObject({
      nombre: 'La verdad',
      descripcion: 'Reconstruye la carta con todas las piezas de la habitación en llamas',
    });
  });

  it('tiene 4 piezas de carta en habitacion_llamas y 4 pétalos en hospital_cuarto', () => {
    const por = (nivel: string) => c.coleccionables.filter((x) => x.nivelId === nivel).map((x) => x.coleccionableId);
    expect(por('habitacion_llamas')).toEqual(['carta_pieza_1', 'carta_pieza_2', 'carta_pieza_3', 'carta_pieza_4']);
    expect(por('hospital_cuarto')).toEqual(['petalo_1', 'petalo_2', 'petalo_3', 'petalo_4']);
  });

  it('tiene duración esperada de 20 min, causas fantasma/lava/caída y sus 4 eventos específicos', () => {
    expect(c.duracionEsperadaMs).toBe(1200000);
    expect(c.causasMuerte.map((x) => x.causa)).toEqual(['fantasma', 'lava', 'caida']);
    expect(c.tiposEvento).toEqual(
      expect.arrayContaining(['flor_recogida', 'dialogo_saltado', 'coleccionable_encontrado', 'tutorial_completado']),
    );
    expect(c.tiposEvento).toHaveLength(14);
  });
});

describe('Faro Nocturno (demo) (ESQUEMA_EVENTOS.md §5.2)', () => {
  const c = esquemaCatalogo.parse(FARO_NOCTURNO_DEMO.catalogo);

  it('es distinto a propósito: 4 niveles, sin tutorial, otras causas y 15 min', () => {
    expect(c.niveles.map((n) => n.nivelId)).toEqual(['muelle', 'escalera_faro', 'sala_lampara', 'azotea']);
    expect(c.niveles.some((n) => n.tieneTutorial)).toBe(false);
    expect(c.causasMuerte.map((x) => x.causa)).toEqual(['agua', 'caida', 'cuervo']);
    expect(c.duracionEsperadaMs).toBe(900000);
  });

  it('tiene 3 logros y 3 conchas en el muelle', () => {
    expect(c.logros.map((l) => l.logroId)).toEqual(['primer_paso', 'luz_encendida', 'coleccionista']);
    expect(c.coleccionables.map((x) => `${x.nivelId}:${x.coleccionableId}`)).toEqual([
      'muelle:concha_1',
      'muelle:concha_2',
      'muelle:concha_3',
    ]);
  });

  it('solo usa tipos de evento que ya existen y no los exclusivos de La Casa del Bosque (S-28)', () => {
    expect(c.tiposEvento).not.toContain('flor_recogida');
    expect(c.tiposEvento).not.toContain('tutorial_completado');
  });
});
