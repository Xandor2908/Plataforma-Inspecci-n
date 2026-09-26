// Postgres (UTF8) rechaza el byte NUL (\u0000) dentro de columnas de texto.
// Este caracter invisible aparece a veces al copiar texto desde PDFs o Word,
// y provocaba un error 500 al guardar. Esta funcion lo elimina de forma
// silenciosa antes de insertar/actualizar cualquier campo de texto libre.
function limpiarTexto(valor) {
  if (typeof valor !== 'string') return valor;
  // eslint-disable-next-line no-control-regex
  return valor.replace(/\u0000/g, '');
}

module.exports = { limpiarTexto };
