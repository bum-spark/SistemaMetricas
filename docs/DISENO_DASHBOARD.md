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
   melancólico; sin adornos ni degradados llamativos. Única excepción: el fondo animado y el
   desenfoque del login (§6, S-66); el resto del dashboard sigue sobrio.

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
  --text-3: #8790A2;  /* apagado: etiquetas, ejes. Contraste: 5.60:1 sobre --bg-1, 5.15:1 sobre --bg-2, 4.60:1 sobre --bg-3 */
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
- **Barra superior** de 56 px: el botón de menú (abajo de 768 px) y el selector de juego.
  El usuario y "Salir" van solo abajo en la sidebar para no repetirlos (S-57). Debajo, en las
  vistas con datos, la **barra de filtros**.
- **Contenido:** ancho máximo 1280 px, centrado, padding 24 px (16 px en móvil).
- **Cuadrícula:** 12 columnas, separación 16 px. KPIs en fila de 4 (2 en tablet, 1 en móvil);
  gráficas en tarjetas de 6 o 12 columnas.
- **Breakpoints:** 640, 768, 1024, 1280.

**Sidebar (orden y etiquetas):**
Resumen · Progresión · Niveles · Muertes · Logros y exploración.
("Builds y rendimiento" queda fuera de la entrega 1.) Solo se listan pantallas construidas y
solo cuando la URL es de un juego que existe. Colapsada, cada icono usa `title` como tooltip.
Arriba el logotipo (marca + nombre del estudio); abajo el nombre del admin y "Salir".
Justo encima del usuario, un grupo **Administración** con "Invitados" (icono `Users`),
**solo para rol admin** (S-67, S-68); un invitado no lo ve.
Elemento activo: fondo `--accent-soft`, texto `--accent`, barra de 2 px a la izquierda.

### Marca

Originales en `logos/` (no se modifican); variantes aprobadas en `logos/variantes/`; el
dashboard solo usa las copias optimizadas de `dashboard/public/` (R-55, S-53).

| Archivo en `public/`                         | Origen                       | Tamaño      | Uso                                  |
|----------------------------------------------|------------------------------|-------------|--------------------------------------|
| `marca/estudio-xolos.png` / `@2x.png`        | `estudio-xolos-claro.png`    | 64 / 128 px | Sidebar y login (`srcset` 1x/2x)     |
| `marca/favicon-32.png`                       | `favicon-32.png`             | 32 px       | Favicon                              |
| `marca/apple-touch-icon.png`                 | `favicon-180.png`            | 180 px      | Icono de iOS                          |
| `marca/icono-512.png`                        | `favicon-512.png`            | 512 px      | Icono grande (manifest, si se usa)   |
| `logos/<slug>/logo.png` / `logo@2x.png`     | `casa-del-bosque-limpia.png` | 40 / 80 px  | Logo del juego (`logoUrl`)           |

- **Logo del estudio:** siempre la silueta clara (`#E8EAEE`, igual a `--text-1`) sobre las
  superficies oscuras; el xolo negro original no se usa en el dashboard.
  - Sidebar expandida: logo de 28 × 28 px + `APP_NAME` (14/600, `--text-1`), separación
    `--space-3`. Sidebar colapsada: solo el logo, con tooltip y `aria-label` de `APP_NAME`.
  - Login: logo de 64 × 64 px centrado arriba de la tarjeta, debajo `APP_NAME` como título
    de sección (20/28) y "Analytics" en texto secundario (`--text-2`).
- **Título de la pestaña:** `<APP_NAME> Analytics` (de `environment.ts`).
- **Logo del juego:** se lee siempre de `logoUrl` (`GET /juegos`, `GET /juegos/:juegoId`),
  nunca de una ruta escrita en el código. Va siempre dentro de un recuadro `--bg-3` con
  `--radius-md`:
  - Tarjeta de `/juegos`: recuadro de 56 px con padding `--space-2` (imagen de 40 px).
  - Selector de la barra superior: recuadro de 28 px con padding `--space-1` (imagen de 20 px).
  - Si `logoUrl` es una ruta del dashboard (`/logos/<slug>/logo.png`), se agrega
    `srcset` con `logo@2x.png`; si es una URL https externa, solo `src`.
  - Sin `logoUrl` (o si la imagen falla al cargar): el mismo recuadro con la inicial del
    nombre del juego en Space Grotesk 600, `--text-2`, centrada (16 px en la tarjeta, 12 px
    en el selector).
