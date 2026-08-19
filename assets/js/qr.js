/* Generador de códigos QR.
 *
 * Versiones 1 a 3, modo byte, nivel de corrección de errores M (recupera ~15%).
 * Alcanza 42 caracteres: de sobra para el número de un ticket.
 *
 * Está escrito a mano y sin dependencias a propósito: la aplicación tiene que
 * funcionar sin internet, así que no puede cargar ninguna librería externa.
 */
const QR = (() => {
  'use strict';

  /* --- Aritmética en el campo de Galois GF(256), polinomio 0x11D --- */

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);

  (function tablas() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  /* --- Reed-Solomon --- */

  // Polinomio generador de grado n: el producto de (x - α^i) para i de 0 a n-1.
  function generador(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const r = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        r[j] ^= g[j];
        r[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = r;
    }
    return g;
  }

  // Los n bytes de corrección: el resto de dividir los datos por el generador.
  function correccion(datos, n) {
    const g = generador(n);
    const r = datos.concat(new Array(n).fill(0));
    for (let i = 0; i < datos.length; i++) {
      const c = r[i];
      if (c === 0) continue;
      for (let j = 1; j < g.length; j++) r[i + j] ^= mul(g[j], c);
    }
    return r.slice(datos.length);
  }

  /* --- Versiones (todas de un solo bloque, por eso no hay que intercalar) --- */

  const VERSIONES = [
    { tamano: 21, datos: 16, ec: 10, alineacion: [] },
    { tamano: 25, datos: 28, ec: 16, alineacion: [6, 18] },
    { tamano: 29, datos: 44, ec: 26, alineacion: [6, 22] },
  ];

  // Cabecera del modo byte: 4 bits de modo + 8 bits de largo.
  const CABECERA = 12;

  /* --- Los datos, convertidos a palabras de 8 bits --- */

  function palabras(bytes, cfg) {
    const buf = [];
    const push = (valor, largo) => {
      for (let i = largo - 1; i >= 0; i--) buf.push((valor >> i) & 1);
    };

    push(0b0100, 4); // modo byte
    push(bytes.length, 8); // indicador de cantidad (versiones 1 a 9)
    bytes.forEach((b) => push(b, 8));

    const capacidad = cfg.datos * 8;
    for (let i = 0; i < 4 && buf.length < capacidad; i++) buf.push(0); // terminador
    while (buf.length % 8) buf.push(0);

    const salida = [];
    for (let i = 0; i < buf.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | buf[i + j];
      salida.push(v);
    }

    const relleno = [0xec, 0x11];
    for (let i = 0; salida.length < cfg.datos; i++) salida.push(relleno[i % 2]);
    return salida;
  }

  /* --- La cuadrícula --- */

  // Devuelve la cuadrícula con los patrones fijos puestos y un mapa que marca
  // qué celdas son fijas, para que ni los datos ni la máscara las toquen.
  function cuadricula(cfg, flujo) {
    const n = cfg.tamano;
    const m = Array.from({ length: n }, () => new Array(n).fill(0));
    const fijo = Array.from({ length: n }, () => new Array(n).fill(false));
    const poner = (f, c, v) => {
      m[f][c] = v;
      fijo[f][c] = true;
    };

    // Patrones de localización (las tres esquinas) con su separador.
    for (const [f0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      for (let f = -1; f <= 7; f++) {
        for (let c = -1; c <= 7; c++) {
          const ff = f0 + f;
          const cc = c0 + c;
          if (ff < 0 || ff >= n || cc < 0 || cc >= n) continue;
          const marco =
            (f >= 0 && f <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (f === 0 || f === 6));
          const centro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
          poner(ff, cc, marco || centro ? 1 : 0);
        }
      }
    }

    // Patrones de sincronismo: la fila y la columna 6.
    for (let i = 8; i < n - 8; i++) {
      poner(6, i, i % 2 === 0 ? 1 : 0);
      poner(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Patrones de alineación, salvo los que chocarían con las esquinas.
    for (const f0 of cfg.alineacion) {
      for (const c0 of cfg.alineacion) {
        const esquina =
          (f0 <= 8 && c0 <= 8) || (f0 <= 8 && c0 >= n - 9) || (f0 >= n - 9 && c0 <= 8);
        if (esquina) continue;
        for (let f = -2; f <= 2; f++) {
          for (let c = -2; c <= 2; c++) {
            poner(f0 + f, c0 + c, Math.max(Math.abs(f), Math.abs(c)) === 1 ? 0 : 1);
          }
        }
      }
    }

    // Reserva del espacio del formato, incluido el módulo oscuro obligatorio.
    // Va en blanco a propósito: forma parte del formato, así que no debe
    // influir en el puntaje con que se elige la máscara.
    poner(n - 8, 8, 0);
    for (let i = 0; i <= 8; i++) {
      if (!fijo[8][i]) poner(8, i, 0);
      if (!fijo[i][8]) poner(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (!fijo[8][n - 1 - i]) poner(8, n - 1 - i, 0);
      if (!fijo[n - 1 - i][8]) poner(n - 1 - i, 8, 0);
    }

    // Los datos se escriben en zigzag, de a dos columnas, desde abajo a la derecha.
    let bit = 0;
    let subiendo = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--; // la columna de sincronismo no cuenta
      for (let k = 0; k < n; k++) {
        const fila = subiendo ? n - 1 - k : k;
        for (const c of [col, col - 1]) {
          if (fijo[fila][c]) continue;
          m[fila][c] = bit < flujo.length ? flujo[bit] : 0;
          bit++;
        }
      }
      subiendo = !subiendo;
    }

    return { m, fijo };
  }

  /* --- Máscaras y formato --- */

  const MASCARAS = [
    (f, c) => (f + c) % 2 === 0,
    (f) => f % 2 === 0,
    (f, c) => c % 3 === 0,
    (f, c) => (f + c) % 3 === 0,
    (f, c) => (Math.floor(f / 2) + Math.floor(c / 3)) % 2 === 0,
    (f, c) => ((f * c) % 2) + ((f * c) % 3) === 0,
    (f, c) => (((f * c) % 2) + ((f * c) % 3)) % 2 === 0,
    (f, c) => (((f + c) % 2) + ((f * c) % 3)) % 2 === 0,
  ];

  // 15 bits: 5 de datos (nivel + máscara) y 10 de BCH, todo con una máscara fija.
  function formato(mascara) {
    const datos = (0b00 << 3) | mascara; // 00 = nivel M
    let v = datos << 10;
    for (let i = 4; i >= 0; i--) if (v & (1 << (i + 10))) v ^= 0x537 << i;
    return ((datos << 10) | v) ^ 0x5412;
  }

  function ponerFormato(m, mascara) {
    const n = m.length;
    const f = formato(mascara);
    const bit = (i) => (f >> i) & 1;

    // Primera copia, repartida alrededor de la esquina superior izquierda.
    for (let i = 0; i <= 5; i++) m[8][i] = bit(14 - i);
    m[8][7] = bit(8);
    m[8][8] = bit(7);
    m[7][8] = bit(6);
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);

    // Segunda copia, repartida entre las otras dos esquinas.
    for (let i = 0; i <= 6; i++) m[n - 1 - i][8] = bit(14 - i);
    for (let j = 0; j <= 7; j++) m[8][n - 8 + j] = bit(7 - j);

    m[n - 8][8] = 1;
  }

  /* --- Puntaje: se elige la máscara que deja el dibujo más fácil de leer --- */

  // La proporción 1:1:3:1:1 del patrón de localización. Penaliza si aparece
  // suelta en el dibujo, porque un lector la puede confundir con una esquina.
  const CASI_LOCALIZACION = [1, 0, 1, 1, 1, 0, 1];

  function puntaje(m) {
    const n = m.length;
    let p = 0;

    // Regla 1: series de cinco o más módulos del mismo color.
    for (let i = 0; i < n; i++) {
      for (const leer of [(k) => m[i][k], (k) => m[k][i]]) {
        let serie = 1;
        for (let k = 1; k < n; k++) {
          if (leer(k) === leer(k - 1)) {
            serie++;
          } else {
            if (serie >= 5) p += serie - 2;
            serie = 1;
          }
        }
        if (serie >= 5) p += serie - 2;
      }
    }

    // Regla 2: bloques de 2x2 del mismo color.
    for (let f = 0; f < n - 1; f++) {
      for (let c = 0; c < n - 1; c++) {
        const v = m[f][c];
        if (v === m[f][c + 1] && v === m[f + 1][c] && v === m[f + 1][c + 1]) p += 3;
      }
    }

    // Regla 3: la proporción 1:1:3:1:1 con una zona clara de cuatro módulos a
    // alguno de los dos lados. Contra el borde del símbolo también cuenta,
    // porque ahí la zona clara la pone el margen blanco.
    const claro = (leer, desde, hasta) => {
      for (let k = Math.max(desde, 0); k < Math.min(hasta, n); k++) if (leer(k)) return false;
      return true;
    };
    for (let i = 0; i < n; i++) {
      for (const leer of [(k) => m[i][k], (k) => m[k][i]]) {
        let k = 0;
        while (k + 7 <= n) {
          let igual = true;
          for (let j = 0; j < 7 && igual; j++) if (leer(k + j) !== CASI_LOCALIZACION[j]) igual = false;
          if (!igual) {
            k++;
          } else if (k === 0 || k === n - 7 || claro(leer, k - 4, k) || claro(leer, k + 7, k + 11)) {
            p += 40;
            k += 7;
          } else {
            // Sin zona clara suficiente: el siguiente calce posible empieza
            // dentro de los tres módulos oscuros del centro.
            k += 4;
          }
        }
      }
    }

    // Regla 4: cuánto se aleja del 50% de módulos oscuros.
    let oscuros = 0;
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) oscuros += m[f][c];
    p += Math.floor(Math.abs((oscuros * 100) / (n * n) - 50) / 5) * 10;

    return p;
  }

  /* --- Interfaz pública --- */

  // Devuelve la cuadrícula del QR: un arreglo de filas de 0 y 1.
  function generar(texto) {
    const bytes = Array.from(new TextEncoder().encode(String(texto)));
    const cfg = VERSIONES.find((v) => CABECERA + bytes.length * 8 <= v.datos * 8);
    if (!cfg) throw new Error('El texto no cabe en el QR: el máximo son 42 caracteres.');

    const datos = palabras(bytes, cfg);
    const flujo = [];
    datos.concat(correccion(datos, cfg.ec)).forEach((v) => {
      for (let i = 7; i >= 0; i--) flujo.push((v >> i) & 1);
    });

    const base = cuadricula(cfg, flujo);
    let mejor = null;
    let mejorMascara = 0;
    let mejorPuntaje = Infinity;

    // La norma es explícita: la máscara se evalúa sobre el dibujo sin la
    // información de formato, y recién después se escribe la del ganador.
    for (let k = 0; k < 8; k++) {
      const m = base.m.map((fila) => fila.slice());
      for (let f = 0; f < m.length; f++) {
        for (let c = 0; c < m.length; c++) {
          if (!base.fijo[f][c] && MASCARAS[k](f, c)) m[f][c] ^= 1;
        }
      }
      const p = puntaje(m);
      if (p < mejorPuntaje) {
        mejorPuntaje = p;
        mejorMascara = k;
        mejor = m;
      }
    }

    ponerFormato(mejor, mejorMascara);
    return mejor;
  }

  // Devuelve el QR como SVG, listo para meter en el HTML o imprimir.
  // El borde blanco de 4 módulos no es decorativo: sin él los lectores fallan.
  function svg(texto, borde = 4) {
    const m = generar(texto);
    const n = m.length;
    const total = n + borde * 2;
    let trazo = '';

    for (let f = 0; f < n; f++) {
      for (let c = 0; c < n; c++) {
        if (m[f][c]) trazo += `M${c + borde} ${f + borde}h1v1h-1z`;
      }
    }

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
      `shape-rendering="crispEdges" role="img" aria-label="Código QR ${texto}">` +
      `<rect width="${total}" height="${total}" fill="#fff"/>` +
      `<path d="${trazo}" fill="#000"/></svg>`
    );
  }

  return { generar, svg };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QR;
