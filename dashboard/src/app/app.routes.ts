import { Routes } from '@angular/router';
import { authGuard, soloInvitadoGuard } from './core/auth/auth.guard';

// Rutas del dashboard (DISENO_DASHBOARD.md §6). Cada pantalla se agrega en su propio commit.
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [soloInvitadoGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/marco/marco').then((m) => m.Marco),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'juegos' },
      { path: 'juegos', loadComponent: () => import('./features/juegos/juegos').then((m) => m.Juegos) },
    ],
  },
  { path: '**', redirectTo: 'juegos' },
];
