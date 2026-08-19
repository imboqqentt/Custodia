#!/usr/bin/env python3
"""Arma custodia.html: la aplicación completa en un solo archivo.

El resultado no necesita la carpeta assets al lado, así que se puede llevar en
un pendrive, mandar por correo o dejar en el escritorio del computador que
atenderá la custodia.

Uso:  python3 construir.py
"""
import pathlib
import re

RAIZ = pathlib.Path(__file__).parent


def main() -> None:
    html = (RAIZ / 'index.html').read_text(encoding='utf-8')
    css = (RAIZ / 'assets/css/estilos.css').read_text(encoding='utf-8')

    html = html.replace(
        '<link rel="stylesheet" href="assets/css/estilos.css">',
        '<style>\n' + css + '\n</style>',
    )

    # El orden importa: app.js usa QR, que define qr.js.
    for archivo in ('assets/js/qr.js', 'assets/js/app.js'):
        codigo = (RAIZ / archivo).read_text(encoding='utf-8')
        html = html.replace(
            f'<script src="{archivo}"></script>',
            '<script>\n' + codigo + '\n</script>',
        )

    destino = RAIZ / 'custodia.html'
    destino.write_text(html, encoding='utf-8')
    print(f'{destino.name}: {destino.stat().st_size / 1024:.0f} KB')

    sobrantes = re.findall(r'(?<!/)assets/(?:css|js)/[\w.-]+', html)
    if sobrantes:
        raise SystemExit(f'quedaron archivos sin incrustar: {sorted(set(sobrantes))}')


if __name__ == '__main__':
    main()
