'use strict';

/* =====================================================================
   Panel de pruebas · Tareas 1.3 (usuarios) y 3.4 (libros)
   ===================================================================== */

const API = {
  usuarios: 'api/usuarios.php',
  libros: 'api/libros.php',
};

const state = {
  libros: [],
  editandoId: null,
  toastTimer: null,
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
  apiStatus: $('#api-status'),
  apiStatusText: $('#api-status-text'),
  librosBody: $('#libros-body'),
  librosCount: $('#libros-count'),
  refresh: $('#btn-refresh'),
  libroForm: $('#libro-form'),
  libroId: $('#libro-id'),
  libroFormTitle: $('#libro-form-title'),
  libroSubmit: $('#libro-submit'),
  libroCancel: $('#libro-cancel'),
  usuarioForm: $('#usuario-form'),
  usuarioResult: $('#usuario-result'),
  toast: $('#toast'),
};

/* ---------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------- */

async function request(url, options = {}) {
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  const response = await fetch(url, config);
  let data;

  try {
    data = await response.json();
  } catch {
    data = { error: 'La respuesta del servidor no es un JSON válido.' };
  }

  if (!response.ok) {
    throw new Error(data.error || `Error HTTP ${response.status}`);
  }

  return data;
}

function setStatus(kind, message) {
  elements.apiStatus.className = `status status--${kind}`;
  elements.apiStatusText.textContent = message;
}

function notify(message, kind = 'success') {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast toast--${kind} is-visible`;

  state.toastTimer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 4200);
}

function makeCell(text, className = '') {
  const cell = document.createElement('td');
  if (className) {
    cell.className = className;
  }
  cell.textContent = String(text ?? '');
  return cell;
}

function makeButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/* ---------------------------------------------------------------------
   Libros
   --------------------------------------------------------------------- */

async function cargarLibros() {
  try {
    const data = await request(API.libros);
    state.libros = Array.isArray(data.libros) ? data.libros : [];
    renderLibros();
    setStatus('ok', `API conectada · ${state.libros.length} libro(s)`);
  } catch (error) {
    state.libros = [];
    renderLibros();
    setStatus('error', 'API no disponible');
    notify(error.message, 'error');
  }
}

function renderLibros() {
  elements.librosBody.replaceChildren();
  elements.librosCount.textContent = String(state.libros.length);

  if (state.libros.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty';
    cell.textContent = 'No hay libros registrados. Crea el primero con el formulario.';
    row.appendChild(cell);
    elements.librosBody.appendChild(row);
    return;
  }

  for (const libro of state.libros) {
    const row = document.createElement('tr');

    row.appendChild(makeCell(libro.codigo, 'code'));
    row.appendChild(makeCell(libro.titulo));
    row.appendChild(makeCell(libro.autor));
    row.appendChild(makeCell(libro.anio ?? '—'));
    row.appendChild(makeCell(String(libro.ejemplares)));

    const disponiblesCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${Number(libro.disponibles) > 0 ? 'badge--ok' : 'badge--out'}`;
    badge.textContent = `${libro.disponibles} / ${libro.ejemplares}`;
    disponiblesCell.appendChild(badge);
    row.appendChild(disponiblesCell);

    const actions = document.createElement('td');
    actions.className = 'table__actions';
    const actionsBox = document.createElement('div');
    actionsBox.className = 'row-actions';
    actionsBox.appendChild(makeButton('Editar', 'btn btn--ghost btn--small', () => editarLibro(libro)));
    actionsBox.appendChild(makeButton('Eliminar', 'btn btn--danger btn--small', () => eliminarLibro(libro)));
    actions.appendChild(actionsBox);
    row.appendChild(actions);

    elements.librosBody.appendChild(row);
  }
}

function resetLibroForm() {
  state.editandoId = null;
  elements.libroForm.reset();
  elements.libroId.value = '';
  elements.libroForm.elements.ejemplares.value = '1';
  elements.libroForm.elements.disponibles.value = '1';
  elements.libroFormTitle.textContent = 'Nuevo libro';
  elements.libroSubmit.textContent = 'Guardar libro';
  elements.libroCancel.hidden = true;
}

