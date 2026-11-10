# dsh-plugin-focus-mode

Modo de lectura sin distracciones para el chat de **DeepSeek Harness Web**.

- **Shift + Enter** activa o desactiva el modo.
- **Esc** también lo desactiva.
- Dentro del modo focus, **+** (o **=**) agranda la fuente y **-** la reduce, en
  pasos del 10 %.
- **0** vuelve al tamaño normal (100 %).

Al activarlo se ocultan la barra lateral, el panel derecho, la cabecera, el
compositor, la barra de scroll, los botones de acción de los mensajes, las
llamadas a herramientas y el proceso de razonamiento. Queda el texto de la
conversación en una columna centrada de hasta 1400 px: en pantallas estrechas
conserva 32 px de margen a cada lado y en pantallas muy anchas añade el margen
necesario para no estirar las líneas.

**Importante:** `Shift+Enter` queda reservado globalmente para este modo, así
que en el compositor ya no inserta un salto de línea. Es el mismo comportamiento
que tenía la primera versión del plugin. Si más adelante querés conservar el
salto de línea, se puede condicionar el atajo a que el compositor esté vacío.

## Tamaño de fuente

Dentro del modo focus:

| Tecla | Efecto |
|---|---|
| `+` o `=` | +10 % |
| `-` | −10 % |
| `0` | volver a 100 % |

El rango va del **80 % al 200 %**. El tamaño elegido se guarda en
`localStorage` (`dsh.focusMode.fontScale.v1`) y se recupera al volver a entrar,
incluso después de recargar la página. Al salir del modo focus, la interfaz
recupera exactamente el tamaño de fuente configurado en DSH.

La escala se aplica sobre las variables de tipografía del tema
(`--dsh-content-font-size`, `--dsh-code-font-size` y
`--dsh-terminal-font-size`), así que también crecen los títulos, el código y
las líneas de texto mantienen una altura proporcional. No cambia el ancho de la
columna: el texto reflowea dentro de los mismos 1400 px.

Las teclas `+`, `-` y `0` solo actúan en modo focus, y nunca mientras haya un
campo editable, un diálogo o un menú abierto.

## Instalación

Requiere un perfil **web** de DSH (el plugin declara `dsh.client.platform:
"web"`). Probado con DSH `0.2.2-rc.1`.

1. Clona el repositorio donde quieras:

   ```sh
   git clone https://github.com/NeriVice/dsh-plugin-focus-mode.git
   ```

2. Añade la entrada a `~/.dsh/profiles/web/cordis.patch.yml`
   (ajusta la ruta absoluta al lugar donde clonaste):

   ```yaml
   - insert:
       - id: focus-mode
         name: "file:///home/tu-usuario/dsh-plugin-focus-mode/index.js"
   ```

3. Recarga la página de DSH. Con HMR el perfil se recompone solo; si el plugin
   no aparece, refresca la pestaña.

Para desinstalarlo, elimina ese bloque del parche y recarga.

## Cómo funciona

- El plugin es solo de navegador. `index.js` es una mitad de host vacía para que
  el Loader tenga una fila que montar; `client.js` es el bundle que se sirve a
  través de `exports["./client"]` y la declaración `dsh.client` del
  `package.json`.
- La combinación se captura en fase de captura sobre `window`, antes que el
  editor y antes de que el compositor inserte nada. Por eso `Shift+Enter` no
  produce un salto de línea mientras el plugin está activo; es intencionado:
  el atajo es global.
- El plugin localiza el frame del layout, la columna central y el cuerpo de la
  conversación por atributos `data-*` estables, les pone marcas propias y
  aplica el CSS. Un `MutationObserver` vuelve a marcar los nodos si React los
  reemplaza.
- Los diálogos y avisos de la capa `data-shell-overlay` siguen visibles y
  operativos; si hay un modal o un menú abierto, el plugin no intercepta
  Shift+Enter, Escape ni +/−/0 para no robarle el comportamiento.
- Al entrar, el foco pasa al transcript para que PageUp/PageDown y las flechas
  hagan scroll. Al salir se devuelve el foco al compositor y se conserva el
  borrador.
- El ajuste de fuente lee una sola vez los tamaños base del tema y los
  reescribe escalados en `<body>`; al salir restaura los valores originales.
- El modo no se guarda: recargar la página vuelve al layout normal. El tamaño
  de fuente sí se conserva para la próxima vez que entres.
- En una sesión vacía (la pantalla de bienvenida) Shift+Enter no hace nada: no
  tiene sentido ocultar todo si todavía no hay conversación que leer.

## Personalización

El ancho de lectura se puede cambiar sin tocar el plugin definiendo la variable
CSS `--dsh-focus-content-width` en el documento:

```css
:root {
  --dsh-focus-content-width: min(calc(100vw - 96px), 1100px);
}
```

El resto de la apariencia usa los tokens del tema de DSH (`--dsw-*`), así que
funciona en claro y oscuro.

## Limitaciones

- Solo Web. No está pensado para el cliente Desktop.
- Depende de los atributos `data-*` del shell. Si una versión futura cambia el
  DOM, el plugin puede ocultar de menos, pero no debería romper la interfaz.
- No entra en el fullscreen nativo del navegador (F11); oculta la interfaz de
  DSH.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
