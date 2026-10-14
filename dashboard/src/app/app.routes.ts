import { Routes } from '@angular/router';
import { authGuard, soloAdminGuard, soloSinSesionGuard } from './core/auth/auth.guard';

// Rutas del dashboard (DISENO_DASHBOARD.md §6). Cada pantalla se agrega en su propio commit.
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [soloSinSesionGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  // Pública: crear la contraseña con el enlace de invitación (#token=…), con o sin sesión.
  {
    path: 'invitacion',
    loadComponent: () => import('./features/invitacion/invitacion').then((m) => m.Invitacion),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/marco/marco').then((m) => m.Marco),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'juegos' },
      { path: 'juegos', loadComponent: () => import('./features/juegos/juegos').then((m) => m.Juegos) },
      {
        path: 'invitados',
        canActivate: [soloAdminGuard],
        loadComponent: () => import('./features/invitados/invitados').then((m) => m.Invitados),
      },
      {
        path: 'juegos/:slug',
        loadComponent: () => import('./features/juego/juego').then((m) => m.Juego),
        children: [
          { path: '', loadComponent: () => import('./features/juego/resumen/resumen').then((m) => m.Resumen) },
          { path: 'progresion', loadComponent: () => import('./features/juego/progresion/progresion').then((m) => m.Progresion) },
          { path: 'niveles', loadComponent: () => import('./features/juego/niveles/niveles').then((m) => m.Niveles) },
          { path: 'muertes', loadComponent: () => import('./features/juego/muertes/muertes').then((m) => m.Muertes) },
          { path: 'logros', loadComponent: () => import('./features/juego/logros/logros').then((m) => m.Logros) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'juegos' },
];
