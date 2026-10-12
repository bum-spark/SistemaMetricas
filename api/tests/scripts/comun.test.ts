import { censurar, esUriLocal, ErrorScript, hostsDeUri, leerArgs, mostrarSecretoUnaVez, verificarDestino } from '../../src/scripts/comun';

describe('hostsDeUri', () => {
  it.each([
    ['mongodb://localhost:27017/metricas', ['localhost:27017']],
    ['mongodb+srv://usuario:clave@cluster0.ab12.mongodb.net/metricas?retryWrites=true', ['cluster0.ab12.mongodb.net']],
    ['mongodb://u:p@a.example.com:27017,b.example.com:27018/metricas?replicaSet=rs0', ['a.example.com:27017', 'b.example.com:27018']],
    ['mongodb://127.0.0.1:9249/', ['127.0.0.1:9249']],
  ])('%s → %j', (uri, hosts) => {
    expect(hostsDeUri(uri)).toEqual(hosts);
  });

  it('nunca incluye usuario ni contraseña', () => {
    const hosts = hostsDeUri('mongodb+srv://admin:SuperSecreta@cluster0.mongodb.net/metricas');
    expect(hosts.join()).not.toMatch(/admin|SuperSecreta/);
  });
});

describe('esUriLocal', () => {
  it.each([
    ['mongodb://localhost:27017/metricas', true],
    ['mongodb://127.0.0.1/metricas', true],
    ['mongodb://[::1]:27017/metricas', true],
    ['mongodb+srv://u:p@cluster0.mongodb.net/metricas', false],
    ['mongodb://localhost:27017,remoto.com:27017/metricas', false],
    ['mongodb://localhost.evil.com/metricas', false],
  ])('%s → %s', (uri, esperado) => {
    expect(esUriLocal(uri)).toBe(esperado);
  });
});

describe('verificarDestino', () => {
  it('imprime el host sin credenciales y deja pasar una base local', () => {
    const lineas: string[] = [];
    verificarDestino('mongodb://localhost:27017', 'xolos_analytics', false, (l) => lineas.push(l));
    expect(lineas).toEqual(['Base de datos: xolos_analytics en localhost:27017 (local)']);
  });

  it('exige --confirmar para una base remota', () => {
    const lineas: string[] = [];
    const uri = 'mongodb+srv://admin:SuperSecreta@cluster0.mongodb.net/';
    expect(() => verificarDestino(uri, 'xolos_analytics', false, (l) => lineas.push(l))).toThrow(ErrorScript);
    expect(() => verificarDestino(uri, 'xolos_analytics', false, () => undefined)).toThrow(/--confirmar/);
    expect(lineas[0]).toBe('Base de datos: xolos_analytics en cluster0.mongodb.net (REMOTA)');
    expect(lineas.join()).not.toMatch(/SuperSecreta|admin/);
  });

  it('con --confirmar deja pasar una base remota', () => {
    expect(() => verificarDestino('mongodb+srv://u:p@cluster0.mongodb.net/', 'xolos_analytics', true, () => undefined)).not.toThrow();
  });
});

describe('utilidades', () => {
  it('censurar quita credenciales de cualquier mensaje', () => {
    expect(censurar('fallo en mongodb+srv://admin:Clave123@cluster0.net/db')).toBe('fallo en mongodb+srv://***:***@cluster0.net/db');
  });

  it('leerArgs agrega --confirmar y convierte opciones desconocidas en ErrorScript', () => {
    expect(leerArgs(['--juego', 'faro'], { juego: { type: 'string' } })).toEqual({ juego: 'faro', confirmar: false });
    expect(() => leerArgs(['--borrar-todo'], {})).toThrow(ErrorScript);
  });

  it('mostrarSecretoUnaVez enmarca el secreto y avisa que no se repite', () => {
    let salida = '';
    mostrarSecretoUnaVez('API key', 'ak_abc', (t) => (salida += t));
    expect(salida).toContain('ak_abc');
    expect(salida).toMatch(/no se vuelve a mostrar/);
  });
});
