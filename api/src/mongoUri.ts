// Lectura de cadenas de conexión de MongoDB sin exponer credenciales.

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function sinEsquemaNiCredenciales(uri: string): string {
  const sinEsquema = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const finAutoridad = sinEsquema.search(/[/?]/);
  const autoridad = finAutoridad === -1 ? sinEsquema : sinEsquema.slice(0, finAutoridad);
  const resto = finAutoridad === -1 ? '' : sinEsquema.slice(finAutoridad);
  const arroba = autoridad.lastIndexOf('@');
  return (arroba === -1 ? autoridad : autoridad.slice(arroba + 1)) + resto;
}

// "mongodb+srv://usuario:clave@cluster0.x.mongodb.net/metricas?..." → ["cluster0.x.mongodb.net"]
export function hostsDeUri(uri: string): string[] {
  const autoridad = sinEsquemaNiCredenciales(uri).split(/[/?]/)[0] ?? '';
  return autoridad
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

// Nombre de base de datos que trae la URI en la ruta ("/metricas"), o undefined si no trae.
export function baseDeUri(uri: string): string | undefined {
  const ruta = sinEsquemaNiCredenciales(uri).match(/^[^/?]*\/([^?]*)/)?.[1];
  if (ruta === undefined || ruta.length === 0) {
    return undefined;
  }
  return decodeURIComponent(ruta);
}

function sinPuerto(host: string): string {
  if (host.startsWith('[')) {
    return host.slice(0, host.indexOf(']') + 1);
  }
  return host.split(':')[0] ?? host;
}

export function esUriLocal(uri: string): boolean {
  const hosts = hostsDeUri(uri);
  return hosts.length > 0 && hosts.every((host) => HOSTS_LOCALES.has(sinPuerto(host)));
}

// Quita credenciales de cualquier texto que pueda contener una URI.
export function censurar(texto: string): string {
  return texto.replace(/\/\/[^@/\s]+@/g, '//***:***@');
}