- **Imágenes:** todo `<img>` lleva `alt` descriptivo ("Logo de La Casa del Bosque",
  "Logo de Estudio Xolos"; vacío solo si el nombre ya está escrito junto al logo) y
  `width`/`height` explícitos para no mover el layout al cargar.
- **Colores del logo y paleta:** la flor usa cian, verde azulado y azul marino que no están
  en los tokens. La paleta **no se cambia** por los colores de los logos (decisión del
  equipo, R-55).

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
nunca solo placeholder. **Excepción, barra de filtros:** la etiqueta va visible a la
izquierda *dentro* del control ("Build: Todas", 12/500 `--text-3` + valor 14 `--text-1`) y el
control conserva un nombre accesible (`<label>` asociado o `aria-label` con la etiqueta
completa); nunca es solo placeholder.

### Tarjeta
Fondo `--bg-1`, borde 1px `--border-default`, radio `--radius-md`, padding 20.
Cabecera: título (14/600) + subtítulo-pregunta (13, `--text-2`) a la izquierda; a la
derecha, ayuda `?` con tooltip. Sin sombras. Hover en tarjetas clicables:
borde `--border-strong` y fondo `--bg-2`.

### Tarjeta KPI
Etiqueta (12/500 mayúscula suave, `--text-3`), cifra (32/600), debajo variación o contexto
(13, `--text-2`; verde/rojo con flecha **y** texto, nunca solo color). Si el valor es un
nombre (p. ej. "Nivel más largo"), la cifra usa 20 px para no partirse en dos líneas. Ejemplo: "Duración
mediana · 18:42 · esperado ~20:00". El valor "esperado" sale de
`catalogo.duracionEsperadaMs` del juego; si el juego no lo tiene, el KPI omite esa parte
(nunca un valor fijo en el código).

### Tabs y filtros
Tabs de texto con subrayado de 2 px `--accent` en la activa. **Barra de filtros** (fija bajo
la barra superior, en **una sola fila** en escritorio; puede envolver en móvil): rango de
fechas (con atajos: 7 días, 30 días, Todo), versión de build, plataforma y **origen de los
datos** (Todos · Reales · Demo → `origen=todos|real|seed`, por defecto Todos). Las opciones
de build y plataforma salen de `filtros: { buildVersions, plataformas }` de
`GET /juegos/:juegoId`. Los filtros viajan en la URL
(`?desde=&hasta=&buildVersion=&plataforma=&origen=`) para poder compartir una vista.
"Limpiar filtros" es un botón de icono al final de la fila, con `aria-label` y tooltip
"Limpiar filtros"; deshabilitado si no hay filtros.

### Cabecera de página
Título de página (28/36) con la versión actual como badge cuando aplica, debajo la pregunta
que responde la vista (13, `--text-2`) y a la derecha "Datos cargados hace X min" (12,
`--text-3`; reloj del cliente, se actualiza cada minuto, se reinicia al recargar datos). La
cabecera nunca queda tapada por la barra de filtros.

### Insignias de diagnóstico
Badges calculados con umbrales que viven en **un solo archivo** (`umbrales.ts`). El tooltip
muestra siempre la regla y el tamaño de la muestra (n); con menos de 20 sesiones o jugadores
no se muestra insignia.

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

### Modal (S-68)
`<dialog>` nativo (`xa-modal`): ancho `--modal-ancho` (480 px, sin pasar de la pantalla menos
16 px por lado), fondo `--bg-1`, borde 1px `--border-default`, `--radius-lg`,
`--shadow-popover`, padding 24. Fondo de la página: `--bg-0` con `--opacidad-atenuado`.
Cabecera: título de sección (Space Grotesk 20/28) y una línea de ayuda (13, `--text-2`).
Acciones abajo a la derecha (fantasma "Cancelar" + primario). Atrapa el foco, Esc lo cierra y el
foco vuelve al botón que lo abrió.

### Casillas (S-68)
Casilla nativa de 16 px con `accent-color: --accent` y foco `--focus-ring`, dentro de una fila
clicable de 40 px (hover `--bg-2`) con el logo del juego (recuadro del selector) y su nombre.
Van en un `fieldset` con `legend` como etiqueta (12/500, `--text-2`).

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

**Logros:** lista de barras horizontales con el nombre, la descripción, jugadores y %.
Se muestran todos los logros del catálogo, también los que nadie ha obtenido (0 %).

