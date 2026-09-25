// Envia alertas al grupo/chat de administradores via el Bot API de Telegram.
// Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en las variables de entorno.

async function enviarAlertaTelegram(texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram no configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID faltantes). Alerta omitida.');
    return { ok: false, skipped: true };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: 'HTML',
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram respondió con error:', data);
    }
    return data;
  } catch (err) {
    console.error('Error enviando alerta a Telegram:', err);
    return { ok: false, error: String(err) };
  }
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
