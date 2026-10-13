import { Routes } from '@angular/router';

// Rutas del dashboard (DISENO_DASHBOARD.md §6). Cada pantalla se agrega en su propio commit.
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  { path: '**', redirectTo: 'login' },
];
