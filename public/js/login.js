document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = document.getElementById('usuario').value.trim();
  const password = document.getElementById('password').value;
  const errorMsg = document.getElementById('error-msg');
  errorMsg.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorMsg.textContent = data.error || 'No se pudo iniciar sesión';
      return;
    }
    if (data.usuario.rol === 'admin') {
      window.location.href = '/admin/dashboard.html';
    } else {
      window.location.href = '/seleccionar.html';
    }
  } catch (err) {
    errorMsg.textContent = 'Error de conexión con el servidor';
  }
});
