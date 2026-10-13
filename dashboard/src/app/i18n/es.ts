// Textos de la interfaz en un solo lugar (DISENO_DASHBOARD.md §7). Sin IDs de catálogo.
export const ES = {
  marca: {
    analytics: 'Analytics',
    logoEstudio: (appName: string) => `Logo de ${appName}`,
  },
  login: {
    tituloPagina: 'Iniciar sesión',
    email: 'Correo',
    password: 'Contraseña',
    entrar: 'Entrar',
    entrando: 'Entrando…',
    emailObligatorio: 'Escribe tu correo.',
    emailInvalido: 'Escribe un correo válido.',
    passwordObligatoria: 'Escribe tu contraseña.',
    credencialesIncorrectas: 'Correo o contraseña incorrectos',
    demasiadosIntentos: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
    sinConexion: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo otra vez.',
    errorInesperado: 'Ocurrió un error inesperado. Inténtalo otra vez.',
    sesionExpirada: 'Tu sesión expiró. Vuelve a entrar.',
  },
  api: {
    despertando: 'El servidor se está despertando, puede tardar un minuto.',
  },
} as const;
