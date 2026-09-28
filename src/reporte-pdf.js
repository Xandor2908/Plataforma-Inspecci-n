const PDFDocument = require('pdfkit');

// Paleta (coherente con el resto de la plataforma)
const NAVY = '#101828';
const GREEN = '#16a34a';
const RED = '#dc2626';
const GRAY_BG = '#eef2f5';
const GRAY_LINE = '#e2e8f0';
const GRAY_TEXT = '#64748b';
const INK = '#0f172a';

const MARGIN = 32;
const COL_ITEM_FONT = 8.3;
const PILL_W = 60;
const PILL_H = 13;
const SECTION_HEADER_H = 16;

function fechaHoraTexto(fechaISO) {
  const d = new Date(fechaISO);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function alturaFila(doc, desc, colWidth) {
  const descWidth = colWidth - PILL_W - 14;
  doc.font('Helvetica').fontSize(COL_ITEM_FONT);
  const h = doc.heightOfString(desc || '', { width: descWidth });
  return Math.max(15, h + 6);
}

function agruparPorSeccion(respuestas) {
  const mapa = new Map();
  respuestas.forEach((r) => {
    const cat = r.categoria || '(Sin sección)';
    if (!mapa.has(cat)) mapa.set(cat, []);
    mapa.get(cat).push(r);
  });
  return [...mapa.entries()].map(([nombre, items]) => ({ nombre, items }));
}

function dibujarFila(doc, item, x, y, colWidth) {
  const descWidth = colWidth - PILL_W - 14;
  const h = alturaFila(doc, item.item_descripcion, colWidth);

  doc.fillColor(INK).font('Helvetica').fontSize(COL_ITEM_FONT)
    .text(item.item_descripcion || '', x, y + 2, { width: descWidth });

  const esObservado = item.resultado === 'observado';
  const pillX = x + colWidth - PILL_W;
  const pillY = y + (h - PILL_H) / 2;
  doc.roundedRect(pillX, pillY, PILL_W, PILL_H, 6.5).fill(esObservado ? RED : GREEN);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6.8)
    .text(esObservado ? 'OBSERVADO' : 'CORRECTO', pillX, pillY + 3.6, { width: PILL_W, align: 'center' });

  return h;
}

function dibujarEncabezadoSeccion(doc, nombre, x, y, colWidth) {
  doc.rect(x, y, colWidth, SECTION_HEADER_H).fill(NAVY);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.6)
    .text((nombre || '').toUpperCase(), x + 6, y + 4.5, { width: colWidth - 12 });
}

function alturaSeccion(doc, seccion, colWidth) {
  let h = SECTION_HEADER_H + 4;
  seccion.items.forEach((it) => { h += alturaFila(doc, it.item_descripcion, colWidth); });
  h += 8;
  return h;
}

function repartirColumnas(secciones) {
  const columnas = [{ altura: 0, secciones: [] }, { altura: 0, secciones: [] }];
  secciones.forEach((s) => {
    const destino = columnas[0].altura <= columnas[1].altura ? columnas[0] : columnas[1];
    destino.secciones.push(s);
    destino.altura += s.altura;
  });
  return columnas;
}

function truncar(texto, max) {
  if (!texto) return '';
  return texto.length > max ? texto.slice(0, max - 1).trimEnd() + '…' : texto;
}

async function obtenerImagenBuffer(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const arrayBuffer = await r.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    return null;
  }
}