function editarLibro(libro) {
  state.editandoId = libro.id;

  elements.libroId.value = String(libro.id);
  elements.libroForm.elements.codigo.value = libro.codigo;
  elements.libroForm.elements.titulo.value = libro.titulo;
  elements.libroForm.elements.autor.value = libro.autor;
  elements.libroForm.elements.editorial.value = libro.editorial ?? '';
  elements.libroForm.elements.anio.value = libro.anio ?? '';
  elements.libroForm.elements.ejemplares.value = String(libro.ejemplares);
  elements.libroForm.elements.disponibles.value = String(libro.disponibles);

  elements.libroFormTitle.textContent = `Editar libro #${libro.id}`;
  elements.libroSubmit.textContent = 'Guardar cambios';
  elements.libroCancel.hidden = false;
  elements.libroForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function eliminarLibro(libro) {
  const confirmado = window.confirm(`¿Eliminar el libro «${libro.titulo}»?`);

  if (!confirmado) {
    return;
  }

  try {
    const data = await request(`${API.libros}?id=${encodeURIComponent(libro.id)}`, {
      method: 'DELETE',
    });

    notify(data.message || 'Libro eliminado correctamente.', 'success');

    if (state.editandoId === libro.id) {
      resetLibroForm();
    }

    await cargarLibros();
  } catch (error) {
    notify(error.message, 'error');
  }
}

/* ---------------------------------------------------------------------
   Usuarios
   --------------------------------------------------------------------- */

async function registrarUsuario(form) {
  const payload = {
    nombre: form.elements.nombre.value.trim(),
    correo: form.elements.correo.value.trim(),
    contrasena: form.elements.contrasena.value,
    rol: form.elements.rol.value,
  };

  elements.usuarioResult.hidden = false;
  elements.usuarioResult.textContent = 'Enviando solicitud…';

  try {
    const data = await request(API.usuarios, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    elements.usuarioResult.textContent = JSON.stringify(data, null, 2);
    notify(data.message || 'Usuario registrado correctamente.', 'success');
    form.reset();
  } catch (error) {
    elements.usuarioResult.textContent = JSON.stringify({ error: error.message }, null, 2);
    notify(error.message, 'error');
  }
}

/* ---------------------------------------------------------------------
   Eventos
   --------------------------------------------------------------------- */

elements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    elements.tabs.forEach((item) => {
      const activo = item === tab;
      item.classList.toggle('is-active', activo);
      item.setAttribute('aria-selected', String(activo));
    });

    elements.panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.id === tab.dataset.panel);
    });
  });
});

elements.refresh.addEventListener('click', cargarLibros);
elements.libroCancel.addEventListener('click', resetLibroForm);

elements.libroForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = {
    codigo: form.elements.codigo.value.trim(),
    titulo: form.elements.titulo.value.trim(),
    autor: form.elements.autor.value.trim(),
    editorial: form.elements.editorial.value.trim() || null,
    anio: form.elements.anio.value ? Number(form.elements.anio.value) : null,
    ejemplares: Number(form.elements.ejemplares.value),
    disponibles: Number(form.elements.disponibles.value),
  };

  const editando = state.editandoId !== null;
  const url = editando
    ? `${API.libros}?id=${encodeURIComponent(state.editandoId)}`
    : API.libros;

  try {
    const data = await request(url, {
      method: editando ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });

    notify(data.message || 'Operación completada correctamente.', 'success');
    resetLibroForm();
    await cargarLibros();
  } catch (error) {
    notify(error.message, 'error');
  }
});

elements.usuarioForm.addEventListener('submit', (event) => {
  event.preventDefault();
  registrarUsuario(event.currentTarget);
});

document.addEventListener('DOMContentLoaded', () => {
  resetLibroForm();
  cargarLibros();
});
