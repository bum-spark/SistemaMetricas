# Imágenes del login

Cómo se generan los fondos del login (`dashboard/public/login/`) y cómo agregar o cambiar
uno. La decisión y sus cifras están en S-66 (`DECISIONES_ABIERTAS.md`); el diseño, en
"Excepción visual del login" de `DISENO_DASHBOARD.md` §6.

## Reglas

- **Originales fuera del repo:** van en `dashboard/originales-sin-optimizar/` (ignorada por
  git). En el repo solo entran los WebP de `dashboard/public/login/`.
- **Herramienta:** [sharp-cli](https://www.npmjs.com/package/sharp-cli) con `npx`, versión
  fija `5`. No se agrega `sharp` ni `sharp-cli` como dependencia del repositorio; `npx` lo
  descarga a su caché la primera vez.
- **Dos variantes por imagen**, en WebP:

  | Archivo               | Ancho máximo | Peso máximo | Uso                                |
  |-----------------------|-------------:|------------:|------------------------------------|
  | `fondo-NN.webp`       | 1920 px      | 250 KB      | Pantallas de 768 px o más          |
  | `fondo-NN-960.webp`   | 960 px       | 120 KB      | Pantallas de hasta 767 px          |

- **Nunca se agranda:** si el original es más angosto que el ancho pedido, se queda en su
  ancho (`--withoutEnlargement`). Ningún original actual llega a 1920 px (el mayor es de
  1600 px). Una imagen de menos de ~1280 px se verá suave a pantalla completa en escritorio.
- **Calidad:** se empieza en 80. Si el archivo pasa el peso máximo, se repite con 75, 70…
  (de 5 en 5, sin bajar de 40). Las 12 imágenes actuales cumplieron con 80.
- **Nombres:** `fondo-01` … `fondo-NN`, de dos dígitos. El número es el orden del carrusel
  y sale de `FONDOS_LOGIN` en `dashboard/src/app/features/login/fondo-login.ts`.

## Comando

Desde `dashboard/` (PowerShell o Git Bash, es igual), una vez por variante. Ejemplo con el
original `fondo4.jpeg` convertido a `fondo-01`:

```
npx --yes sharp-cli@5 -i originales-sin-optimizar/fondo4.jpeg -o public/login/fondo-01.webp -f webp -q 80 --effort 6 resize 1920 --withoutEnlargement
npx --yes sharp-cli@5 -i originales-sin-optimizar/fondo4.jpeg -o public/login/fondo-01-960.webp -f webp -q 80 --effort 6 resize 960 --withoutEnlargement
```

Revisa el peso de las dos salidas (`ls -l public/login` o el explorador). Si una pasa su
límite, repite solo esa con `-q 75`, y así.

Correspondencia actual (original → nombre):

| Nombre     | Original      |
|------------|---------------|
| `fondo-01` | `fondo4.jpeg` |
| `fondo-02` | `fondo2.jpeg` |
| `fondo-03` | `fondo5.jpeg` |
| `fondo-04` | `fondo6.jpeg` |
| `fondo-05` | `fondo3.jpeg` |
| `fondo-06` | `fondo1.png`  |

Con estos comandos (sharp-cli 5.3.0, calidad 80, esfuerzo 6) los 12 WebP salen idénticos
byte a byte a los que están en el repo.

## Agregar una imagen

1. Revisa que se pueda usar: arte propio del juego, sin spoilers, sin datos personales. Si
   tiene texto o un logo, va al final del orden.
2. Copia el original a `dashboard/originales-sin-optimizar/`.
3. Genera las dos variantes con el siguiente número libre (ej. `fondo-07`) y revisa los pesos.
4. Agrega el nombre a `FONDOS_LOGIN` en `fondo-login.ts`, en la posición que le toque.
   El primero de la lista es el que se ve al abrir: debe ser ligero y el mejor.
5. Revisa el contraste con esa imagen activa: todo texto del login ≥ 4.5:1 contra la zona
   más clara de la imagen detrás de cada texto (método de S-66). Si no pasa, no se agrega
   (no se cambian `--login-capa` ni `--login-tarjeta` sin medir de nuevo con todas).
6. Corre `npm test` y `npm run lint` en `dashboard/` y verifica el login con la CSP
   (`npm run build:verificacion`): cero violaciones.
7. Un commit con los dos WebP y el cambio en `fondo-login.ts`. El original no se sube.

## Cambiar o quitar una imagen

- **Cambiarla:** genera de nuevo las dos variantes con el **mismo nombre** y revisa el
  contraste (paso 5). En producción no hace falta cambiar el nombre: los archivos de
  `public/` se sirven con `Cache-Control: no-cache` (`dashboard/vercel.json`), así que el
  navegador revalida en cada visita y toma la nueva en cuanto se despliega.
- **Cambiar el orden:** reordena `FONDOS_LOGIN`; no hace falta renombrar archivos.
- **Quitarla:** bórrala de `FONDOS_LOGIN` y elimina sus dos WebP.

## Caché en producción

Vercel sirve los WebP con `no-cache` y un `ETag`. En la primera visita se descargan; en las
siguientes, el navegador pregunta si cambiaron y recibe `304 Not Modified` sin cuerpo (una
petición corta por imagen, sin volver a bajar los bytes). Los archivos con hash del build
(`-XXXXXXXX.js/css/woff2`) sí llevan caché de un año (S-60).
