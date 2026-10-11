# Diseño del dashboard: Estudio Xolos Analytics

> Fuente de verdad visual del dashboard Angular. Claude Code debe seguir este documento y
> NO inventar colores, tamaños ni componentes que no estén aquí. Si falta algo, preguntar o
> anotarlo en `DECISIONES_ABIERTAS.md`.
> Resuelve A-05. Resuelve A-04 en parte: tema oscuro por defecto; el modo claro queda
> preparado (tokens) pero no se implementa en la entrega 1.

---

## 1. Principios

1. **Cada pantalla responde una decisión.** Cada gráfica lleva título y una línea de
   subtítulo con la pregunta que responde (ej. "¿Dónde se pierde la gente?").
2. **Los datos son lo principal.** Interfaz sobria: fondos oscuros y neutros, color solo para
   significado (acento, estado, series de datos).
3. **Nada fijo en el frontend.** Niveles, logros, causas de muerte y coleccionables salen del
   catálogo del juego (`GET /juegos/:juegoId`). Prohibido escribir "casa_abandonada" o
   cualquier ID de catálogo en el código Angular.
4. **Siempre hay estado.** Toda vista tiene cargando (skeleton), vacío, error y datos.
5. **Accesible por defecto.** Contraste mínimo 4.5:1 en texto, foco visible, navegable con
   teclado, y el color nunca es el único canal de información.
6. **Identidad:** marca "Estudio Xolos" (nombre de `APP_NAME`). Tono sobrio, ligeramente
   melancólico; sin adornos ni degradados llamativos.

---

## 2. Tokens de diseño

Se definen UNA sola vez en `src/styles/tokens.css` como variables CSS. **Prohibido** usar
colores, tamaños o sombras escritos a mano fuera de ese archivo.

```css
:root {
  /* Superficies (de más profunda a más elevada) */
  --bg-0: #0E1013;   /* fondo de la app */
  --bg-1: #14171C;   /* tarjetas, sidebar, topbar */
  --bg-2: #1B1F26;   /* hover, filas alternas, popovers */
  --bg-3: #232832;   /* inputs, elemento activo */

  /* Bordes */
  --border-subtle:  #262B34;  /* separadores dentro de tarjetas */
  --border-default: #323844;  /* tarjetas, inputs */
  --border-strong:  #444C5A;  /* hover de inputs, énfasis */

  /* Texto */
  --text-1: #E8EAEE;  /* principal */
  --text-2: #A3AAB8;  /* secundario */
  --text-3: #7D8596;  /* apagado: etiquetas, ejes (contraste >= 4.5:1 sobre --bg-1) */
  --text-on-accent: #14171C;

  /* Acento principal: brasa (la habitación en llamas) */
  --accent:        #F08A3C;
  --accent-hover:  #F59D58;
  --accent-active: #D9772C;
  --accent-soft:   rgba(240, 138, 60, 0.14);  /* fondos suaves, selección */

  /* Acento secundario: pétalo azul */
  --petal:       #5FA8E8;
  --petal-soft:  rgba(95, 168, 232, 0.14);

  /* Semánticos */
  --success: #4CC38A;  --success-soft: rgba(76, 195, 138, 0.14);
  --warning: #E8B84A;  --warning-soft: rgba(232, 184, 74, 0.14);
  --danger:  #EF5D5D;  --danger-soft:  rgba(239, 93, 93, 0.14);

  /* Foco */
  --focus-ring: 0 0 0 2px var(--bg-0), 0 0 0 4px var(--petal);

  /* Tipografía */
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body:    'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  /* Espaciado: cuadrícula de 4 px */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;

  /* Radios */
  --radius-sm: 6px;    /* botones, inputs, badges */
  --radius-md: 10px;   /* tarjetas */
  --radius-lg: 14px;   /* modales, popovers grandes */
  --radius-full: 999px;

  /* Elevación: en tema oscuro se usa borde, la sombra es mínima */
  --shadow-popover: 0 8px 24px rgba(0, 0, 0, 0.45);

  /* Movimiento */
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; }
}
```

**Tipografía** (fuentes autoalojadas con `@fontsource`, sin CDN):

| Uso              | Fuente        | Tamaño / interlineado | Peso |
|------------------|---------------|-----------------------|:----:|
| Título de página | Space Grotesk | 28 / 36               | 600  |
| Título de sección| Space Grotesk | 20 / 28               | 600  |
| Título de tarjeta| Inter         | 14 / 20               | 600  |
| Cuerpo           | Inter         | 14 / 22               | 400  |
| Secundario       | Inter         | 13 / 20               | 400  |
| Etiqueta / eje   | Inter         | 12 / 16               | 500  |
| Cifra grande KPI | Space Grotesk | 32 / 40               | 600  |
| Valores tabulares| JetBrains Mono| 13 / 20               | 400  |

