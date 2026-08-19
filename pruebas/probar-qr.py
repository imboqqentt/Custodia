#!/usr/bin/env python3
"""Verifica el generador de QR de assets/js/qr.js.

Lo comprueba de dos maneras independientes:

1. Compara la cuadrícula, módulo por módulo, contra segno, que es una
   implementación madura de la norma ISO/IEC 18004.
2. Dibuja el QR y lo vuelve a leer con el detector de OpenCV, que es lo más
   parecido a lo que hará el teléfono de alguien el día del evento.

Necesita cosas que la aplicación no usa (la aplicación no tiene dependencias):

    pip install segno opencv-python-headless numpy

    python3 pruebas/probar-qr.py

Sobre el parche a segno: en modo byte, segno agrega un byte de relleno de más,
porque calcula los bits de alineación como "8 - (largo % 8)" y eso da 8 cuando
el flujo ya venía alineado, que en modo byte es siempre. El símbolo igual se
lee —el decodificador se detiene en el terminador— pero desperdicia una palabra
de capacidad y se aparta de la norma. Aquí se corrige para poder comparar.
"""
import json
import pathlib
import random
import string
import subprocess
import sys

try:
    import cv2
    import numpy as np
    import segno
    from segno import encoder
except ImportError:
    sys.exit('Faltan dependencias: pip install segno opencv-python-headless numpy')

encoder.write_padding_bits = lambda buff, version, largo: buff.extend([0] * (-largo % 8))

RAIZ = pathlib.Path(__file__).resolve().parent.parent
QR_JS = RAIZ / 'assets' / 'js' / 'qr.js'

CASOS = [
    # Lo que de verdad llevan los tickets de la aplicación.
    'Ticket 01', 'Ticket 07', 'Ticket 50', 'Ticket 99', 'Ticket 100',
    '1', '7', '07', '42', '50',
    'Bolso 03 / Zona A',
    '0123456789ABCD',                                # 14 bytes: versión 1 al límite
    '0123456789ABCDE',                               # 15 bytes: obliga a versión 2
    '0123456789ABCDEFGHIJKLMNOP',                    # 26 bytes: versión 2 al límite
    '0123456789ABCDEFGHIJKLMNOPQ',                   # 27 bytes: obliga a versión 3
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',    # 42 bytes: versión 3 al límite
]

LECTOR = """
const QR = require(process.argv[1]);
const salida = {};
for (const c of process.argv.slice(2)) salida[c] = QR.generar(c).map((f) => f.join(''));
console.log(JSON.stringify(salida));
"""


def generar(casos):
    """Corre el generador en node y devuelve la cuadrícula de cada caso."""
    hecho = subprocess.run(
        ['node', '-e', LECTOR, '--', str(QR_JS), *casos],
        capture_output=True, text=True, check=True,
    )
    return json.loads(hecho.stdout)


def imagen(filas, escala=8, borde=4):
    """Dibuja la cuadrícula en blanco y negro, con su zona de silencio."""
    n = len(filas)
    img = np.full((n + borde * 2, n + borde * 2), 255, dtype=np.uint8)
    for f, fila in enumerate(filas):
        for c, valor in enumerate(fila):
            if valor == '1':
                img[f + borde, c + borde] = 0
    return np.kron(img, np.ones((escala, escala), dtype=np.uint8))


def referencia(texto, version):
    qr = segno.make(texto, version=version, error='m', mode='byte', boost_error=False)
    return [''.join(str(b) for b in fila) for fila in qr.matrix]


def main():
    detector = cv2.QRCodeDetector()
    fallas = 0

    print('Casos con contenido conocido')
    mio = generar(CASOS)
    for caso in CASOS:
        filas = mio[caso]
        version = (len(filas) - 17) // 4
        problemas = []
        if referencia(caso, version) != filas:
            problemas.append('la cuadrícula no coincide con segno')
        leido, _, _ = detector.detectAndDecode(imagen(filas))
        if leido != caso:
            problemas.append(f'OpenCV leyó {leido!r}')

        if problemas:
            fallas += 1
            print(f'  FALLA  {caso!r}: ' + '; '.join(problemas))
        else:
            print(f'  ok     {caso!r}: versión {version}, {len(filas)}x{len(filas)}')

    print('\nBarrido al azar')
    random.seed(7)
    alfabeto = string.ascii_letters + string.digits + ' -/.#'
    sorteo = list(dict.fromkeys(
        ''.join(random.choice(alfabeto) for _ in range(random.randint(1, 42)))
        for _ in range(400)
    ))
    mio = generar(sorteo)

    distintos = 0
    ilegibles = []
    for caso in sorteo:
        filas = mio[caso]
        if referencia(caso, (len(filas) - 17) // 4) != filas:
            distintos += 1
        leido, _, _ = detector.detectAndDecode(imagen(filas))
        if leido != caso:
            ilegibles.append(caso)

    print(f'  {len(sorteo)} cadenas de 1 a 42 caracteres')
    print(f'  distintas de segno: {distintos}')
    if distintos:
        fallas += distintos

    # Un símbolo que OpenCV no logra leer solo es un problema si es culpa
    # nuestra. Si segno produce exactamente lo mismo y tampoco se lee, el que
    # falla es el detector: el suyo es bueno, pero no infalible.
    culpa_nuestra = [
        c for c in ilegibles
        if referencia(c, (len(mio[c]) - 17) // 4) != mio[c]
    ]
    print(f'  no leídas por OpenCV: {len(ilegibles)}'
          f' (de ellas, con cuadrícula propia distinta a segno: {len(culpa_nuestra)})')
    fallas += len(culpa_nuestra)

    print()
    if fallas:
        print(f'{fallas} problema(s)')
        return 1
    print('Todo en orden: las cuadrículas son idénticas a las de la norma.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
