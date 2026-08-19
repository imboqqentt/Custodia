# Custodia de equipaje

Aplicación web para atender una custodia de equipaje en un evento: se recibe el
bulto, se le asigna un ticket con código QR, se anota qué es y dónde queda en el
salón, y a la salida se busca por el QR, por el número o por el nombre.

**Funciona sin internet.** Es un archivo que se abre en el navegador. No hay
servidor, ni instalación, ni cuentas, ni base de datos que administrar. Los datos
quedan guardados dentro del navegador del equipo que atiende.

## Cómo se usa

1. **Antes del evento**, en la pestaña *Tickets*, imprime los tickets numerados.
   Cada uno sale en dos mitades con el mismo número y el mismo QR: una se pega o
   se amarra al equipaje, la otra se la lleva la persona. Córtalos por la línea
   del medio. Puedes elegir el tamaño de hoja según la que tengas a mano:

   | Hoja | Medidas | Tickets por página |
   |---|---|---|
   | Carta | 21,6 × 27,9 cm | 16 |
   | Oficio | 21,6 × 35,6 cm | 22 |
   | A4 | 21 × 29,7 cm | 18 |

   Para dejarlos en PDF en vez de imprimirlos, en el cuadro de impresión elige
   *Guardar como PDF*: la hoja ya viene con el tamaño que elegiste.
2. **Al recibir**, en la pestaña *Recibir*: nombre, qué es, una foto si alcanzas,
   y en qué zona y posición queda. Se guarda con el número del ticket.
3. **Al entregar**, en la pestaña *Entregar*: escanea el QR o escribe el número.
   Aparece en grande dónde está el equipaje, con la foto. Se marca como
   entregado y listo.

Si alguien perdió el ticket, en el mismo campo se busca por nombre: escribe
«maria» o «muñoz» y aparece. También funciona sin tildes.

### Las fotos

Hay dos botones: *Tomar una foto*, que abre la cámara del aparato, y *Subir un
archivo*, para una imagen que ya está en el computador. El segundo es el que
sirve cuando la foto la sacó otra persona con su teléfono y te la mandó por
WhatsApp: la guardas en el computador y la subes.

Y no tienes que hacerlo en el momento. En la pestaña *Listado*, cada fila tiene
un botón *Agregar* o *Cambiar* en la columna Foto, así que una imagen que llega
media hora después se pega igual a su número.

## Qué muestra el QR al escanearlo

El QR lleva un texto y nada más: `Ticket 07`. Eso es exactamente lo que verá
cualquier lector de códigos del teléfono.

Es importante entender por qué no puede mostrar más. Los tickets se imprimen
**antes** del evento, cuando todavía no existe ningún registro: al momento de
imprimirlo, ese papel no sabe de quién va a ser ni dónde va a quedar. Y los datos
viven en el computador donde se registra, no en la nube, así que el teléfono que
escanea tampoco tiene de dónde leerlos.

O sea: el QR sirve para **leer el número sin equivocarse**, no para consultar la
ficha. El nombre, la ubicación y la foto se ven en el computador, escribiendo ese
número —o el nombre— en la pestaña *Entregar*.

Con dos dígitos, la verdad es que escribir es igual de rápido que escanear. El
QR está porque el ticket se ve más formal y porque evita confundir un 6 con un 8
en una fotocopia mala.

## Cómo abrirla

**La forma simple.** Descarga `custodia.html` y ábrelo con doble clic. Ese
archivo trae todo adentro; no necesita nada más al lado y se puede llevar en un
pendrive.

**La forma recomendada si van a atender entre varios.** Publica la carpeta en una
dirección web (GitHub Pages sirve y es gratis) y ábrela desde ahí. Ojo con una
cosa: cada dispositivo guarda **sus propios** datos, no se comparten entre
equipos. Que estén todos en la misma dirección solo evita andar copiando el
archivo. **Para un evento de este tamaño, atiende desde un solo equipo.**

## Dónde quedan guardados los datos

Dentro del navegador del equipo que estés usando, en ese equipo. No viajan a
ninguna parte: no hay servidor al cual mandarlos.

**No se borran al cerrar el navegador.** Quedan escritos en el disco: puedes
cerrar la pestaña, cerrar el navegador, apagar el computador, y al día siguiente
abrir el mismo archivo y encontrar todo como estaba. Se pierden solamente si
alguien limpia los datos de navegación, si se usa una ventana de incógnito, o si
se abre en otro navegador o en otro computador.