Los números en tablas y KPIs usan `font-variant-numeric: tabular-nums`.

---

## 3. Layout

- **Sidebar** fija de 232 px (`--bg-1`, borde derecho `--border-subtle`). Abajo de 1024 px se
  colapsa a 64 px (solo iconos con tooltip); abajo de 768 px pasa a menú hamburguesa.
- **Barra superior** de 56 px: a la izquierda el selector de juego, a la derecha el
  usuario/cerrar sesión. Debajo, en las vistas con datos, la **barra de filtros**.
- **Contenido:** ancho máximo 1280 px, centrado, padding 24 px (16 px en móvil).
- **Cuadrícula:** 12 columnas, separación 16 px. KPIs en fila de 4 (2 en tablet, 1 en móvil);
  gráficas en tarjetas de 6 o 12 columnas.
- **Breakpoints:** 640, 768, 1024, 1280.

**Sidebar (orden y etiquetas):**
Resumen · Progresión · Niveles · Muertes · Logros y exploración · Builds y rendimiento.
Arriba el logotipo (marca + nombre del estudio); abajo el nombre del admin y "Salir".
Elemento activo: fondo `--accent-soft`, texto `--accent`, barra de 2 px a la izquierda.

---

## 4. Componentes

### Botones
Altura 36 px (compacto 28, grande 44), radio `--radius-sm`, texto 14/500, padding horizontal 16.

| Variante    | Fondo / borde / texto                                          | Uso                          |
|-------------|----------------------------------------------------------------|------------------------------|
| Primario    | `--accent` / sin borde / `--text-on-accent`                    | Una acción principal por vista |
| Secundario  | `--bg-3` / 1px `--border-default` / `--text-1`                 | Acciones comunes             |
| Fantasma    | transparente / sin borde / `--text-2`                          | Acciones terciarias          |
| Peligro     | `--danger-soft` / 1px `--danger` / `--danger`                  | Borrar, revocar              |

Estados: hover (primario → `--accent-hover`; resto → `--bg-2` + borde `--border-strong`),
activo (`--accent-active`), foco (`--focus-ring`), deshabilitado (opacidad 0.45, sin
puntero), cargando (spinner de 16 px y texto atenuado, ancho constante). Los botones solo
con icono llevan `aria-label` y tooltip.

### Inputs y selects
Altura 36 px, fondo `--bg-3`, borde 1px `--border-default`, radio `--radius-sm`, texto 14.
Hover: borde `--border-strong`. Foco: borde `--petal` + `--focus-ring`. Error: borde
`--danger` y mensaje de 12 px en `--danger` debajo. Etiqueta arriba (12/500, `--text-2`),
nunca solo placeholder.

### Tarjeta
Fondo `--bg-1`, borde 1px `--border-default`, radio `--radius-md`, padding 20.
Cabecera: título (14/600) + subtítulo-pregunta (13, `--text-2`) a la izquierda; acciones
(ayuda `?` con tooltip, exportar) a la derecha. Sin sombras. Hover en tarjetas clicables:
borde `--border-strong` y fondo `--bg-2`.

### Tarjeta KPI
Etiqueta (12/500 mayúscula suave, `--text-3`), cifra (32/600), debajo variación o contexto
(13, `--text-2`; verde/rojo con flecha **y** texto, nunca solo color). Ejemplo: "Duración
mediana · 18:42 · esperado ~20:00".

### Tabs y filtros
Tabs de texto con subrayado de 2 px `--accent` en la activa. **Barra de filtros** (fija bajo
la barra superior): rango de fechas (con atajos: 7 días, 30 días, Todo), versión de build,
plataforma. Los filtros viajan en la URL (`?desde=&hasta=&buildVersion=&plataforma=`) para
poder compartir una vista. Botón secundario "Limpiar filtros".

### Tabla
Cabecera sticky, 12/500 `--text-3`, fondo `--bg-1`; filas de 44 px, separador
`--border-subtle`, hover `--bg-2`. Números alineados a la derecha en mono tabular. Ordenable
(flecha + `aria-sort`). Paginación abajo a la derecha.

### Badge / chip
Altura 22, radio `--radius-full`, texto 12/500, fondo `-soft` del color y texto del color
pleno (success, warning, danger, petal, neutro `--bg-3`/`--text-2`).

### Tooltip y popover
Fondo `--bg-2`, borde 1px `--border-default`, radio `--radius-sm`, `--shadow-popover`,
texto 12–13. Aparece al foco y al hover, con retraso de 150 ms.

### Estados de vista
- **Cargando:** skeleton con la forma de la tarjeta (bloques `--bg-2` con brillo suave;
  sin brillo si `prefers-reduced-motion`). Nunca un spinner a pantalla completa.
