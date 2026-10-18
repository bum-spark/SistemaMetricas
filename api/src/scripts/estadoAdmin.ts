import { AdminModelo } from '../modelos';
import { FILTRO_ADMINS_ACTIVOS, rolDe } from '../modelos/admin';
import { ejecutarScript, ErrorScript, texto } from './comun';

export interface ResultadoEstadoAdmin {
  email: string;
  cambiado: boolean;
  // Admins activos que quedan después del cambio (para avisar si no queda ninguno).
  adminsActivos: number;
}

const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Desactiva o reactiva un ADMIN (rol admin o documento sin rol). No toca contraseña, juegos ni
// datos. Desactivar surte efecto al instante: el JWT se relee en cada petición (S-42), así que
// sus sesiones abiertas dejan de servir y no puede volver a entrar. Los invitados se gestionan
// desde el dashboard (pantalla Invitados), no con este script.
export async function cambiarEstadoAdmin(emailCrudo: string, activo: boolean): Promise<ResultadoEstadoAdmin> {
  const email = emailCrudo.trim().toLowerCase();
  if (!PATRON_EMAIL.test(email)) {
    throw new ErrorScript(`"${emailCrudo}" no es un correo válido.`);
  }
  const admin = await AdminModelo.findOne({ email }, { rol: 1, activo: 1 }).lean();
  if (!admin) {
    throw new ErrorScript(`No existe un admin con el correo ${email}.`);
  }
  if (rolDe(admin) !== 'admin') {
    throw new ErrorScript(`${email} es un invitado: se activa o desactiva desde la pantalla Invitados del dashboard.`);
  }
  const cambiado = admin.activo !== activo;
  if (cambiado) {
    await AdminModelo.updateOne({ email }, { $set: { activo } });
  }
  return { email, cambiado, adminsActivos: await AdminModelo.countDocuments(FILTRO_ADMINS_ACTIVOS) };
}

async function mainEstado(nombre: string, activo: boolean, argv: string[]): Promise<void> {
  await ejecutarScript(nombre, argv, { email: { type: 'string' } }, async ({ args, log }) => {
    const email = texto(args, 'email');
    if (!email) {
      throw new ErrorScript('Indica el admin con --email <correo>.');
    }
    const r = await cambiarEstadoAdmin(email, activo);
    const estado = activo ? 'activo' : 'desactivado';
    log(r.cambiado ? `Admin ${r.email}: ahora está ${estado}.` : `El admin ${r.email} ya estaba ${estado}; no se modificó nada.`);
    if (!activo && r.cambiado) {
      log('Sus sesiones abiertas dejan de servir al instante y no puede volver a entrar.');
    }
    if (r.adminsActivos === 0) {
      log('AVISO: no queda ningún admin activo. Reactiva uno con reactivar-admin o crea otro con crear-admin.');
    }
  });
}

export async function mainDesactivar(argv: string[]): Promise<void> {
  await mainEstado('desactivar-admin', false, argv);
}

export async function mainReactivar(argv: string[]): Promise<void> {
  await mainEstado('reactivar-admin', true, argv);
}