**Mapa de calor de muertes** (canvas): imagen del nivel de fondo (`imagenUrl`) a 100 % de
ancho de la tarjeta, atenuada al 60 %; encima, cada celda se dibuja como un **degradado
radial** centrado en la celda (calor suavizado), con la escala secuencial
`#3B1E12 → #8A3A12 → #F08A3C → #FFD08A` y transparencia hacia el borde. Las coordenadas del mundo se
escalan con `limites` del catálogo (eje Y invertido: en Unity crece hacia arriba). Selector
de nivel y de tamaño de celda arriba (en la URL: `?nivelId=&celda=`), con pestañas por causa
("Todas" suma las causas); leyenda de escala abajo; al mover el puntero, una lectura bajo el
mapa con las coordenadas del mundo, las muertes de la celda y la causa dominante. La escala
vive en los tokens `--calor-1` … `--calor-4`. Un nivel muy vertical se limita a 512 px de alto y
se centra. Si el nivel no tiene `imagenUrl`, usar un fondo `--bg-2` con cuadrícula y
un aviso discreto "Falta la imagen del nivel".

---

## 6. Pantallas

Ruta base `/juegos/:slug/...`. Todas excepto login exigen JWT (guard); si el token expira,
redirigir a login conservando la URL de destino.

**Slug → juegoId:** la API trabaja con `juegoId` y no cambia. El dashboard traduce el slug
de la URL con `GET /juegos` (un servicio de juegos que guarda la lista en memoria y un
guard que resuelve el slug antes de entrar a la vista; slug inexistente → vista de error).

**Solo tarjetas con endpoint:** cada vista muestra únicamente las tarjetas cuyo endpoint
ya existe en la API. No hay placeholders ni tarjetas "próximamente". Las tarjetas marcadas
abajo como *(cuando exista)* se agregan cuando se implemente su endpoint.

| Ruta                          | Contenido y endpoints                                                                 |
|-------------------------------|---------------------------------------------------------------------------------------|
| `/login`                      | Tarjeta centrada de 400 px: marca, email, contraseña, botón primario "Entrar". Error genérico "Correo o contraseña incorrectos" (no revelar cuál). Fondo animado con arte del juego (ver "Excepción visual del login" abajo). `POST /auth/login`. |
| `/invitacion`                 | **Pública.** Misma tarjeta de 400 px que el login, sobre `--bg-0` y **sin** fondo animado. Lee el token del fragmento (`#token=…`) y lo borra de la URL con `history.replaceState`. Muestra la cuenta y el vencimiento, contraseña + confirmación y las reglas visibles (icono ✓/✗ + texto: 12 caracteres, coinciden). Enlace inválido, vencido o usado: un solo aviso genérico. Al terminar: "Ir a iniciar sesión". `GET /auth/invitacion/validar` · `POST /auth/invitacion/aceptar` (S-67, S-68). |
| `/invitados`                  | **Solo rol admin** (guard + 403 de la API). Cabecera con "Invitar" (primario) a la derecha; tabla: correo (+ nombre), estado (badge: pendiente `warning` con "Enlace vigente hasta…", activo `success`, desactivado neutro), juegos (nombres de los juegos del admin + "N juegos que no administras"), último acceso, y acciones compactas: Juegos, Restablecer (no en desactivados) y Activar/Desactivar (peligro). Modal de invitar (correo, nombre opcional, casillas de juegos) y modal del enlace **una sola vez** (campo de solo lectura, "Copiar enlace", vigencia y aviso `warning`). `GET/POST/PATCH /invitados`, `POST /invitados/:email/restablecer`. |
| `/juegos`                     | Cuadrícula de tarjetas, una por juego: nombre, versión actual, badge de estado, y 3 mini-KPIs (jugadores, sesiones, % completado). Clic entra al juego. `GET /juegos`. |
| `/juegos/:slug` (Resumen)     | `versionActual` como badge junto al nombre del juego. Fila de 4 KPIs (jugadores, sesiones, duración mediana con "esperado" si hay `duracionEsperadaMs`, % terminaron); embudo compacto (6 col); tarjeta "Dónde se pierde la gente" (6 col) con la **mayor caída entre dos pasos del embudo** y un enlace a Muertes con ese nivel preseleccionado. `GET /juegos/:juegoId`, `/estadisticas/*/sesiones`, `embudo`. |
| `/progresion`                 | Embudo completo con insignias y tabla por paso (jugadores, % del inicio, % del paso anterior, caída). *(cuando exista)* abandono (antes del primer nivel, dentro de cada nivel, entre niveles) y completado del tutorial si el juego tiene uno. `embudo` · *(cuando exista)* `abandono`, `tutorial`. |
| `/niveles`                    | 4 KPIs, tiempo por nivel, intentos para pasar (distribución de `reintentos`) y tabla resumen por nivel con diagnóstico. `tiempo-nivel` · `reintentos` · `embudo`. |
| `/muertes`                    | 4 KPIs, muertes por nivel y causa, mapa de calor con selector de nivel y tabla por nivel y causa. `muertes` · `mapa-calor`. |
| `/logros`                     | 4 KPIs y lista de logros con barras y rareza calculada. *(cuando exista)* coleccionables encontrados vs disponibles por nivel, diálogos saltados, inactividad y pausas. `logros` · *(cuando exista)* `atencion`. |