- **Vacío:** icono lineal, título ("Todavía no hay datos en este rango"), una línea de ayuda
  y, si aplica, botón para limpiar filtros.
- **Error:** tarjeta con borde `--danger`, mensaje claro, botón "Reintentar".
- **Aviso API dormida:** si una petición tarda más de 8 s, mostrar "El servidor se está
  despertando, puede tardar un minuto" (plan gratuito de hosting).
- **Toasts:** esquina inferior derecha, 4 s, `--bg-2` con borde del color semántico.

### Iconos
`lucide-angular`, trazo de 1.75 px, 16 px en controles y 20 px en navegación.

---

## 5. Gráficas

Biblioteca: **Chart.js 4** envuelto en un componente propio `<xa-chart>` (no `ng2-charts`).
El embudo y el mapa de calor son componentes propios (SVG y canvas).

**Reglas generales**
- Fondo transparente; cuadrícula horizontal de 1px `--border-subtle`; sin cuadrícula vertical.
- Ejes en 12 px `--text-3`. Sin marcos alrededor del área de dibujo.
- Tooltip con el estilo de la sección 4, con valor, porcentaje y nombre de la serie.
- Una serie = un color; no más de 6 series por gráfica (agrupar el resto en "Otros").
- Etiquetas directas cuando sea posible (valor sobre la barra), leyenda abajo si no.
- Cada gráfica tiene una **alternativa textual**: tabla oculta visualmente o `aria-label`
  con el dato clave.
- Animación de entrada de 200 ms; ninguna si `prefers-reduced-motion`.

**Paleta categórica** (apta para daltonismo, en este orden):

| # | Color     | Hex       |
|:-:|-----------|-----------|
| 1 | Celeste   | `#56B4E9` |
| 2 | Ámbar     | `#E69F00` |
| 3 | Verde     | `#2FBF94` |
| 4 | Rosa      | `#CC79A7` |
| 5 | Amarillo  | `#F0E442` |
| 6 | Bermellón | `#E8743B` |

Las series se asignan **por posición en el catálogo** (el 1.º nivel o la 1.ª causa de muerte
toma el color 1, etc.), nunca por nombre fijo, para que un juego nuevo funcione sin cambios.

**Embudo de progresión** (componente propio): barras horizontales decrecientes, una por
paso (niveles en orden del catálogo + "Terminaron"), color `--petal` con opacidad
decreciente. Cada barra muestra jugadores y porcentaje respecto al primero; entre barras,
la caída en `--danger` ("−32 %"). La mayor caída se resalta con borde `--danger`.

**Tiempo por nivel:** barras agrupadas (mediana por nivel, serie por resultado: completado
en `--success`, muerte en `--danger`, abandono en `--warning`). Eje en mm:ss.

**Muertes:** barras apiladas por nivel, apilado por causa (paleta categórica).

**Logros:** lista de barras horizontales con el nombre, la descripción (si el logro está
"oculto" en el catálogo, mostrar "???" hasta que alguien lo obtenga), jugadores y %.

**Mapa de calor de muertes** (canvas): imagen del nivel de fondo (`imagenUrl`) a 100 % de
ancho de la tarjeta, atenuada al 60 %; encima, celdas coloreadas con escala secuencial
`#3B1E12 → #8A3A12 → #F08A3C → #FFD08A` con transparencia. Las coordenadas del mundo se
escalan con `limites` del catálogo (eje Y invertido: en Unity crece hacia arriba). Selector
de nivel y de tamaño de celda arriba; leyenda de escala abajo; tooltip con muertes y
causa dominante. Si el nivel no tiene `imagenUrl`, usar un fondo `--bg-2` con cuadrícula y
un aviso discreto "Falta la imagen del nivel".

---

## 6. Pantallas

Ruta base `/juegos/:slug/...`. Todas excepto login exigen JWT (guard); si el token expira,
redirigir a login conservando la URL de destino.