async function generarReportePDF(stream, { inspeccion, equipos, respuestas }) {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
  doc.pipe(stream);

  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;
  const USABLE_W = PAGE_W - MARGIN * 2;
  const BOTTOM = PAGE_H - MARGIN;

  let y = MARGIN;

  const headerH = 40;
  doc.rect(MARGIN, y, USABLE_W, headerH).fill(NAVY);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(15)
    .text('ESTABLO - REPORTE DE INSPECCIÓN', MARGIN + 14, y + 13, { width: USABLE_W - 160 });
  doc.font('Helvetica').fontSize(9.5)
    .text(`Folio ${inspeccion.folio}`, MARGIN, y + 15, { width: USABLE_W - 14, align: 'right' });
  y += headerH + 10;

  const infoH = 50;
  doc.rect(MARGIN, y, USABLE_W, infoH).fill(GRAY_BG);
  const equiposTexto = equipos.map((e) => e.nomenclatura).join(', ');
  doc.fillColor(INK).fontSize(8.3);
  doc.font('Helvetica-Bold').text('Checklist: ', MARGIN + 12, y + 8, { continued: true })
    .font('Helvetica').text(inspeccion.checklist_nombre);
  doc.font('Helvetica-Bold').text('Equipos: ', MARGIN + 12, y + 21, { continued: true })
    .font('Helvetica').text(equiposTexto);
  doc.font('Helvetica-Bold').text('Responsable: ', MARGIN + 12, y + 34, { continued: true })
    .font('Helvetica').text(inspeccion.operador_nombre);
  doc.font('Helvetica-Bold').text('Fecha/hora: ', MARGIN + 300, y + 34, { continued: true })
    .font('Helvetica').text(fechaHoraTexto(inspeccion.fecha_hora));
  y += infoH + 10;

  const totalRevisados = respuestas.length;
  const totalObservados = respuestas.filter((r) => r.resultado === 'observado').length;
  const totalCorrectos = totalRevisados - totalObservados;
  const atencion = totalObservados > 0;

  const statGap = 8;
  const statW = (USABLE_W - statGap * 3) / 4;
  const statH = 40;
  const stats = [
    { valor: String(totalRevisados), label: 'PUNTOS REVISADOS', color: NAVY },
    { valor: String(totalCorrectos), label: 'CORRECTOS', color: GREEN },
    { valor: String(totalObservados), label: 'OBSERVADOS', color: RED },
    { valor: atencion ? 'ATENCIÓN' : 'CONFORME', label: 'ESTADO GENERAL', color: atencion ? RED : GREEN },
  ];
  stats.forEach((s, i) => {
    const x = MARGIN + i * (statW + statGap);
    doc.roundedRect(x, y, statW, statH, 5).lineWidth(1).strokeColor(GRAY_LINE).stroke();
    doc.fillColor(s.color).font('Helvetica-Bold').fontSize(s.valor.length > 3 ? 11 : 16)
      .text(s.valor, x + 2, y + 9, { width: statW - 4, align: 'center' });
    doc.fillColor(GRAY_TEXT).font('Helvetica-Bold').fontSize(6.2)
      .text(s.label, x + 2, y + 27, { width: statW - 4, align: 'center' });
  });
  y += statH + 14;

  const colGap = 16;
  const colWidth = (USABLE_W - colGap) / 2;
  const secciones = agruparPorSeccion(respuestas);
  secciones.forEach((s) => { s.altura = alturaSeccion(doc, s, colWidth); });
  const columnas = repartirColumnas(secciones);
  const alturaMax2Col = Math.max(columnas[0].altura, columnas[1].altura);

  if (y + alturaMax2Col <= BOTTOM) {
    [0, 1].forEach((ci) => {
      const x = MARGIN + ci * (colWidth + colGap);
      let cy = y;
      columnas[ci].secciones.forEach((s) => {
        dibujarEncabezadoSeccion(doc, s.nombre, x, cy, colWidth);
        cy += SECTION_HEADER_H + 4;
        s.items.forEach((it) => {
          const h = dibujarFila(doc, it, x, cy, colWidth);
          cy += h;
        });
        cy += 8;
      });
    });
    y += alturaMax2Col;
  } else {
    const anchoCompleto = USABLE_W;
    secciones.forEach((s) => {
      if (y + SECTION_HEADER_H + 20 > BOTTOM) { doc.addPage(); y = MARGIN; }
      dibujarEncabezadoSeccion(doc, s.nombre, MARGIN, y, anchoCompleto);
      y += SECTION_HEADER_H + 4;
      s.items.forEach((it) => {
        const h = alturaFila(doc, it.item_descripcion, anchoCompleto);
        if (y + h > BOTTOM) { doc.addPage(); y = MARGIN; }
        dibujarFila(doc, it, MARGIN, y, anchoCompleto);
        y += h;
      });
      y += 8;
    });
  }

  const hallazgos = respuestas.filter((r) => r.resultado === 'observado');
  if (hallazgos.length > 0) {
    if (y + 90 > BOTTOM) { doc.addPage(); y = MARGIN; }
    y += 6;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(GRAY_LINE).lineWidth(1).stroke();
    y += 10;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text('HALLAZGOS Y EVIDENCIA', MARGIN, y);
    y += 18;

    const cardGap = 14;
    const cardW = (USABLE_W - cardGap) / 2;
    const cardH = 150;
    const fotoH = 95;

    for (let i = 0; i < hallazgos.length; i++) {
      const col = i % 2;
      if (col === 0 && y + cardH > BOTTOM) { doc.addPage(); y = MARGIN; }
      const x = MARGIN + col * (cardW + cardGap);
      const cy = y;
      const h = hallazgos[i];

      doc.roundedRect(x, cy, cardW, cardH, 6).lineWidth(1).strokeColor(GRAY_LINE).stroke();

      const tituloTexto = truncar(`${i + 1} · ${h.item_descripcion || 'Observación adicional'}`, 70);
      doc.font('Helvetica-Bold').fontSize(8.5);
      const tituloH = doc.heightOfString(tituloTexto, { width: cardW - 20 });
      doc.fillColor(INK).text(tituloTexto, x + 10, cy + 10, { width: cardW - 20 });

      let textoY = cy + 10 + tituloH + 6;
      doc.fillColor(GRAY_TEXT).font('Helvetica-Bold').fontSize(6.5).text('OBSERVACIÓN', x + 10, textoY);
      textoY += 9;
      doc.fillColor(INK).font('Helvetica').fontSize(7.6)
        .text(truncar(h.observacion_texto, 150) || '(sin descripción)', x + 10, textoY, { width: cardW - 20 });

      if (h.observacion_foto_url) {
        const buffer = await obtenerImagenBuffer(h.observacion_foto_url);
        const fotoY = cy + cardH - fotoH - 10;
        if (buffer) {
          try {
            doc.image(buffer, x + 10, fotoY, { fit: [cardW - 20, fotoH] });
          } catch (err) {
            doc.fontSize(7).fillColor('gray').text('(no se pudo mostrar la fotografía)', x + 10, fotoY);
          }
        } else {
          doc.fontSize(7).fillColor('gray').text('(no se pudo cargar la fotografía)', x + 10, fotoY);
        }
      }

      if (col === 1 || i === hallazgos.length - 1) y = cy + cardH + cardGap;
    }
  }

  doc.end();
}

module.exports = { generarReportePDF };