"Builds y rendimiento" (`/builds`: tabla por versión y plataforma, FPS, cargas y crashes;
endpoints `versiones` y `rendimiento`) **queda fuera de la entrega 1**.

### Excepción visual del login (S-66)

El fondo animado y el desenfoque son **solo del login**. Ninguna otra pantalla usa
imágenes de fondo, transparencias ni `backdrop-filter`; el resto del dashboard sigue sobrio
(principio 6).

- **Fondo** (`xa-fondo-login`): arte del juego a pantalla completa (`object-fit: cover`),
  WebP de `public/login/` (`fondo-0N.webp` de hasta 1920 px y `fondo-0N-960.webp` para
  pantallas de hasta 767 px, con `<picture>`). Fundido cruzado de `--login-fundido` cada 7 s
  y zoom 1 → 1.05 durante `--login-zoom`. Encima, una capa `--login-capa` (`--bg-0` al 60 %).
- **Carga:** al abrir solo se pide la primera imagen (`fetchpriority="high"`); las demás se
  precargan cuando el formulario ya es interactivo y la siguiente se asegura antes de
  mostrarse. Se pausa con la pestaña oculta.
- **Movimiento reducido:** una sola imagen fija, sin fundido, zoom ni precargas.
- **Decorativo:** `alt=""` y `aria-hidden="true"` en el contenedor.
- **Tarjeta y chip `/salud`:** fondo `--login-tarjeta` (`--bg-1` al 86 %) con
  `backdrop-filter: blur(var(--login-desenfoque))`; sin soporte, `--login-tarjeta-solida`
  (94 %). Borde y radio de siempre. El recuadro de error lleva `--danger-soft` sobre `--bg-1`
  sólido.
- **Contraste:** se mide contra el píxel más claro de cada imagen detrás de cada texto; todo
  texto ≥ 4.5:1 con todas las imágenes (valores en S-66). Una imagen nueva se agrega solo si
  pasa esa medición.

```css
--login-capa: rgba(14, 16, 19, 0.6);
--login-tarjeta: rgba(20, 23, 28, 0.86);
--login-tarjeta-solida: rgba(20, 23, 28, 0.94);
--login-desenfoque: 16px;
--login-fundido: 1.2s;
--login-zoom: 8.2s;
```

**Prioridad de construcción** (si falta tiempo, en este orden): login → juegos →
Resumen → Progresión (embudo) → Niveles (tiempo) → Muertes (barras) → Logros → mapa de calor.

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
    shared/ui/       … + cabecera, insignia, tabs (y umbrales.ts, formato/, carga.ts en shared/)
    shared/charts/   xa-chart (+ chart-theme.ts), xa-embudo, xa-mapa-calor
    features/        login, invitacion, marco (sidebar y barra superior), juegos, invitados,
                     juego (resumen, progresion, niveles, muertes, logros)
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
- Los componentes de `shared/ui` se construyen **conforme los necesita cada pantalla**, no
  todos por adelantado; cada uno con sus estados (hover, foco, deshabilitado, error).
- *Opcional, solo si sobra tiempo:* una página de ejemplo en `/_ui` (solo en desarrollo)
  con todas las variantes y estados de los componentes.

---

## 9. Criterios de "diseño terminado"

- [x] Todos los tokens en `tokens.css` y ningún valor de diseño fuera de él (excepto la paleta
      categórica en `chart-theme.ts`, como permite §8)
- [x] Componentes `shared/ui` usados, con todos sus estados (hover, foco, deshabilitado, error)
- [x] Cada vista con skeleton, vacío, error y datos
- [x] Login, lista de juegos y al menos Resumen, Progresión, Niveles, Muertes y Logros
      (con las tarjetas cuyos endpoints existan; "Builds y rendimiento" fuera de la entrega 1)
- [x] El segundo juego (demo) se ve correcto sin cambios de código
- [ ] Contraste y foco revisados; navegación completa con teclado (foco visible y tabs con
      teclado implementados; falta una pasada completa con lector de pantalla)
- [x] Revisado en 1280, 1024 y 390 px de ancho (capturas en 1280, 1000 y 390)