| Ruta                          | Contenido y endpoints                                                                 |
|-------------------------------|---------------------------------------------------------------------------------------|
| `/login`                      | Tarjeta centrada de 400 px: marca, email, contraseña, botón primario "Entrar". Error genérico "Correo o contraseña incorrectos" (no revelar cuál). `POST /auth/login`. |
| `/juegos`                     | Cuadrícula de tarjetas, una por juego: nombre, versión actual, badge de estado, y 3 mini-KPIs (jugadores, sesiones, % completado). Clic entra al juego. `GET /juegos`. |
| `/juegos/:slug` (Resumen)     | Fila de 4 KPIs (jugadores, sesiones, duración mediana vs ~esperada, % terminaron); embudo compacto (6 col); tarjeta "Dónde se pierde la gente" con el mayor abandono (6 col); últimas versiones. `/estadisticas/*/sesiones`, `embudo`, `abandono`. |
| `/progresion`                 | Embudo completo + abandono (antes del primer nivel, dentro de cada nivel, entre niveles) + completado del tutorial si el juego tiene uno. `embudo`, `abandono`, `tutorial`. |
| `/niveles`                    | Tiempo por nivel + reintentos por nivel; tabla resumen por nivel. `tiempo-nivel`, `reintentos`. |
| `/muertes`                    | Muertes por nivel y causa + mapa de calor con selector de nivel. `muertes`, `mapa-calor`. |
| `/logros`                     | Logros (%) + coleccionables encontrados vs disponibles por nivel + diálogos saltados + inactividad y pausas. `logros`, `atencion`. |
| `/builds`                     | Tabla por versión y plataforma (sesiones, duración, % completado) + FPS, tiempos de carga y crashes. `versiones`, `rendimiento`. |

**Prioridad de construcción** (si falta tiempo, en este orden): login → lista de juegos →
Resumen → Progresión → Niveles → Muertes (barras) → Logros → mapa de calor → Builds.

**Filtros:** presentes en todas las vistas con datos, en la barra de filtros (sección 4).
Cambiar un filtro recarga todas las gráficas de la vista, con skeleton, sin parpadeo del layout.

---

## 7. Accesibilidad y responsive

- Contraste: texto >= 4.5:1; elementos gráficos >= 3:1. No bajar de `--text-3` en texto.
- Foco visible siempre (`--focus-ring`); orden de tabulación lógico; sidebar con
  `nav` y `aria-current="page"`.
- Gráficas con alternativa textual (sección 5). Cambios de estado anunciados con
  `aria-live="polite"` (cargando, error).
- Objetivos táctiles >= 40 px en móvil. Tablas con scroll horizontal en pantallas pequeñas.
- Formato `es-MX`: miles con coma, fechas `dd/MM/yyyy`, horas en 24 h. Duraciones como
  `mm:ss` (o `h:mm:ss` si pasan de una hora). Porcentajes con un decimal solo si < 10 %.
- Textos de la interfaz en español, tono directo y breve. Cadenas en un archivo central
  (`src/app/i18n/es.ts`), no repartidas por plantillas.

---

## 8. Estructura Angular y reglas de código

```
dashboard/src/
  styles/            tokens.css, base.css (reset, tipografía), utilidades
  app/
    core/            auth (servicio, guard, interceptor JWT), api (cliente tipado), config (APP_NAME, API_URL)
    shared/ui/       botón, input, select, tarjeta, kpi, tabs, badge, tabla, tooltip,
                     skeleton, estado-vacio, estado-error, toast  (prefijo xa-)
    shared/charts/   xa-chart, xa-embudo, xa-mapa-calor
    features/        login, juegos, juego (resumen, progresion, niveles, muertes, logros, builds)
    i18n/es.ts
```

- Angular con **componentes standalone**, **signals** para el estado y `OnPush`.
- Un servicio de datos por feature; la capa `core/api` define los tipos TypeScript de cada
  respuesta (`datos` de cada endpoint de `ESQUEMA_EVENTOS.md` §10).
- Filtros en la URL como única fuente de verdad; las vistas reaccionan a los parámetros.
- El JWT se guarda en memoria (y `sessionStorage` solo para sobrevivir a recargas); el
  interceptor lo agrega y ante un 401 redirige a login.
- La URL de la API y `APP_NAME` vienen de `environment.ts`, nunca escritas a mano.
- **Prohibido:** colores en hex fuera de `tokens.css` (excepto la paleta de gráficas, que
  vive en un solo archivo `chart-theme.ts`), IDs de catálogo en el código, estilos en línea
  para valores de diseño, librerías de componentes completas (no Angular Material ni
  Bootstrap): los componentes `xa-*` son propios y siguen esta guía.
- Cada componente de `shared/ui` lleva una página de ejemplo en una ruta `/_ui` (solo en
  desarrollo) mostrando todas sus variantes y estados, para revisarlos de un vistazo.

---

## 9. Criterios de "diseño terminado"

- [ ] Todos los tokens en `tokens.css` y ningún valor de diseño fuera de él
- [ ] Componentes `shared/ui` con todos sus estados (hover, foco, deshabilitado, error)
- [ ] Cada vista con skeleton, vacío, error y datos
- [ ] Login, lista de juegos y al menos Resumen, Progresión, Niveles, Muertes y Logros
- [ ] El segundo juego (demo) se ve correcto sin cambios de código
- [ ] Contraste y foco revisados; navegación completa con teclado
- [ ] Revisado en 1280, 1024 y 390 px de ancho
