import { AdminModelo, JuegoModelo } from '../modelos';
import { hashPassword, problemaDePassword } from '../seguridad/password';
import { ejecutarScript, ErrorScript, texto } from './comun';

export interface DatosAdmin {
  email: string;
  password: string;
  nombre: string;
  // Slugs de los juegos permitidos; sin valor = todos los juegos existentes (S-32).
  juegos?: string[] | undefined;
}

export type ResultadoCrearAdmin =
  | { creado: true; email: string; juegosPermitidos: string[] }
  | { creado: false; email: string };

export async function crearAdmin(datos: DatosAdmin): Promise<ResultadoCrearAdmin> {
  const email = datos.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ErrorScript('ADMIN_EMAIL no es un correo válido.');
  }
  if (datos.nombre.trim().length === 0) {
    throw new ErrorScript('ADMIN_NOMBRE no puede estar vacío.');
  }
  const problema = problemaDePassword(datos.password);
  if (problema) {
    throw new ErrorScript(`ADMIN_PASSWORD: ${problema}.`);
  }

  // Sin registro público ni sobrescritura: si el admin ya existe, no se toca.
  if (await AdminModelo.exists({ email })) {
    return { creado: false, email };
  }

  const filtroJuegos = datos.juegos === undefined ? {} : { slug: { $in: datos.juegos } };
  const juegos = await JuegoModelo.find(filtroJuegos, { juegoId: 1, slug: 1 }).lean();
  if (datos.juegos !== undefined) {
    const faltantes = datos.juegos.filter((slug) => !juegos.some((j) => j.slug === slug));
    if (faltantes.length > 0) {
      throw new ErrorScript(`No existen los juegos: ${faltantes.join(', ')}.`);
    }
  }

  const juegosPermitidos = juegos.map((j) => j.juegoId);
  await AdminModelo.create({
    email,
    rol: 'admin',
    nombre: datos.nombre.trim(),
    passwordHash: await hashPassword(datos.password),
    juegosPermitidos,
  });
  return { creado: true, email, juegosPermitidos };
}

export async function main(argv: string[]): Promise<void> {
  await ejecutarScript('crear-admin', argv, { juegos: { type: 'string' } }, async ({ args, log }) => {
    // La contraseña solo se lee del entorno (.env), nunca de la línea de comandos.
    const email = process.env.ADMIN_EMAIL ?? '';
    const password = process.env.ADMIN_PASSWORD ?? '';
    const nombre = process.env.ADMIN_NOMBRE ?? '';
    if (!email || !password || !nombre) {
      throw new ErrorScript('Faltan ADMIN_EMAIL, ADMIN_PASSWORD o ADMIN_NOMBRE en el .env.');
    }
    const juegos = texto(args, 'juegos')?.split(',').map((s) => s.trim()).filter(Boolean);
    const resultado = await crearAdmin({ email, password, nombre, juegos });
    if (resultado.creado) {
      log(`Admin creado: ${resultado.email} · juegos permitidos: ${resultado.juegosPermitidos.length}`);
      log('Ya puedes borrar ADMIN_PASSWORD del .env.');
    } else {
      log(`El admin ${resultado.email} ya existe; no se modificó nada.`);
    }
  });
}
