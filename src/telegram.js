// Envia alertas al grupo/chat de administradores via el Bot API de Telegram.
// Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en las variables de entorno.
// PLATFORM_URL (opcional) agrega un botón "Ir a la plataforma maestra" en la alerta.

function botonPlataforma() {
  const url = process.env.PLATFORM_URL;
  if (!url) return undefined;
  const base = url.replace(/\/$/, '');
  return {
    inline_keyboard: [[{ text: '🔗 Ir a la plataforma maestra', url: `${base}/admin/incidencias.html` }]],
  };
}

/**
 * Envía una alerta de incidencia. Si hay foto, la envía como imagen con el texto
 * como "caption" (límite 1024 caracteres de Telegram); si no, envía solo texto.
 * @param {{texto: string, fotoUrl?: string|null}} opts
 */
async function enviarAlertaTelegram({ texto, fotoUrl }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram no configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID faltantes). Alerta omitida.');
    return { ok: false, skipped: true };
  }

  const reply_markup = botonPlataforma();

  try {
    if (fotoUrl) {
      const caption = texto.length > 1000 ? texto.slice(0, 997) + '...' : texto;
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: fotoUrl, caption, parse_mode: 'HTML', reply_markup }),
      });
      const data = await res.json();
      if (!data.ok) {
        console.error('Telegram (sendPhoto) respondió con error, reintentando como texto:', data);
        return enviarSoloTexto(token, chatId, texto, reply_markup);
      }
      return data;
    }
    return enviarSoloTexto(token, chatId, texto, reply_markup);
  } catch (err) {
    console.error('Error enviando alerta a Telegram:', err);
    return { ok: false, error: String(err) };
  }
}

async function enviarSoloTexto(token, chatId, texto, reply_markup) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML', reply_markup }),
  });
  const data = await res.json();
  if (!data.ok) console.error('Telegram (sendMessage) respondió con error:', data);
  return data;
}

function textoAlertaIncidencia({ codigo, checklistNombre, equiposTexto, descripcion, folio }) {
  return (
    `🚨 <b>Nueva incidencia registrada</b>\n` +
    `Código: <b>${codigo}</b>\n` +
    `Checklist: ${checklistNombre}\n` +
    `Equipos: ${equiposTexto}\n` +
    `Folio inspección: ${folio}\n` +
    `Descripción: ${descripcion}`
  );
}

module.exports = { enviarAlertaTelegram, textoAlertaIncidencia };
