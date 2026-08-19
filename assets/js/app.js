/* Custodia de equipaje — toda la lógica de la aplicación.
   Sin dependencias ni servidor: se abre y funciona, con o sin internet. */

(() => {
  'use strict';

  const AJUSTES_INICIALES = {
    evento: 'Confraternidad MINCAR',
    zonas: ['A', 'B', 'C'],
    posiciones: 20,
  };

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

  function descargar(nombre, contenido, tipo) {
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  }

  const enCustodia = () => estado.registros.filter((r) => !r.entrega);
  const buscarRegistro = (numero) => estado.registros.find((r) => r.numero === numero);

  function siguienteNumero() {
    let n = 1;
    while (buscarRegistro(n)) n++;
    return n;
  }

  function ocupadas(zona) {
    return new Set(enCustodia().filter((r) => r.zona === zona).map((r) => r.posicion));
  }

  function primeraLibre(zona) {
    const usadas = ocupadas(zona);
    for (let i = 1; i <= estado.ajustes.posiciones; i++) if (!usadas.has(i)) return i;
    return null;
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
    const usadas = ocupadas(recibir.zona);
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

  function prepararRecibir() {
    recibir.foto = null;
    recibir.posicion = null;
    $('#forma-recibir').reset();
    $('#r-numero').value = siguienteNumero();
    $('#r-bultos').value = 1;
    $('#r-foto-vista').hidden = true;
    $('#r-foto-vista').removeAttribute('src');
    $('#r-foto-quitar').hidden = true;
    if (!recibir.zona || !estado.ajustes.zonas.includes(recibir.zona)) {
      recibir.zona = estado.ajustes.zonas[0] || null;
    }
    recibir.posicion = recibir.zona ? primeraLibre(recibir.zona) : null;
    pintarZonas();
    $('#comprobante').hidden = true;
    $('#forma-recibir').hidden = false;
    $('#r-nombre').focus();
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

    if (!nombre) return avisar('Falta el nombre.', false);
    if (!numero || numero < 1) return avisar('El número de ticket no es válido.', false);
    if (buscarRegistro(numero)) {
      return avisar(`El ticket ${codigo(numero)} ya está usado. Prueba con otro número.`, false);
    }
    if (!recibir.zona || !recibir.posicion) return avisar('Falta indicar dónde queda el equipaje.', false);

    estado.registros.push({
      numero,
      nombre,
      telefono: $('#r-telefono').value.trim(),
      bultos: Math.max(1, Number($('#r-bultos').value) || 1),
      descripcion: $('#r-descripcion').value.trim(),
      foto: recibir.foto,
      zona: recibir.zona,
      posicion: recibir.posicion,
      ingreso: new Date().toISOString(),
      entrega: null,
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

    const hallados = estado.registros
      .filter((r) => coincide(r, consulta))
      .sort((a, b) => Number(Boolean(a.entrega)) - Number(Boolean(b.entrega)) || a.numero - b.numero);

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
      <button type="button" class="resultado${r.entrega ? ' resultado--entregado' : ''}" data-numero="${r.numero}">
        <span class="resultado__numero">${codigo(r.numero)}</span>
        <span>
          <span class="resultado__nombre">${escapar(r.nombre)}</span>
          <span class="resultado__detalle">${escapar(ubicacionDe(r))} · ${escapar(r.descripcion || (r.bultos + ' bulto(s)'))}${
            r.entrega ? ' · ya entregado' : ''
          }</span>
        </span>
      </button>`
      )
      .join('');
  }

  function mostrarFicha(registro) {
    elegido = registro.numero;
    const foto = registro.foto
      ? `<img class="ficha__foto" src="${registro.foto}" alt="Foto del equipaje del ticket ${codigo(registro.numero)}">`
      : '';

    $('#e-ficha').innerHTML = `
      <div class="tarjeta">
        <div class="ficha">
          <div>
            <p class="ficha__etiqueta">Ticket ${codigo(registro.numero)} · ${escapar(registro.nombre)}</p>
            <p class="ficha__ubicacion">${escapar(ubicacionDe(registro))}</p>
            <p class="ficha__dato">${registro.bultos} bulto(s)${
              registro.descripcion ? ' · ' + escapar(registro.descripcion) : ''
            }</p>
            <p class="ficha__dato"><span class="ficha__etiqueta">Recibido a las ${hora(registro.ingreso)}</span></p>
            ${
              registro.entrega
                ? `<p class="ficha__entregado">Ya fue entregado a las ${hora(registro.entrega)}.
                     <button type="button" class="boton boton--texto" id="e-deshacer">Deshacer</button></p>`
                : '<button type="button" class="boton boton--principal boton--ancho" id="e-entregar">Marcar como entregado</button>'
            }
          </div>
          ${foto}
        </div>
      </div>`;

    const botonEntregar = $('#e-entregar');
    if (botonEntregar) botonEntregar.focus();
  }

  async function marcarEntrega(numero, entregado) {
    const registro = buscarRegistro(numero);
    if (!registro) return;
    const antes = registro.entrega;
    registro.entrega = entregado ? new Date().toISOString() : null;
    estado.cambios++;
    try {
      await guardar();
    } catch (_) {
      registro.entrega = antes;
      estado.cambios--;
      return;
    }
    actualizarResumen();
    mostrarFicha(registro);
    if (entregado) {
      avisar(`Ticket ${codigo(numero)} entregado.`);
      setTimeout(() => {
        $('#e-busca').value = '';
        $('#e-busca').focus();
        buscarEntrega();
      }, 1200);
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
      .filter((r) => (filtro === 'todos' ? true : filtro === 'custodia' ? !r.entrega : Boolean(r.entrega)))
      .filter((r) => !consulta || coincide(r, consulta))
      .sort((a, b) => a.numero - b.numero);
  }

  function pintarListado() {
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
            <td class="num">${codigo(r.numero)}</td>
            <td>${escapar(r.nombre)}${
              r.telefono ? `<br><span class="resultado__detalle">${escapar(r.telefono)}</span>` : ''
            }</td>
            <td>${r.bultos} bulto(s)${r.descripcion ? '<br>' + escapar(r.descripcion) : ''}</td>
            <td>${escapar(ubicacionDe(r))}</td>
            <td>${hora(r.ingreso)}</td>
            <td class="${r.entrega ? 'estado--entregado' : 'estado--custodia'}">${
              r.entrega ? 'Entregado ' + hora(r.entrega) : 'En custodia'
            }</td>
            <td>${
              r.foto
                ? `<img class="miniatura" src="${r.foto}" alt="Equipaje del ticket ${codigo(r.numero)}">`
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

  function exportarCSV() {
    const cabecera = ['Ticket', 'Nombre', 'Telefono', 'Bultos', 'Descripcion', 'Zona', 'Posicion', 'Ingreso', 'Entrega'];
    const celda = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const filas = estado.registros
      .slice()
      .sort((a, b) => a.numero - b.numero)
      .map((r) =>
        [codigo(r.numero), r.nombre, r.telefono, r.bultos, r.descripcion, r.zona, r.posicion, fechaHora(r.ingreso), fechaHora(r.entrega)]
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
    const dentro = enCustodia().length;
    $('#resumen').textContent = total
      ? `${dentro} en custodia · ${total - dentro} entregados · ${total} en total`
      : 'Todavía no hay equipaje registrado.';

    const pendientes = Math.max(0, estado.cambios - estado.respaldadoEn);
    const insignia = $('#pendientes');
    insignia.textContent = pendientes;
    insignia.hidden = pendientes === 0;
  }

  function exportarRespaldo() {
    const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    descargar(
      `custodia-respaldo-${sello}.json`,
      JSON.stringify({ version: 1, ajustes: estado.ajustes, registros: estado.registros }, null, 1),
      'application/json'
    );
    estado.respaldadoEn = estado.cambios;
    guardar().catch(() => {});
    actualizarResumen();
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
    estado.registros = datos.registros;
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

    exportarRespaldo();
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
        recibir.foto = await comprimirFoto(archivo);
        $('#r-foto-vista').src = recibir.foto;
        $('#r-foto-vista').hidden = false;
        $('#r-foto-quitar').hidden = false;
      } catch (error) {
        avisar(error.message, false);
      }
    };
    $('#r-foto-camara').addEventListener('change', tomarFoto);
    $('#r-foto-archivo').addEventListener('change', tomarFoto);

    $('#r-foto-quitar').addEventListener('click', () => {
      recibir.foto = null;
      $('#r-foto-camara').value = '';
      $('#r-foto-archivo').value = '';
      $('#r-foto-vista').hidden = true;
      $('#r-foto-quitar').hidden = true;
    });

    // Entregar
    $('#e-busca').addEventListener('input', buscarEntrega);
    $('#e-resultados').addEventListener('click', (e) => {
      const boton = e.target.closest('.resultado');
      if (boton) mostrarFicha(buscarRegistro(Number(boton.dataset.numero)));
    });
    $('#e-ficha').addEventListener('click', (e) => {
      if (e.target.id === 'e-entregar') marcarEntrega(elegido, true);
      if (e.target.id === 'e-deshacer') marcarEntrega(elegido, false);
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
    $('#l-tabla').addEventListener('click', (e) => {
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
      estado.registros = Array.isArray(guardado.registros) ? guardado.registros : [];
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