Para el segundo día, en *Ajustes* está el botón **Respaldar y vaciar la
custodia**: descarga el respaldo del día anterior y deja la custodia en cero,
conservando el nombre del evento, las zonas y las posiciones. Es la forma segura
de empezar de nuevo, porque respalda antes de borrar.

La aplicación intenta usar la base del navegador (IndexedDB), que tiene espacio
de sobra. Si el navegador no la permite —a veces pasa al abrir el archivo
directamente desde el disco— usa el almacenamiento simple, que alcanza unos 5 MB;
en ese caso las fotos se guardan más pequeñas para que quepan. En la pestaña
*Ajustes* dice cuál de los dos está usando y cuánto espacio llevas.

Si ninguno de los dos funciona, la aplicación lo avisa en pantalla con un cartel
rojo. Ahí los datos se pierden al recargar: cambia de navegador.

> **Descarga un respaldo de vez en cuando.** El botón *Respaldar* de arriba a la
> derecha baja un archivo con todo. El numerito rojo cuenta los cambios desde el
> último respaldo. Si el equipo se apaga o alguien limpia el navegador, ese
> archivo es lo único que te salva. En *Ajustes* se vuelve a cargar.

## Cómo está pensado

Está hecho para **un evento cerrado, de una vez, con unas 50 personas y sin
riesgo real de robo**. Varias decisiones vienen de ahí:

- **Los números son correlativos y simples** (01, 02, 03…). En una custodia
  comercial habría que hacerlos difíciles de adivinar, con dígito verificador,
  porque si no cualquiera escribe el número de al lado y se lleva la maleta del
  vecino. Acá no hace falta.
- **Un ticket por persona, no por bulto.** Si alguien deja tres bolsos, quedan
  los tres juntos en la misma posición bajo un solo número. Es más rápido y para
  este tamaño no se presta a confusión.
- **El QR lleva solo el número**, nada más. Un ticket que se cae al suelo no
  revela el nombre ni el teléfono de nadie.
- **La ubicación se elige de una grilla**, no se escribe a mano. «Al lado de la
  cortina» no lo entiende quien entró a ayudar hace diez minutos. Las posiciones
  ya ocupadas aparecen bloqueadas, así no se asignan dos veces.
- **Las fotos son opcionales pero valen la pena.** Resuelven más discusiones que
  cualquier descripción escrita.

En *Ajustes* se cambia el nombre del evento —viene con «Confraternidad MINCAR»—,
los nombres de las zonas —ponles los que de verdad usen: «Entrada», «Altar»,
«Cocina»— y cuántas posiciones tiene cada una.

## El día del evento

- Lleva los tickets ya impresos y cortados, y algo para amarrarlos: elásticos,
  cinta adhesiva o alfileres de gancho.
- Ten el equipo **enchufado**. Un notebook que se apaga a mitad de la jornada es
  el peor escenario.
- Abre la aplicación una vez y déjala abierta. No hace falta internet.
- Descarga un respaldo cuando lleves la mitad y otro al final.
- Si son dos días, al terminar el primero usa *Respaldar y vaciar la custodia*.
- Al terminar, en *Listado* puedes bajar la planilla en formato de Excel.

## Escanear el QR

El botón para escanear con la cámara aparece **solo si el navegador puede
hacerlo** (hoy, principalmente Chrome en Android). Si no aparece, no es un
problema: escribir dos dígitos es igual de rápido, y buscar por nombre resuelve
el caso que de verdad ocurre, que es el ticket perdido.

## Los archivos

```
index.html              La página
assets/css/estilos.css  Los estilos
assets/js/qr.js         El generador de códigos QR, escrito desde cero
assets/js/app.js        Toda la lógica
construir.py            Arma custodia.html, la versión de un solo archivo
custodia.html           Generado por construir.py — es el que conviene usar
pruebas/probar-qr.py    Verifica el generador de QR
```

Después de tocar cualquier archivo de `assets/`, hay que regenerar el archivo
único:

```
python3 construir.py
```

No usa ninguna librería ni framework. La razón no es purismo: cualquier
dependencia externa sería una cosa más que puede no cargar justo el día que no
hay internet.

### Sobre el generador de QR

Los códigos QR se generan en el navegador, sin librerías. Están hechos según la
norma ISO/IEC 18004: versiones 1 a 3, modo byte, corrección de errores nivel M.

Se verificaron de dos maneras independientes, comparando contra
[segno](https://github.com/heuer/segno) módulo por módulo y volviendo a leer los
símbolos con el detector de OpenCV:

```
pip install segno opencv-python-headless numpy
python3 pruebas/probar-qr.py
```

En 400 cadenas al azar de 1 a 42 caracteres, las cuadrículas resultaron
idénticas a las de la norma.
