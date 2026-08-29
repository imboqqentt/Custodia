/* Custodia de equipaje — toda la lógica de la aplicación.
   Sin dependencias ni servidor: se abre y funciona, con o sin internet. */

(() => {
  'use strict';

  const AJUSTES_INICIALES = {
    evento: 'Confraternidad MINCAR',
    zonas: ['A', 'B', 'C'],
    posiciones: 20,
    color: '#1a6154',
  };

  const COLORES = [
    { hex: '#1a6154', nombre: 'Verde' },
    { hex: '#1c4f7c', nombre: 'Azul' },
    { hex: '#7a2f3a', nombre: 'Burdeo' },
    { hex: '#4a3b7a', nombre: 'Morado' },
    { hex: '#6b4423', nombre: 'Café' },
    { hex: '#3a4550', nombre: 'Pizarra' },
  ];

  const ATAJOS = ['Mochila', 'Bolso', 'Maleta', 'Cartera', 'Bolsa', 'Coche', 'Abrigo'];

  const estado = {
    ajustes: { ...AJUSTES_INICIALES },
    registros: [],
    respaldadoEn: 0, // cuántos cambios llevaba el registro en el último respaldo
    cambios: 0,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ══════════════════════════ Guardado ══════════════════════════
     Primero se intenta IndexedDB, que no tiene un tope incómodo. Algunos
     navegadores no la permiten cuando la página se abre directamente desde
     el disco; ahí se cae a localStorage, que aguanta unos 5 MB, y por eso las
     fotos se achican más en ese modo. Si tampoco hay, todo queda en memoria
     y se avisa en pantalla, porque así sí se pierde al recargar. */

  const Almacen = {
    modo: 'memoria',
    bd: null,

    async iniciar() {
      try {
        this.bd = await this.abrirIDB();
        this.modo = 'indexeddb';
        return;
      } catch (_) {
        /* sigue con el plan B */
      }
      try {
        localStorage.setItem('custodia:prueba', '1');
        localStorage.removeItem('custodia:prueba');
        this.modo = 'localstorage';
      } catch (_) {
        this.modo = 'memoria';
      }
    },

    abrirIDB() {
      return new Promise((resolver, rechazar) => {
        let solicitud;
        try {
          solicitud = indexedDB.open('custodia', 1);
        } catch (error) {
          return rechazar(error);
        }
        solicitud.onupgradeneeded = () => {
          const bd = solicitud.result;
          if (!bd.objectStoreNames.contains('estado')) bd.createObjectStore('estado');
        };
        solicitud.onsuccess = () => resolver(solicitud.result);
        solicitud.onerror = () => rechazar(solicitud.error);
        solicitud.onblocked = () => rechazar(new Error('base bloqueada'));
      });
    },

    async leer() {
      if (this.modo === 'indexeddb') {
        return new Promise((resolver, rechazar) => {
          const t = this.bd.transaction('estado', 'readonly').objectStore('estado').get('todo');
          t.onsuccess = () => resolver(t.result || null);
          t.onerror = () => rechazar(t.error);
        });
      }
      if (this.modo === 'localstorage') {
        const crudo = localStorage.getItem('custodia:estado');
        return crudo ? JSON.parse(crudo) : null;
      }
      return null;
    },

    async escribir(datos) {
      if (this.modo === 'indexeddb') {
        return new Promise((resolver, rechazar) => {
          const t = this.bd.transaction('estado', 'readwrite').objectStore('estado').put(datos, 'todo');
          t.onsuccess = () => resolver();
          t.onerror = () => rechazar(t.error);
        });
      }
      if (this.modo === 'localstorage') {
        localStorage.setItem('custodia:estado', JSON.stringify(datos));
      }
    },

    async borrar() {
      if (this.modo === 'indexeddb') {
        return new Promise((resolver) => {
          const t = this.bd.transaction('estado', 'readwrite').objectStore('estado').delete('todo');
          t.onsuccess = t.onerror = () => resolver();
        });
      }
      if (this.modo === 'localstorage') localStorage.removeItem('custodia:estado');
    },
  };

  async function guardar() {
    const datos = {
      ajustes: estado.ajustes,
      registros: estado.registros,
      respaldadoEn: estado.respaldadoEn,
      cambios: estado.cambios,
    };
    try {
      await Almacen.escribir(datos);
    } catch (error) {
      const lleno = /quota|exceeded/i.test(String(error && error.name) + String(error && error.message));
      avisar(
        lleno
          ? 'No queda espacio para guardar. Descarga un respaldo y saca fotos de los registros ya entregados.'
          : 'No se pudo guardar el último cambio. Descarga un respaldo por si acaso.',
        false
      );
      throw error;
    }
  }

  /* ══════════════════════════ Utilidades ══════════════════════════ */

  const escapar = (texto) =>
    String(texto == null ? '' : texto).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const normalizar = (texto) =>
    String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // saca las tildes: «Muñoz» encuentra a «munoz»
      .toLowerCase()
      .trim();

  const codigo = (numero) => String(numero).padStart(2, '0');

  // En 24 horas: ocupa la mitad del ancho que «12:07 p. m.» y no se presta a dudas.
  const hora = (iso) =>
    iso
      ? new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '';

  const fechaHora = (iso) =>
    iso ? new Date(iso).toLocaleString('es-CL', { hour12: false }) : '';

  const ubicacionDe = (r) => (r.zona ? `${r.zona}-${r.posicion}` : 'sin ubicación');

  // Para los botones: «María González Rojas» cabe mal, «María González» sí.
  const nombreCorto = (nombre) => String(nombre || '').trim().split(/\s+/).slice(0, 2).join(' ');

  function avisar(mensaje, bien = true) {
    const caja = $('#alerta');
    caja.textContent = mensaje;
    caja.className = 'alerta' + (bien ? ' alerta--ok' : '');
    caja.hidden = false;
    clearTimeout(avisar.reloj);
    avisar.reloj = setTimeout(() => {
      caja.hidden = true;
    }, bien ? 3500 : 9000);
  }

  /* Descargar un archivo.

     Abierta como un archivo en el computador —que es como se va a usar en el
     evento— basta con un enlace. Pero si la página está publicada en claude.ai,
     corre dentro de un visor que no deja que una página descargue nada por su
     cuenta: hay que pedírselo al visor, que le muestra una confirmación a la
     persona y puede decir que no.

     Se pregunta apenas arranca porque la respuesta puede tardar varios
     segundos. Fuera de claude.ai window.claude no existe y todo sigue por el
     camino de siempre. */
  const visorDescargas =
    window.claude && typeof window.claude.use === 'function'
      ? window.claude.use('downloads').catch(() => null)
      : Promise.resolve(null);

  const FALLAS = {
    declined: 'No se guardó el archivo: se canceló la descarga.',
    too_large: 'El archivo pesa demasiado para guardarlo así. El tope son 16 MB.',
    rate_limited: 'Hay otra descarga esperando respuesta. Contéstala y vuelve a intentar.',
  };

  // Devuelve true solo si el archivo quedó guardado de verdad. Quien borre algo
  // después de respaldar tiene que mirar ese valor antes de borrar.
  async function descargar(nombre, contenido, tipo) {
    const visor = await visorDescargas;

    if (visor) {
      try {
        await visor.save({ filename: nombre, data: contenido });
        return true;
      } catch (error) {
        const codigo = (error && error.code) || 'unavailable';
        avisar(FALLAS[codigo] || 'No se pudo guardar el archivo aquí.', false);
        return false;
      }
    }

    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
    return true;
  }

  /* Un ticket pasa por tres estados:

       custodia  — el bulto está en su lugar del salón.
       tomado    — su dueño lo tiene ahora, pero lo va a devolver. El lugar
                   queda reservado, no se le da a nadie más.
       entregado — se lo llevó y el ticket se cierra.

     Los dos primeros siguen siendo responsabilidad de la custodia; por eso
     «a cargo» los cuenta a los dos. */
  const ESTADOS = ['custodia', 'tomado', 'entregado'];

  const aCargo = () => estado.registros.filter((r) => r.estado !== 'entregado');
  const cuantos = (cual) => estado.registros.filter((r) => r.estado === cual).length;
  const buscarRegistro = (numero) => estado.registros.find((r) => r.numero === numero);

  // Los respaldos viejos y los registros de antes de que existiera «tomado»
  // solo tienen la fecha de entrega: de ahí se deduce en qué estado quedaron.
  function completar(registro) {
    if (!ESTADOS.includes(registro.estado)) {
      registro.estado = registro.entrega ? 'entregado' : 'custodia';
    }
    if (registro.tomado === undefined) registro.tomado = null;
    if (typeof registro.salidas !== 'number') registro.salidas = 0;
    if (typeof registro.hospedador !== 'string') registro.hospedador = '';
    if (registro.retirado === undefined) registro.retirado = null;
    return registro;
  }

  function siguienteNumero() {
    let n = 1;
    while (buscarRegistro(n)) n++;
    return n;
  }

  // «excepto» es el ticket que se está editando: su propia posición no puede
  // aparecerle bloqueada, o no habría cómo dejarlo donde ya está.
  function ocupadas(zona, excepto = null) {
    return new Set(
      aCargo()
        .filter((r) => r.zona === zona && r.numero !== excepto)
        .map((r) => r.posicion)
    );
  }

  function primeraLibre(zona) {
    const usadas = ocupadas(zona, recibir.editando);
    for (let i = 1; i <= estado.ajustes.posiciones; i++) if (!usadas.has(i)) return i;
    return null;
  }

  /* ══════════════════════════ El color de la aplicación ══════════════════════════

     Se deja elegir cualquier color, así que hay que asegurarse de que la
     aplicación siga legible con el que sea. De un color se derivan cuatro:

       acento  — el color tal cual, para los rellenos.
       texto   — blanco o tinta, el que contraste mejor ENCIMA del acento.
       oscuro  — el acento oscurecido hasta que se lea sobre fondo blanco. Sin
                 esto, un amarillo elegido a la ligera dejaría la ubicación en
                 grande prácticamente invisible.
       suave   — apenas teñido, para fondos.

     El umbral 4.5:1 es el que pide la norma de accesibilidad WCAG para texto. */

  const aRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  const aHex = (rgb) =>
    '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

  function luminancia(rgb) {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contraste(a, b) {
    const [menor, mayor] = [luminancia(a), luminancia(b)].sort((x, y) => x - y);
    return (mayor + 0.05) / (menor + 0.05);
  }

  const mezclar = (rgb, otro, parte) => rgb.map((v, i) => v * (1 - parte) + otro[i] * parte);

  const BLANCO = [255, 255, 255];
  const TINTA = [33, 37, 44];
  const NEGRO = [0, 0, 0];

  function paleta(hex) {
    const base = aRGB(hex);

    let oscuro = base;
    // Oscurecer de a poco hasta que se lea sobre blanco.
    for (let i = 0; i < 20 && contraste(oscuro, BLANCO) < 4.5; i++) {
      oscuro = mezclar(oscuro, NEGRO, 0.08);
    }

    return {
      acento: aHex(base),
      texto: aHex(contraste(base, BLANCO) >= contraste(base, TINTA) ? BLANCO : TINTA),
      oscuro: aHex(oscuro),
      suave: aHex(mezclar(base, BLANCO, 0.88)),
      fondo: aHex(mezclar(base, BLANCO, 0.945)),
      linea: aHex(mezclar(base, BLANCO, 0.84)),
      borde: aHex(mezclar(base, BLANCO, 0.66)),
    };
  }

  const colorValido = (hex) => typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex);

  function aplicarColor() {
    const hex = colorValido(estado.ajustes.color) ? estado.ajustes.color : AJUSTES_INICIALES.color;
    const p = paleta(hex);
    const raiz = document.documentElement.style;

    raiz.setProperty('--acento', p.acento);
    raiz.setProperty('--acento-texto', p.texto);
    raiz.setProperty('--acento-oscuro', p.oscuro);
    raiz.setProperty('--acento-suave', p.suave);
    raiz.setProperty('--fondo', p.fondo);
    raiz.setProperty('--linea', p.linea);
    raiz.setProperty('--borde', p.borde);

    $('#a-color').value = hex;
    $$('#a-tintes .tinte').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === hex)));

    const sugerido = COLORES.find((c) => c.hex === hex);
    $('#a-color-nota').textContent = sugerido
      ? `Color: ${sugerido.nombre} (${hex}).`
      : `Color propio: ${hex}. Si queda muy claro, la aplicación lo oscurece sola donde ` +
        'hace falta para que el texto se siga leyendo.';
  }

  async function elegirColor(hex) {
    if (!colorValido(hex)) return;
    estado.ajustes.color = hex.toLowerCase();
    aplicarColor();
    estado.cambios++;
    await guardar();
  }

  /* ══════════════════════════ Tickets ══════════════════════════ */

  // Lo que lleva el QR. Va con la palabra «Ticket» adelante para que, si alguien
  // lo escanea con cualquier lector del teléfono, en pantalla aparezca algo que
  // se entiende solo y no un número suelto sin contexto.
  const contenidoQR = (numero) => `Ticket ${codigo(numero)}`;

  function ticketHTML(numero, extra = '') {
    const cod = codigo(numero);
    const qr = QR.svg(contenidoQR(numero));
    const evento = escapar(estado.ajustes.evento);
    const mitad = (rol) => `
      <div class="ticket__mitad">
        <div class="ticket__qr">${qr}</div>
        <div class="ticket__texto">
          <div class="ticket__evento">${evento}</div>
          <div class="ticket__numero">${cod}</div>
          <div class="ticket__rol">${rol}</div>
        </div>
      </div>`;
    return `<div class="ticket ${extra}">${mitad('pegar al equipaje')}${mitad('para la persona')}</div>`;
  }

  function imprimir(html) {
    $('#lamina').innerHTML = html;
    window.print();
  }

  /* ══════════════════════════ Pestañas ══════════════════════════ */

  function mostrarPanel(nombre) {
    $$('.pestana').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === nombre)));
    $$('.panel').forEach((p) => {
      p.hidden = p.id !== `panel-${nombre}`;
    });
    if (nombre === 'entregar') {
      $('#e-busca').focus();
      $('#e-busca').select();
    }
    if (nombre === 'listado') pintarListado();
    if (nombre === 'ajustes') pintarAjustes();
  }

  /* ══════════════════════════ Recibir ══════════════════════════ */

  const recibir = {
    foto: null,
    zona: null,
    posicion: null,
    ultimo: null, // el ticket recién emitido, para poder reimprimirlo
    editando: null, // el ticket que se está corrigiendo, o null si es uno nuevo
    volverA: 'recibir', // a qué pestaña volver al terminar de corregir
  };

  function pintarZonas() {
    const caja = $('#r-zonas');
    caja.innerHTML = estado.ajustes.zonas
      .map(
        (z) =>
          `<button type="button" class="zona" role="radio" data-zona="${escapar(z)}" ` +
          `aria-checked="${z === recibir.zona}">${escapar(z)}</button>`
      )
      .join('');
    pintarPosiciones();
  }

  function pintarPosiciones() {
    const caja = $('#r-posiciones');
    if (!recibir.zona) {
      caja.innerHTML = '';
      $('#r-ubicacion-elegida').textContent = 'Elige una zona.';
      return;
    }
    const usadas = ocupadas(recibir.zona, recibir.editando);
    let html = '';
    for (let i = 1; i <= estado.ajustes.posiciones; i++) {
      const ocupada = usadas.has(i);
      html +=
        `<button type="button" class="posicion${ocupada ? ' posicion--ocupada' : ''}" role="radio" ` +
        `data-posicion="${i}" aria-checked="${recibir.posicion === i}" ` +
        `${ocupada ? 'disabled aria-label="Posición ' + i + ', ocupada"' : ''}>${i}</button>`;
    }
    caja.innerHTML = html;
    $('#r-ubicacion-elegida').textContent = recibir.posicion
      ? `Queda en ${recibir.zona}-${recibir.posicion}.`
      : 'Elige una posición.';
  }

  function mostrarFoto(dato) {
    recibir.foto = dato || null;
    const vista = $('#r-foto-vista');
    if (recibir.foto) {
      vista.src = recibir.foto;
      vista.hidden = false;
      $('#r-foto-quitar').hidden = false;
    } else {
      vista.hidden = true;
      vista.removeAttribute('src');
      $('#r-foto-quitar').hidden = true;
    }
    $('#r-foto-camara').value = '';
    $('#r-foto-archivo').value = '';
  }

  // El mismo formulario sirve para recibir y para corregir. Duplicarlo habría
  // significado mantener dos veces las mismas validaciones y la misma grilla de
  // posiciones, y que se fueran separando con el tiempo.
  function prepararRecibir() {
    recibir.editando = null;
    $('#forma-recibir').reset();
    $('#r-numero').value = siguienteNumero();
    $('#r-bultos').value = 1;
    mostrarFoto(null);

    if (!recibir.zona || !estado.ajustes.zonas.includes(recibir.zona)) {
      recibir.zona = estado.ajustes.zonas[0] || null;
    }
    recibir.posicion = recibir.zona ? primeraLibre(recibir.zona) : null;
    pintarZonas();

    $('#r-editando').hidden = true;
    $('#r-guardar').textContent = 'Guardar y ver el ticket';
    $('#comprobante').hidden = true;
    $('#forma-recibir').hidden = false;
    $('#r-nombre').focus();
  }

  function editarRegistro(numero, volverA) {
    const registro = buscarRegistro(numero);
    if (!registro) return;

    recibir.editando = numero;
    recibir.volverA = volverA;

    $('#forma-recibir').reset();
    $('#r-numero').value = registro.numero;
    $('#r-nombre').value = registro.nombre;
    $('#r-telefono').value = registro.telefono;
    $('#r-hospedador').value = registro.hospedador;
    $('#r-bultos').value = registro.bultos;
    $('#r-descripcion').value = registro.descripcion;
    mostrarFoto(registro.foto);

    recibir.zona = estado.ajustes.zonas.includes(registro.zona) ? registro.zona : estado.ajustes.zonas[0];
    recibir.posicion = recibir.zona === registro.zona ? registro.posicion : primeraLibre(recibir.zona);
    pintarZonas();

    $('#r-editando-texto').textContent = `Corrigiendo el ticket ${codigo(numero)} de ${registro.nombre}.`;
    $('#r-editando').hidden = false;
    $('#r-guardar').textContent = 'Guardar los cambios';
    $('#comprobante').hidden = true;
    $('#forma-recibir').hidden = false;
    mostrarPanel('recibir');
    $('#r-nombre').focus();
  }

  function cancelarEdicion() {
    const volver = recibir.volverA;
    prepararRecibir();
    if (volver !== 'recibir') mostrarPanel(volver);
  }

  // Las fotos se achican bastante a propósito. Sirven para reconocer un bulto,
  // no para ampliarlas, y con localStorage el espacio se acaba rápido.
  function comprimirFoto(archivo) {
    const lado = Almacen.modo === 'localstorage' ? 560 : 900;
    const calidad = Almacen.modo === 'localstorage' ? 0.55 : 0.72;
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error('No se pudo leer la foto.'));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => rechazar(new Error('No se pudo abrir la foto.'));
        img.onload = () => {
          const escala = Math.min(1, lado / Math.max(img.width, img.height));
          const lienzo = document.createElement('canvas');
          lienzo.width = Math.max(1, Math.round(img.width * escala));
          lienzo.height = Math.max(1, Math.round(img.height * escala));
          lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
          resolver(lienzo.toDataURL('image/jpeg', calidad));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  async function guardarRecibido(evento) {
    evento.preventDefault();

    const numero = Number($('#r-numero').value);
    const nombre = $('#r-nombre').value.trim();
    const corrigiendo = recibir.editando;

    if (!nombre) return avisar('Falta el nombre.', false);
    if (!numero || numero < 1) return avisar('El número de ticket no es válido.', false);
    // Al corregir se puede cambiar el número —por ejemplo si se anotó uno y se
    // entregó otro—, pero no puede chocar con el de otra persona.
    const dueno = buscarRegistro(numero);
    if (dueno && dueno.numero !== corrigiendo) {
      return avisar(`El ticket ${codigo(numero)} ya está usado. Prueba con otro número.`, false);
    }
    if (!recibir.zona || !recibir.posicion) return avisar('Falta indicar dónde queda el equipaje.', false);

    const datos = {
      numero,
      nombre,
      telefono: $('#r-telefono').value.trim(),
      hospedador: $('#r-hospedador').value.trim(),
      bultos: Math.max(1, Number($('#r-bultos').value) || 1),
      descripcion: $('#r-descripcion').value.trim(),
      foto: recibir.foto,
      zona: recibir.zona,
      posicion: recibir.posicion,
    };

    if (corrigiendo != null) {
      const registro = buscarRegistro(corrigiendo);
      const antes = { ...registro };
      // Solo cambian los datos: el estado, la hora de ingreso y el historial de
      // salidas son hechos ocurridos, no algo que se corrija en un formulario.
      Object.assign(registro, datos);
      estado.cambios++;

      try {
        await guardar();
      } catch (_) {
        Object.assign(registro, antes);
        estado.cambios--;
        return;
      }

      const volver = recibir.volverA;
      prepararRecibir();
      if (volver !== 'recibir') mostrarPanel(volver);
      actualizarResumen();
      pintarListado();
      return avisar(`Ticket ${codigo(numero)} corregido.`);
    }

    estado.registros.push({
      ...datos,
      ingreso: new Date().toISOString(),
      estado: 'custodia',
      tomado: null,
      entrega: null,
      salidas: 0,
      retirado: null,
    });
    estado.cambios++;

    try {
      await guardar();
    } catch (_) {
      estado.registros.pop();
      estado.cambios--;
      return;
    }

    recibir.ultimo = numero;
    $('#comprobante-ticket').innerHTML = ticketHTML(numero, 'ticket--solo');
    $('#forma-recibir').hidden = true;
    $('#comprobante').hidden = false;
    $('#recibir-otro').focus();
    actualizarResumen();
  }

  /* ══════════════════════════ Entregar ══════════════════════════ */

  let elegido = null;

  function coincide(registro, consulta) {
    if (!consulta) return false;
    if (/^\d+$/.test(consulta)) {
      if (registro.numero === Number(consulta)) return true;
      // Con tres dígitos o más ya vale la pena buscar por teléfono; con uno o
      // dos calzaría con medio mundo.
      const telefono = String(registro.telefono || '').replace(/\D/g, '');
      return consulta.length >= 3 && telefono.includes(consulta);
    }
    return (
      normalizar(registro.nombre).includes(consulta) ||
      normalizar(registro.hospedador).includes(consulta) ||
      normalizar(registro.descripcion).includes(consulta) ||
      normalizar(ubicacionDe(registro)).includes(consulta)
    );
  }

  function buscarEntrega() {
    const consulta = normalizar($('#e-busca').value);
    const caja = $('#e-resultados');
    elegido = null;
    $('#e-ficha').innerHTML = '';

    if (!consulta) {
      caja.innerHTML = '';
      return;
    }

    // Los cerrados al final: casi siempre se busca algo que todavía está.
    const hallados = estado.registros
      .filter((r) => coincide(r, consulta))
      .sort(
        (a, b) =>
          Number(a.estado === 'entregado') - Number(b.estado === 'entregado') || a.numero - b.numero
      );

    if (!hallados.length) {
      caja.innerHTML = '<p class="vacio">Nada con eso. Prueba con el nombre, o revisa el listado.</p>';
      return;
    }

    if (hallados.length === 1) {
      caja.innerHTML = '';
      mostrarFicha(hallados[0]);
      return;
    }

    caja.innerHTML = hallados
      .map(
        (r) => `
      <button type="button" class="resultado resultado--${r.estado}" data-numero="${r.numero}">
        <span class="resultado__numero">${codigo(r.numero)}</span>
        <span>
          <span class="resultado__nombre">${escapar(r.nombre)}</span>
          <span class="resultado__detalle">${escapar(ubicacionDe(r))} · ${escapar(r.descripcion || (r.bultos + ' bulto(s)'))}${
            { tomado: ' · lo tiene su dueño', entregado: ' · ya entregado', custodia: '' }[r.estado]
          }</span>
        </span>
      </button>`
      )
      .join('');
  }

  function mostrarFicha(registro) {
    elegido = registro.numero;
    const foto = registro.foto
      ? `<img class="ficha__foto ampliable" src="${registro.foto}" alt="Foto del equipaje del ticket ${codigo(
          registro.numero
        )}" title="Ver la foto en grande">`
      : '';

    // Quién lo hospeda va destacado: es la única forma de saber, en el momento,
    // si la persona que está pidiendo el bulto tiene por qué llevárselo.
    const hospedaje = registro.hospedador
      ? `<p class="ficha__hospeda">Lo hospeda <b>${escapar(registro.hospedador)}</b>, que también puede retirarlo.</p>`
      : '';

    // Cuando el bulto está tomado, lo grande no puede ser la ubicación: el
    // bulto no está ahí y alguien lo iría a buscar en vano.
    const titular =
      registro.estado === 'tomado'
        ? `<p class="ficha__ubicacion ficha__ubicacion--fuera">Lo tiene su dueño</p>
           <p class="ficha__dato">Su lugar reservado es <b>${escapar(ubicacionDe(registro))}</b>.</p>`
        : `<p class="ficha__ubicacion">${escapar(ubicacionDe(registro))}</p>`;

    const situacion = {
      tomado: `<p class="ficha__fuera">Lo tiene desde las ${hora(registro.tomado)}. El lugar quedó reservado.</p>`,
      entregado: `<p class="ficha__entregado">Lo retiró ${
        registro.retirado === 'hospedador'
          ? escapar(registro.hospedador) + ', que lo hospeda,'
          : escapar(nombreCorto(registro.nombre))
      } a las ${hora(registro.entrega)}.</p>`,
      custodia: '',
    }[registro.estado];

    // Con hospedador asignado, entregar deja de ser un solo botón: hay dos
    // personas que pueden llevárselo y conviene que quede anotado cuál fue.
    const entregar = registro.hospedador
      ? `<button type="button" class="boton boton--principal boton--ancho" id="e-entregar">Lo retira ${escapar(
          nombreCorto(registro.nombre)
        )}</button>
         <button type="button" class="boton boton--otro boton--ancho" id="e-entregar-hospedador">Lo retira ${escapar(
           nombreCorto(registro.hospedador)
         )}, que lo hospeda</button>`
      : '<button type="button" class="boton boton--principal boton--ancho" id="e-entregar">Se lo lleva: entregar y cerrar</button>';

    const acciones = {
      custodia: `
        ${entregar}
        <button type="button" class="boton boton--suave boton--ancho" id="e-tomar">Lo toma un rato y lo devuelve</button>`,
      tomado: `
        <button type="button" class="boton boton--principal boton--ancho" id="e-devolver">Lo devolvió: vuelve a ${escapar(ubicacionDe(registro))}</button>
        ${entregar}`,
      entregado: `
        <button type="button" class="boton boton--suave boton--ancho" id="e-deshacer">Deshacer: dejarlo otra vez en custodia</button>`,
    }[registro.estado];

    const salidas =
      registro.salidas > 0
        ? `<p class="ficha__dato"><span class="ficha__etiqueta">Lo ha sacado ${registro.salidas} ${
            registro.salidas === 1 ? 'vez' : 'veces'
          }</span></p>`
        : '';

    $('#e-ficha').innerHTML = `
      <div class="tarjeta">
        <div class="ficha">
          <div>
            <p class="ficha__etiqueta">Ticket ${codigo(registro.numero)} · ${escapar(registro.nombre)}</p>
            ${titular}
            <p class="ficha__dato">${registro.bultos} bulto(s)${
              registro.descripcion ? ' · ' + escapar(registro.descripcion) : ''
            }</p>
            <p class="ficha__dato"><span class="ficha__etiqueta">Recibido a las ${hora(registro.ingreso)}</span></p>
            ${salidas}
            ${hospedaje}
            ${situacion}
            <div class="acciones">${acciones}</div>
            <button type="button" class="boton boton--texto" id="e-editar">Corregir los datos de este ticket</button>
          </div>
          ${foto}
        </div>
      </div>`;

    const primero = $('.acciones .boton');
    if (primero) primero.focus();
  }

  async function cambiarEstado(numero, nuevo, quien = 'dueno') {
    const registro = buscarRegistro(numero);
    if (!registro) return;

    const antes = {
      estado: registro.estado,
      tomado: registro.tomado,
      entrega: registro.entrega,
      salidas: registro.salidas,
      retirado: registro.retirado,
    };
    const ahora = new Date().toISOString();

    if (nuevo === 'tomado') {
      Object.assign(registro, { estado: 'tomado', tomado: ahora, entrega: null, retirado: null, salidas: registro.salidas + 1 });
    } else if (nuevo === 'custodia') {
      Object.assign(registro, { estado: 'custodia', tomado: null, entrega: null, retirado: null });
    } else {
      Object.assign(registro, { estado: 'entregado', tomado: null, entrega: ahora, retirado: quien });
    }

    estado.cambios++;
    try {
      await guardar();
    } catch (_) {
      Object.assign(registro, antes);
      estado.cambios--;
      return;
    }

    actualizarResumen();
    mostrarFicha(registro);

    const lugar = ubicacionDe(registro);
    avisar(
      {
        tomado: `Ticket ${codigo(numero)} tomado. Su lugar en ${lugar} queda reservado.`,
        custodia: `Ticket ${codigo(numero)} de vuelta en ${lugar}.`,
        entregado: `Ticket ${codigo(numero)} entregado a ${
          quien === 'hospedador' ? registro.hospedador : nombreCorto(registro.nombre)
        }.`,
      }[nuevo]
    );

    // Después de atender a alguien se limpia la búsqueda para el siguiente.
    // Deshacer una entrega es una corrección, no un turno: ahí conviene que la
    // ficha se quede en pantalla.
    if (nuevo !== 'custodia' || antes.estado === 'tomado') {
      setTimeout(() => {
        $('#e-busca').value = '';
        $('#e-busca').focus();
        buscarEntrega();
      }, 1400);
    }
  }

  /* ── Cámara para escanear ── */

  const escaner = { flujo: null, detector: null, corriendo: false };

  async function abrirCamara() {
    try {
      escaner.flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
    } catch (_) {
      return avisar('No se pudo abrir la cámara. Escribe el número del ticket, es igual de rápido.', false);
    }
    const video = $('#e-video');
    video.srcObject = escaner.flujo;
    await video.play();
    $('#e-camara').hidden = false;
    escaner.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    escaner.corriendo = true;
    revisarCuadro();
  }

  async function revisarCuadro() {
    if (!escaner.corriendo) return;
    try {
      const marcas = await escaner.detector.detect($('#e-video'));
      const texto = marcas.length ? String(marcas[0].rawValue) : '';
      const numero = (texto.match(/\d+/) || [])[0];
      if (numero) {
        cerrarCamara();
        $('#e-busca').value = numero;
        buscarEntrega();
        return;
      }
    } catch (_) {
      /* un cuadro fallido no importa: se prueba con el siguiente */
    }
    requestAnimationFrame(revisarCuadro);
  }

  function cerrarCamara() {
    escaner.corriendo = false;
    if (escaner.flujo) escaner.flujo.getTracks().forEach((t) => t.stop());
    escaner.flujo = null;
    $('#e-camara').hidden = true;
  }

  /* ══════════════════════════ Listado ══════════════════════════ */

  let filtro = 'custodia';

  function registrosFiltrados() {
    const consulta = normalizar($('#l-busca').value);
    return estado.registros
      .filter((r) => filtro === 'todos' || r.estado === filtro)
      .filter((r) => !consulta || coincide(r, consulta))
      .sort((a, b) => a.numero - b.numero);
  }

  function pintarListado() {
    notaLista();
    const filas = registrosFiltrados();
    if (!filas.length) {
      $('#l-tabla').innerHTML = '<p class="vacio">Nada por aquí todavía.</p>';
      return;
    }
    $('#l-tabla').innerHTML = `
      <table>
        <thead><tr>
          <th>Ticket</th><th>Nombre</th><th>Equipaje</th><th>Lugar</th><th>Entró</th><th>Estado</th><th>Foto</th>
        </tr></thead>
        <tbody>${filas
          .map(
            (r) => `<tr>
            <td class="num">${codigo(r.numero)}<br><button type="button" class="boton boton--texto" data-editar="${r.numero}">Editar</button></td>
            <td>${escapar(r.nombre)}${
              r.telefono ? `<br><span class="resultado__detalle">${escapar(r.telefono)}</span>` : ''
            }${
              r.hospedador
                ? `<br><span class="resultado__detalle">Lo hospeda ${escapar(r.hospedador)}</span>`
                : ''
            }</td>
            <td>${r.bultos} bulto(s)${r.descripcion ? '<br>' + escapar(r.descripcion) : ''}</td>
            <td>${escapar(ubicacionDe(r))}</td>
            <td>${hora(r.ingreso)}</td>
            <td class="estado--${r.estado}">${
              {
                custodia: 'En custodia',
                tomado: 'Tomado ' + hora(r.tomado),
                entregado: 'Entregado ' + hora(r.entrega),
              }[r.estado]
            }${
              r.estado === 'entregado' && r.retirado === 'hospedador'
                ? `<br><span class="resultado__detalle">a ${escapar(r.hospedador)}</span>`
                : ''
            }${
              r.salidas > 0
                ? `<br><span class="resultado__detalle">${r.salidas} salida${r.salidas === 1 ? '' : 's'}</span>`
                : ''
            }</td>
            <td>${
              r.foto
                ? `<img class="miniatura ampliable" src="${r.foto}" alt="Equipaje del ticket ${codigo(
                    r.numero
                  )}" title="Ver la foto en grande">`
                : ''
            }<button type="button" class="boton boton--texto" data-foto="${r.numero}">${
              r.foto ? 'Cambiar' : 'Agregar'
            }</button></td>
          </tr>`
          )
          .join('')}</tbody>
      </table>`;
  }

  // La foto puede llegar mucho después del registro: alguien la sacó con su
  // teléfono y la mandó por WhatsApp. Por eso se puede pegar a un ticket que ya
  // existe, sin tener que rehacerlo.
  let fotoPara = null;

  async function guardarFotoDe(numero, archivo) {
    const registro = buscarRegistro(numero);
    if (!registro) return;
    const antes = registro.foto;
    try {
      registro.foto = await comprimirFoto(archivo);
    } catch (error) {
      return avisar(error.message, false);
    }
    estado.cambios++;
    try {
      await guardar();
    } catch (_) {
      registro.foto = antes;
      estado.cambios--;
      return;
    }
    pintarListado();
    actualizarResumen();
    avisar(`Foto guardada en el ticket ${codigo(numero)}.`);
  }

  const NOMBRE_FILTRO = {
    custodia: 'solo los que están en custodia',
    tomado: 'solo los tomados',
    entregado: 'solo los entregados',
    todos: 'todos los tickets',
  };

  /* La lista en papel. Sirve para dos cosas: repasar al cierre qué falta por
     retirar, y seguir atendiendo a mano si el computador se apaga. Por eso la
     última columna va en blanco cuando el bulto sigue ahí: es para firmar o
     anotar quién se lo llevó. Las fotos no se imprimen, gastarían media hoja
     cada una. */
  function listaHTML() {
    const filas = registrosFiltrados();
    const hoja = hojaElegida();
    const tomados = cuantos('tomado');

    const celdas = filas
      .map((r) => {
        const situacion = {
          custodia: 'En custodia',
          tomado: 'Tomado ' + hora(r.tomado),
          entregado: 'Entregado ' + hora(r.entrega),
        }[r.estado];
        const retiro =
          r.estado === 'entregado'
            ? escapar(r.retirado === 'hospedador' ? r.hospedador : r.nombre)
            : '';
        return `<tr>
          <td class="num">${codigo(r.numero)}</td>
          <td>${escapar(r.nombre)}${
            r.telefono ? `<br>${escapar(r.telefono)}` : ''
          }</td>
          <td>${escapar(r.hospedador)}</td>
          <td>${r.bultos}</td>
          <td>${escapar(r.descripcion)}</td>
          <td>${escapar(ubicacionDe(r))}</td>
          <td>${situacion}</td>
          <td class="planilla__firma">${retiro}</td>
        </tr>`;
      })
      .join('');

    return `
      <h1 class="planilla__titulo">${escapar(estado.ajustes.evento)} · custodia de equipaje</h1>
      <p class="planilla__datos">
        ${filas.length} ticket(s) en la lista (${NOMBRE_FILTRO[filtro]}) ·
        ${cuantos('custodia')} en custodia · ${tomados} tomado${tomados === 1 ? '' : 's'} ·
        ${cuantos('entregado')} entregados · ${estado.registros.length} en total ·
        impresa el ${fechaHora(new Date().toISOString())} · hoja ${hoja.nombre}
      </p>
      <table class="planilla__tabla">
        <thead><tr>
          <th>N°</th><th>Nombre</th><th>Lo hospeda</th><th>Bultos</th>
          <th>Equipaje</th><th>Lugar</th><th>Estado</th><th>Retiró / firma</th>
        </tr></thead>
        <tbody>${celdas}</tbody>
      </table>`;
  }

  function imprimirLista() {
    if (!registrosFiltrados().length) return avisar('No hay nada que imprimir con ese filtro.', false);
    imprimir(listaHTML());
  }

  function notaLista() {
    const hoja = hojaElegida();
    $('#l-nota').textContent =
      `Se imprime lo que estás viendo (${NOMBRE_FILTRO[filtro]}), sin las fotos, en hoja ` +
      `${hoja.nombre} — el tamaño se cambia en la pestaña Tickets. La última columna va en ` +
      'blanco para firmar o anotar a mano quién retiró.';
  }

  async function exportarCSV() {
    const cabecera = [
      'Ticket', 'Nombre', 'Telefono', 'Hospedador', 'Bultos', 'Descripcion', 'Zona', 'Posicion',
      'Ingreso', 'Estado', 'Salidas', 'Tomado desde', 'Entrega', 'Retirado por',
    ];
    const NOMBRE_ESTADO = { custodia: 'En custodia', tomado: 'Tomado', entregado: 'Entregado' };
    const celda = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const filas = estado.registros
      .slice()
      .sort((a, b) => a.numero - b.numero)
      .map((r) =>
        [
          codigo(r.numero), r.nombre, r.telefono, r.hospedador, r.bultos, r.descripcion, r.zona, r.posicion,
          fechaHora(r.ingreso), NOMBRE_ESTADO[r.estado], r.salidas, fechaHora(r.tomado), fechaHora(r.entrega),
          r.estado === 'entregado' ? (r.retirado === 'hospedador' ? r.hospedador : r.nombre) : '',
        ]
          .map(celda)
          .join(';')
      );
    // El punto y coma y el BOM son para que Excel en español lo abra bien.
    descargar('custodia.csv', '﻿' + [cabecera.map(celda).join(';'), ...filas].join('\r\n'), 'text/csv');
  }

  /* ══════════════════════════ Lámina de tickets ══════════════════════════ */

  // Alto útil = alto de la hoja menos los dos márgenes de 10 mm. Cada ticket
  // mide 30 mm y van de a dos por fila; lo que no alcanza pasa a la hoja
  // siguiente, porque ningún ticket se parte por la mitad.
  const HOJAS = {
    carta: { css: 'letter', nombre: 'carta', alto: 279.4 },
    oficio: { css: 'legal', nombre: 'oficio', alto: 355.6 },
    a4: { css: 'A4', nombre: 'A4', alto: 297 },
  };

  const MARGEN = 10;
  const ALTO_TICKET = 30;

  const porHoja = (hoja) => Math.floor((hoja.alto - MARGEN * 2) / ALTO_TICKET) * 2;

  function hojaElegida() {
    return HOJAS[$('#t-hoja').value] || HOJAS.carta;
  }

  // El tamaño se aplica con una regla @page, así el navegador ya llega con la
  // hoja correcta puesta en el cuadro de impresión.
  function aplicarTamanoHoja() {
    const hoja = hojaElegida();
    let estilo = document.getElementById('tamano-hoja');
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.id = 'tamano-hoja';
      document.head.appendChild(estilo);
    }
    estilo.textContent = `@page { size: ${hoja.css}; margin: ${MARGEN}mm; }`;
    contarHojas();
  }

  function contarHojas() {
    const hoja = hojaElegida();
    const cuantos = porHoja(hoja);
    const desde = Math.max(1, Number($('#t-desde').value) || 1);
    const hasta = Math.min(999, Number($('#t-hasta').value) || desde);
    const total = Math.max(0, hasta - desde + 1);
    const paginas = Math.ceil(total / cuantos);
    $('#t-cuenta').textContent =
      `En hoja ${hoja.nombre} entran ${cuantos} tickets por página` +
      (total ? `: ${total} tickets ocupan ${paginas} hoja${paginas === 1 ? '' : 's'}.` : '.');
  }

  let lamina = '';

  function laminaHTML(desde, hasta) {
    let html = '<div class="hoja">';
    for (let n = desde; n <= hasta; n++) html += ticketHTML(n);
    return html + '</div>';
  }

  function prepararLamina() {
    const desde = Math.max(1, Number($('#t-desde').value) || 1);
    const hasta = Math.min(999, Number($('#t-hasta').value) || desde);
    if (hasta < desde) return avisar('El «hasta» tiene que ser mayor que el «desde».', false);
    if (hasta - desde > 300) return avisar('Son demasiados tickets de una vez. Hazlo por tandas de 300.', false);

    aplicarTamanoHoja();
    lamina = laminaHTML(desde, hasta);
    $('#t-muestra').innerHTML = lamina;
    $('#t-vista').hidden = false;
    $('#t-imprimir').hidden = false;
    const hoja = hojaElegida();
    $('#t-nota').textContent =
      `Así se van a ver: ${porHoja(hoja)} por hoja ${hoja.nombre}. ` +
      'Para dejarlos en PDF, en el cuadro de impresión elige «Guardar como PDF».';
    avisar(`${hasta - desde + 1} tickets listos, del ${codigo(desde)} al ${codigo(hasta)}.`);
  }

  /* ══════════════════════════ Ajustes y respaldo ══════════════════════════ */

  function pintarAjustes() {
    $('#a-evento').value = estado.ajustes.evento;
    aplicarColor();
    $('#a-zonas').value = estado.ajustes.zonas.join(', ');
    $('#a-posiciones').value = estado.ajustes.posiciones;

    const donde = {
      indexeddb: 'Guardado en la base del navegador. Hay espacio de sobra.',
      localstorage:
        'Guardado en el almacenamiento del navegador, que tiene unos 5 MB. Las fotos se achican para que quepan.',
      memoria:
        'ATENCIÓN: este navegador no deja guardar nada. Si recargas la página se pierde todo. Ábrela en otro navegador.',
    }[Almacen.modo];

    const pesa = JSON.stringify(estado.registros).length;
    const conFoto = estado.registros.filter((r) => r.foto).length;
    $('#a-espacio').textContent =
      `${donde} Hoy hay ${estado.registros.length} registro(s), ${conFoto} con foto, ` +
      `ocupando alrededor de ${(pesa / 1048576).toFixed(1)} MB.`;
  }

  async function guardarAjustes(evento) {
    evento.preventDefault();
    const zonas = $('#a-zonas').value
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean);
    if (!zonas.length) return avisar('Tiene que haber al menos una zona.', false);

    estado.ajustes = {
      evento: $('#a-evento').value.trim() || AJUSTES_INICIALES.evento,
      zonas,
      posiciones: Math.min(99, Math.max(1, Number($('#a-posiciones').value) || 20)),
    };
    estado.cambios++;
    await guardar();
    aplicarAjustes();
    avisar('Ajustes guardados.');
  }

  function aplicarAjustes() {
    aplicarColor();
    document.title = estado.ajustes.evento;
    $('#titulo-evento').textContent = estado.ajustes.evento;
    if (!estado.ajustes.zonas.includes(recibir.zona)) {
      recibir.zona = estado.ajustes.zonas[0] || null;
      recibir.posicion = recibir.zona ? primeraLibre(recibir.zona) : null;
    }
    pintarZonas();
    actualizarResumen();
  }

  function actualizarResumen() {
    const total = estado.registros.length;
    const tomados = cuantos('tomado');
    const partes = [`${cuantos('custodia')} en custodia`];
    if (tomados) partes.push(`${tomados} tomado${tomados === 1 ? '' : 's'}`);
    partes.push(`${cuantos('entregado')} entregados`, `${total} en total`);

    $('#resumen').textContent = total ? partes.join(' · ') : 'Todavía no hay equipaje registrado.';

    const pendientes = Math.max(0, estado.cambios - estado.respaldadoEn);
    const insignia = $('#pendientes');
    insignia.textContent = pendientes;
    insignia.hidden = pendientes === 0;
  }

  async function exportarRespaldo() {
    const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const guardado = await descargar(
      `custodia-respaldo-${sello}.json`,
      JSON.stringify({ version: 1, ajustes: estado.ajustes, registros: estado.registros }, null, 1),
      'application/json'
    );
    if (!guardado) return false;

    estado.respaldadoEn = estado.cambios;
    await guardar().catch(() => {});
    actualizarResumen();
    return true;
  }

  async function importarRespaldo(archivo) {
    let datos;
    try {
      datos = JSON.parse(await archivo.text());
    } catch (_) {
      return avisar('Ese archivo no se puede leer. ¿Es el respaldo correcto?', false);
    }
    if (!datos || !Array.isArray(datos.registros)) {
      return avisar('Ese archivo no tiene registros de custodia.', false);
    }
    if (estado.registros.length && !confirm(
      `Vas a reemplazar los ${estado.registros.length} registro(s) de ahora por los ${datos.registros.length} del respaldo. ¿Seguir?`
    )) return;

    estado.ajustes = { ...AJUSTES_INICIALES, ...(datos.ajustes || {}) };
    estado.registros = datos.registros.map(completar);
    estado.cambios++;
    await guardar();
    aplicarAjustes();
    prepararRecibir();
    pintarListado();
    pintarAjustes();
    avisar(`Respaldo cargado: ${datos.registros.length} registro(s).`);
  }

  async function nuevaJornada() {
    const cuantos = estado.registros.length;
    if (!cuantos) return avisar('La custodia ya está vacía: puedes empezar sin más.', false);
    if (
      !confirm(
        `Se va a descargar un respaldo con los ${cuantos} registro(s) y después se van a ` +
          'borrar de la aplicación. El nombre del evento, las zonas y las posiciones se ' +
          'conservan. ¿Seguir?'
      )
    ) return;

    // Primero el respaldo, y solo se borra si de verdad quedó guardado.
    if (!(await exportarRespaldo())) {
      return avisar('No se borró nada: el respaldo no alcanzó a guardarse.', false);
    }

    estado.registros = [];
    estado.cambios++;
    await guardar();
    estado.respaldadoEn = estado.cambios;
    await guardar();

    prepararRecibir();
    pintarListado();
    pintarAjustes();
    actualizarResumen();
    avisar(`Jornada cerrada: se respaldaron ${cuantos} registro(s) y la custodia quedó vacía.`);
  }

  async function borrarTodo() {
    if ($('#a-confirmar').value.trim().toUpperCase() !== 'BORRAR') {
      return avisar('Para borrar todo, escribe BORRAR en el recuadro.', false);
    }
    estado.registros = [];
    estado.ajustes = { ...AJUSTES_INICIALES };
    estado.cambios = 0;
    estado.respaldadoEn = 0;
    await Almacen.borrar();
    $('#a-confirmar').value = '';
    aplicarAjustes();
    prepararRecibir();
    pintarListado();
    pintarAjustes();
    avisar('Todo borrado.');
  }

  /* ══════════════════════════ Visor de fotos ══════════════════════════ */

  // Las fotos se guardan achicadas —900 px de lado, o 560 si el navegador
  // obliga a usar localStorage—, así que «en grande» llega hasta ahí. Alcanza
  // de sobra para reconocer un bulto, que es para lo único que están.
  let volverEl = null;

  function abrirVisor(img) {
    volverEl = document.activeElement;
    $('#visor-foto').src = img.src;
    $('#visor-foto').alt = img.alt;
    $('#visor').hidden = false;
    $('#visor-cerrar').focus();
  }

  function cerrarVisor() {
    $('#visor').hidden = true;
    $('#visor-foto').removeAttribute('src');
    if (volverEl && volverEl.isConnected) volverEl.focus();
    volverEl = null;
  }

  /* ══════════════════════════ Conexiones ══════════════════════════ */

  function conectar() {
    $$('.pestana').forEach((b) => b.addEventListener('click', () => mostrarPanel(b.dataset.panel)));

    // Recibir
    $('#forma-recibir').addEventListener('submit', guardarRecibido);
    $('#recibir-otro').addEventListener('click', prepararRecibir);
    $('#imprimir-comprobante').addEventListener('click', () => {
      if (recibir.ultimo != null) imprimir(ticketHTML(recibir.ultimo, 'ticket--solo'));
    });

    $('#r-atajos').innerHTML = ATAJOS.map(
      (a) => `<button type="button" class="atajo">${a}</button>`
    ).join('');
    $('#r-atajos').addEventListener('click', (e) => {
      if (!e.target.classList.contains('atajo')) return;
      const campo = $('#r-descripcion');
      campo.value = (campo.value ? campo.value.trim() + ' ' : '') + e.target.textContent.toLowerCase();
      campo.focus();
    });

    $('#r-zonas').addEventListener('click', (e) => {
      const boton = e.target.closest('.zona');
      if (!boton) return;
      recibir.zona = boton.dataset.zona;
      recibir.posicion = primeraLibre(recibir.zona);
      pintarZonas();
    });

    $('#r-posiciones').addEventListener('click', (e) => {
      const boton = e.target.closest('.posicion');
      if (!boton || boton.disabled) return;
      recibir.posicion = Number(boton.dataset.posicion);
      pintarPosiciones();
    });

    // Dos caminos para la misma foto: la cámara del aparato, o un archivo que ya
    // está en el computador —por ejemplo el que llegó por WhatsApp—.
    $('#r-foto-camara-boton').addEventListener('click', () => $('#r-foto-camara').click());
    $('#r-foto-archivo-boton').addEventListener('click', () => $('#r-foto-archivo').click());

    const tomarFoto = async (e) => {
      const archivo = e.target.files && e.target.files[0];
      if (!archivo) return;
      try {
        mostrarFoto(await comprimirFoto(archivo));
      } catch (error) {
        avisar(error.message, false);
      }
    };
    $('#r-foto-camara').addEventListener('change', tomarFoto);
    $('#r-foto-archivo').addEventListener('change', tomarFoto);
    $('#r-foto-quitar').addEventListener('click', () => mostrarFoto(null));
    $('#r-cancelar').addEventListener('click', cancelarEdicion);

    // Entregar
    $('#e-busca').addEventListener('input', buscarEntrega);
    $('#e-resultados').addEventListener('click', (e) => {
      const boton = e.target.closest('.resultado');
      if (boton) mostrarFicha(buscarRegistro(Number(boton.dataset.numero)));
    });
    $('#e-ficha').addEventListener('click', (e) => {
      const paso = {
        'e-entregar': ['entregado', 'dueno'],
        'e-entregar-hospedador': ['entregado', 'hospedador'],
        'e-tomar': ['tomado'],
        'e-devolver': ['custodia'],
        'e-deshacer': ['custodia'],
      }[e.target.id];
      if (paso) return cambiarEstado(elegido, ...paso);
      if (e.target.id === 'e-editar') editarRegistro(elegido, 'entregar');
    });

    if ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      $('#e-escanear').hidden = false;
      $('#e-escanear').addEventListener('click', abrirCamara);
      $('#e-cerrar-camara').addEventListener('click', cerrarCamara);
    }

    // Listado
    $('#l-filtros').addEventListener('click', (e) => {
      const boton = e.target.closest('.filtro');
      if (!boton) return;
      filtro = boton.dataset.filtro;
      $$('.filtro').forEach((b) => b.classList.toggle('filtro--activo', b === boton));
      pintarListado();
    });
    $('#l-busca').addEventListener('input', pintarListado);
    $('#l-csv').addEventListener('click', exportarCSV);
    $('#l-imprimir').addEventListener('click', imprimirLista);
    $('#l-tabla').addEventListener('click', (e) => {
      const corregir = e.target.closest('[data-editar]');
      if (corregir) return editarRegistro(Number(corregir.dataset.editar), 'listado');

      const boton = e.target.closest('[data-foto]');
      if (!boton) return;
      fotoPara = Number(boton.dataset.foto);
      $('#l-foto').click();
    });
    $('#l-foto').addEventListener('change', (e) => {
      const archivo = e.target.files && e.target.files[0];
      if (archivo && fotoPara != null) guardarFotoDe(fotoPara, archivo);
      e.target.value = '';
    });

    // Tickets
    $('#t-generar').addEventListener('click', prepararLamina);
    $('#t-imprimir').addEventListener('click', () => imprimir(lamina));
    $('#t-hoja').addEventListener('change', aplicarTamanoHoja);
    $('#t-desde').addEventListener('input', contarHojas);
    $('#t-hasta').addEventListener('input', contarHojas);

    // Ajustes
    $('#forma-ajustes').addEventListener('submit', guardarAjustes);
    $('#respaldar').addEventListener('click', exportarRespaldo);
    $('#a-exportar').addEventListener('click', exportarRespaldo);
    $('#a-importar-boton').addEventListener('click', () => $('#a-importar').click());
    $('#a-importar').addEventListener('change', (e) => {
      const archivo = e.target.files && e.target.files[0];
      if (archivo) importarRespaldo(archivo);
      e.target.value = '';
    });
    // Cualquier foto de la aplicación se abre en grande con un clic.
    document.addEventListener('click', (e) => {
      const img = e.target.closest('.ampliable');
      if (img) abrirVisor(img);
    });
    $('#visor').addEventListener('click', (e) => {
      if (e.target.id !== 'visor-foto') cerrarVisor();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#visor').hidden) cerrarVisor();
    });

    $('#a-tintes').innerHTML = COLORES.map(
      (c) =>
        `<button type="button" class="tinte" role="radio" aria-checked="false" ` +
        `data-color="${c.hex}" style="background:${c.hex}" title="${c.nombre}">` +
        `<span class="visualmente-oculto">${c.nombre}</span></button>`
    ).join('');
    $('#a-tintes').addEventListener('click', (e) => {
      const boton = e.target.closest('.tinte');
      if (boton) elegirColor(boton.dataset.color);
    });
    $('#a-color').addEventListener('input', (e) => elegirColor(e.target.value));

    $('#a-jornada').addEventListener('click', nuevaJornada);
    $('#a-borrar').addEventListener('click', borrarTodo);
  }

  /* ══════════════════════════ Arranque ══════════════════════════ */

  async function iniciar() {
    await Almacen.iniciar();

    let guardado = null;
    try {
      guardado = await Almacen.leer();
    } catch (_) {
      avisar('No se pudieron leer los datos guardados.', false);
    }

    if (guardado) {
      estado.ajustes = { ...AJUSTES_INICIALES, ...(guardado.ajustes || {}) };
      estado.registros = (Array.isArray(guardado.registros) ? guardado.registros : []).map(completar);
      estado.cambios = guardado.cambios || 0;
      estado.respaldadoEn = guardado.respaldadoEn || 0;
    }

    conectar();
    aplicarTamanoHoja();
    aplicarAjustes();
    prepararRecibir();
    mostrarPanel('recibir');

    if (Almacen.modo === 'memoria') {
      avisar(
        'Este navegador no deja guardar datos con el archivo abierto así. Si recargas se pierde todo: ' +
          'ábrelo en Firefox, o publícalo en una dirección web.',
        false
      );
    }
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
