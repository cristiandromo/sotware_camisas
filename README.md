# Mockup Studio

Aplicación web local para componer camisetas con varias zonas de estampado, capas de imágenes, mockups y archivos listos para DTG/DTF, además de una ficha técnica de producción.

No usa backend, cuentas ni servicios externos. Todo se ejecuta en el navegador.

## Requisitos

- Navegador moderno (Chromium, Firefox o similar).
- Python 3 para servir la carpeta localmente.

No hay dependencias de Node ni instalación de paquetes.

## Inicio

```bash
cd /home/cristian/camisetas/sotware
./serve.sh
```

Abre <http://127.0.0.1:8000>.

También puedes usar otro puerto:

```bash
./serve.sh 8080
```

El servidor local es necesario para que el rasterizado de SVG y las exportaciones funcionen de forma fiable. Abrir `index.html` con doble clic puede bloquear el canvas por restricciones de origen.

## Flujo de trabajo

1. **Elige frente o espalda**.
2. **Selecciona una zona**: frente completo, pecho central, pecho izquierdo/derecho, mangas, espalda completa/alta, nuca o zona libre.
3. **Agrega capas** con el selector o arrastrando archivos sobre el lienzo. Formatos: SVG, PNG, JPG y WebP.
4. **Ajusta la capa activa**: ancho físico en centímetros, rotación, volteo y centrado.
5. **Organiza las capas**: subir, bajar, duplicar, ocultar, bloquear o eliminar. Cada zona tiene su propia pila.
6. **Exporta**:
   - Mockup PNG o JPG de la vista completa.
   - PNG de producción a 300 ppp de la zona activa, RGB y fondo transparente.
   - SVG editable de la zona activa a tamaño real.
7. **Completa la ficha técnica** y usa **Imprimir / PDF** para guardarla como PDF desde el navegador.
8. **Exporta el proyecto** (`*.mockup.json`) como respaldo o para moverlo a otro equipo.

## Zonas de estampado

Cada zona tiene su propio centro, tamaño máximo recomendado y margen seguro:

| Vista | Zonas |
| --- | --- |
| Frente | Frente completo, pecho central, pecho izquierdo, pecho derecho, manga izquierda, manga derecha, libre |
| Espalda | Espalda completa, espalda alta, nuca, manga izquierda, manga derecha, libre |

- Las zonas de manga izquierda/derecha se refieren al lado del cuerpo del usuario.
- La zona **libre** permite posicionar una capa como en la versión anterior.
- Las capas de todas las zonas se ven en el mockup; las guías muestran solo la zona activa.
- La exportación de producción es independiente por zona. Si una prenda tiene pecho y manga, se generan dos archivos.

## Especificaciones de producción

- Archivo principal: PNG RGB, 300 ppp, fondo transparente.
- El tamaño del archivo se calcula con `px = cm / 2.54 * 300`.
- Si hay varias capas en una zona, se componen en un solo archivo y se recortan a la caja envolvente común.
- Si el diseño está rotado, se usa la caja envolvente rotada.
- El PNG incluye metadatos de densidad (300 ppp) para evitar confusiones en el taller.
- La app muestra la resolución efectiva de los mapas de bits; si baja de 300 ppp conviene usar SVG o reducir el ancho.

Ejemplos:

| Tamaño | Píxeles a 300 ppp |
| --- | --- |
| 20 x 20 cm | 2362 x 2362 px |
| 20 x 10 cm | 2362 x 1181 px |
| 28 x 35 cm | 3307 x 4134 px |
| 30 x 40 cm | 3543 x 4724 px |

Notas para DTG/DTF:

- Confirma con el taller si prefiere sRGB o CMYK. Esta versión exporta sRGB.
- El PNG de producción contiene solo las capas visibles de la zona, sin camiseta ni guías.
- Evita diseños con trazos muy finos o transparencias parciales sin consultar al taller.
- El mockup es orientativo; el archivo que manda es el PNG de producción.

## Capas

- El orden de la lista va de arriba hacia abajo; la capa superior de la lista se imprime encima.
- **Ocultar** excluye la capa de los mockups y de los archivos de producción, pero conserva el archivo.
- **Bloquear** impide mover, escalar, rotar y eliminar la capa.
- **Duplicar** crea una copia desplazada 1 cm y la selecciona.
- **Subir/Bajar** cambia el orden dentro de la zona.
- Atajos: `Supr` elimina la capa activa; `Ctrl+D` la duplica; `Ctrl+Z` y `Ctrl+Shift+Z` deshacen y rehacen.

## Ficha técnica

La pestaña **Ficha técnica** genera un documento con:

- Datos de producto: marca, prenda, tejido, color, tallas y cantidad.
- Datos de estampado por zona: ubicación, tamaño en cm y píxeles, número de capas y resolución.
- Mockups de frente y espalda con todas las zonas.
- Notas de producción e identidad de marca.

Incluye **Importar brand.json** para reutilizar los datos exportados desde `desings/brand-studio` (marca, paleta y tipografías).

## Compatibilidad con proyectos v1

- Los proyectos de la versión anterior se migran automáticamente al abrir la app.
- Cada diseño v1 se mueve a la zona libre de su vista con la misma posición y tamaño.
- Se guarda en `mockup-studio:v2` y se conserva `mockup-studio:v1` como respaldo.
- La importación de proyectos acepta archivos v1 y v2.

## Estructura

```
sotware/
├─ index.html
├─ styles.css
├─ serve.sh
├─ js/
│  ├─ config.js      # colores, DPI y utilidades
│  ├─ catalog.js     # zonas y geometría de la camiseta
│  ├─ shirt.js       # plantilla SVG de camiseta
│  ├─ schema.js      # esquema v2, normalización y migración v1
│  ├─ state.js       # estado, autosave, undo/redo y proyectos
│  ├─ editor.js      # zonas, capas, manipulación e importación
│  ├─ export.js      # mockups, PNG 300 ppp y SVG por zona
│  ├─ techpack.js    # ficha técnica e importación de brand.json
│  ├─ app.js         # vistas, proyecto y atajos
│  └─ selftest.js    # pruebas de humo
├─ assets/           # recursos propios si se añaden después
└─ out/              # descargas manuales
```

## Verificación

Con el servidor local activo:

```bash
chromium --headless --disable-gpu --virtual-time-budget=12000 \
  --dump-dom "http://127.0.0.1:8000/?selftest=1" > /tmp/selftest.html
```

El reporte debe terminar en `RESULTADO: PASS`. También puedes abrir `?selftest=1` en el navegador.

El selftest comprueba geometría, DPI, transparencia, rotación, migración v1, unión de capas y almacenamiento.

Comprobación de sintaxis:

```bash
for f in js/*.js; do node --check "$f"; done
```

## Límites conocidos

- Una sola prenda: camiseta.
- Las zonas se muestran sobre una plantilla flat; no hay mockups fotorrealistas ni 3D.
- Sin herramienta de texto ni fuentes empaquetadas todavía.
- Sin lote de colorways ni paquete ZIP todavía.
- Sin conversión CMYK ni perfiles ICC.
- El autoguardado depende del espacio de `localStorage`. Los diseños se guardan embebidos; los archivos muy grandes pueden superar la cuota. Exporta el proyecto con frecuencia.
- No se valida la licencia de los logos. Arch, React, Python y otras marcas pueden tener restricciones para uso comercial.

## Privacidad

Ningún archivo sale del equipo. Todo el procesamiento ocurre en el navegador.
