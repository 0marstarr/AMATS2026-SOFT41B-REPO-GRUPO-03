(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const roleNames = {
    SUPERADMIN: 'Superadministrador',
    BIBLIOTECARIA: 'Bibliotecaria',
    PRESTATARIO: 'Prestatario',
    OPAC: 'Visitante OPAC'
  };
  let user = null;
  let setupMode = false;
  let viewRequest = 0;
  let active = false;

  async function api(endpoint, options = {}) {
    const response = await fetch(endpoint, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || `Error ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  const alertLogin = (message, type = 'danger') => {
    const alert = $('#alertaLogin');
    alert.className = `alert alert-${type} py-2`;
    alert.textContent = message;
  };

  function showSetupMode(required) {
    setupMode = required;
    $('#campoNombreSetup').classList.toggle('oculto', !required);
    $('#nombreSetup').required = required;
    $('#usuario').autocomplete = required ? 'username' : 'username';
    $('#clave').autocomplete = required ? 'new-password' : 'current-password';
    $('#tituloAcceso').textContent = required ? 'Configurar biblioteca' : 'Iniciar sesión';
    $('#loginOptions').classList.toggle('oculto', required);
    $('#ayudaAcceso').textContent = required
      ? 'Cree la primera cuenta SUPERADMIN para habilitar el acceso seguro al sistema.'
      : 'Inicie sesión con una cuenta autorizada para acceder a las funciones de biblioteca.';
    $('#btnLoginSubmit').innerHTML = required
      ? '<i class="bi bi-shield-lock"></i> Crear cuenta SUPERADMIN'
      : '<i class="bi bi-box-arrow-in-right"></i> Ingresar al sistema';
  }

  async function authenticate(event) {
    event.preventDefault();
    const submit = $('#btnLoginSubmit');
    submit.disabled = true;
    try {
      const body = setupMode
        ? { nombre: $('#nombreSetup').value, username: $('#usuario').value, password: $('#clave').value }
        : { username: $('#usuario').value, password: $('#clave').value };
      const result = await api(setupMode ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST', body: JSON.stringify(body)
      });
      if (setupMode) {
        setupMode = false;
        showSetupMode(false);
      }
      startSession(result.user);
      alertLogin('', 'success');
    } catch (error) {
      alertLogin(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  function startSession(account) {
    user = account;
    active = true;
    SESION.activa = true;
    SESION.invitado = !account;
    SESION.usuarioId = account?.id ?? null;
    SESION.rol = account?.role || 'OPAC';
    SESION.nombre = account?.nombre || 'Visitante OPAC';
    SESION.usuario = account?.username || 'visitante';
    SESION.inicio = new Date();
    SESION.ultimaActividad = new Date();
    SESION.motivoCierre = null;

    $('#pantallaLogin').classList.add('oculto');
    $('#appShell').classList.remove('oculto');
    $('#avatarSesion').textContent = (SESION.nombre.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') || 'V').toUpperCase();
    $('#nombreSesion').textContent = SESION.nombre;
    $('#rolSesion').innerHTML = `<i class="bi bi-shield-lock"></i> ${esc(roleNames[SESION.rol] || SESION.rol)}`;
    $('#nombreCortoTopbar').textContent = SESION.usuario;
    $('#encabezadoPerfil').textContent = `${SESION.usuario} · ${roleNames[SESION.rol] || SESION.rol}`;
    $('#accionesRapidas').classList.toggle('oculto', !['SUPERADMIN', 'BIBLIOTECARIA'].includes(SESION.rol));
    $('#menuMiPerfil').parentElement.classList.add('oculto');
    $('#menuCambiarClave').parentElement.classList.add('oculto');
    document.querySelectorAll('#menuLateral [data-roles]').forEach(link => {
      link.classList.toggle('oculto', !link.dataset.roles.split(',').includes(SESION.rol));
    });
    const initialView = account?.role === 'PRESTATARIO' ? 'misPrestamos' : account ? 'dashboard' : 'opac';
    openView(initialView);
  }

  function table(headers, rows, emptyMessage = 'No hay registros para mostrar.') {
    if (!rows.length) return `<div class="alert alert-light border mb-0">${esc(emptyMessage)}</div>`;
    return `<div class="table-responsive"><table class="table table-hover align-middle mb-0">
      <thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>`;
  }

  function card(title, icon, body, extra = '') {
    return `<section class="card mb-3"><div class="card-header d-flex align-items-center gap-2">
      <i class="bi ${icon} text-primary"></i><span>${title}</span>${extra}</div>
      <div class="card-body">${body}</div></section>`;
  }

  function loanRows(loans, actions = false) {
    return loans.map(loan => `<tr>
      <td>${esc(loan.titulo)}<div class="text-muted-2 small">${esc(loan.codigo)}</div></td>
      ${user?.role !== 'PRESTATARIO' ? `<td>${esc(loan.usuario)}<div class="text-muted-2 small">${esc(loan.carnet || '')}</div></td>` : ''}
      <td>${esc(loan.fecha_prestamo)}</td><td>${esc(loan.fecha_limite)}</td>
      <td>${loan.estado === 'Devuelto' ? '<span class="badge text-bg-success">Devuelto</span>' :
        Number(loan.dias_mora) > 0 ? `<span class="badge text-bg-danger">Mora · ${esc(loan.dias_mora)} día(s)</span>` :
          '<span class="badge text-bg-primary">Activo</span>'}</td>
      ${actions ? `<td>${loan.estado === 'Activo' ? `<button class="btn btn-sm btn-outline-success" data-return-loan="${loan.id}"><i class="bi bi-box-arrow-in-down-left"></i> Registrar devolución</button>` : ''}</td>` : ''}
    </tr>`);
  }

  async function openView(view) {
    if (!active || !puede(view)) return;
    vistaActual = view;
    const viewId = ++viewRequest;
    const labels = {
      dashboard: ['Dashboard', 'Indicadores generales de biblioteca'],
      opac: ['Buscador OPAC', 'Consulta pública del catálogo y disponibilidad'],
      catalogo: ['Catálogo Bibliográfico', 'Inventario registrado en la biblioteca'],
      prestamos: ['Préstamos', 'Circulación y registro de préstamos'],
      devoluciones: ['Devoluciones', 'Cierre de préstamos activos'],
      mora: ['Control y Alertas de Mora', 'Préstamos vencidos y días de atraso'],
      misPrestamos: ['Mis préstamos y mora', 'Consulta privada asociada a su cuenta'],
      reportes: ['Reportes Estadísticos', 'Resumen de los datos registrados'],
      auditoria: ['Auditoría del Sistema', 'Estado de disponibilidad del servicio'],
      config: ['Configuración', 'Administración de cuentas del sistema'],
      acerca: ['Acerca de la plataforma', 'Biblioteca ITCA FEPADE · Sede Santa Ana']
    };
    const [title, subtitle] = labels[view] || labels.opac;
    $('#tituloVista').textContent = title;
    $('#subVista').textContent = subtitle;
    $('#sidebar').classList.remove('abierto');
    document.querySelectorAll('#menuLateral .nav-side[data-vista]').forEach(link => {
      link.classList.toggle('active', link.dataset.vista === view);
    });
    const host = $('#vistaContenedor');
    host.innerHTML = '<div class="card"><div class="card-body text-muted-2"><span class="spinner-border spinner-border-sm me-2"></span>Cargando datos…</div></div>';
    try {
      const content = await renderView(view);
      if (viewId === viewRequest) host.innerHTML = content;
    } catch (error) {
      if (viewId === viewRequest) host.innerHTML = `<div class="alert alert-danger" role="alert"><i class="bi bi-exclamation-triangle me-1"></i>${esc(error.message)}</div>`;
    }
  }

  async function renderView(view) {
    if (view === 'opac' || view === 'catalogo') {
      const { data: books } = await api('/api/libros');
      const staff = ['SUPERADMIN', 'BIBLIOTECARIA'].includes(user?.role);
      return `<div class="row g-3 mb-3">
        ${view === 'opac' ? `<div class="col-12"><div class="alert alert-info d-flex flex-wrap justify-content-between align-items-center gap-2 mb-0">
          <span><i class="bi bi-info-circle me-1"></i> Catálogo local de consulta. La disponibilidad del OPAC institucional no está sincronizada.</span>
          <a class="btn btn-sm btn-outline-primary" href="https://biblioteca.itca.edu.sv/biblioteca/opac/" target="_blank" rel="noopener noreferrer">
            <i class="bi bi-box-arrow-up-right me-1"></i>Abrir OPAC oficial ITCA
          </a>
        </div></div>` : ''}
        <div class="col-md-8"><input class="form-control" id="filtroLibros" placeholder="Buscar por título, autor o código" aria-label="Buscar en el catálogo"></div>
        ${staff ? '<div class="col-md-4 text-md-end"><button class="btn btn-primary" data-action="show-book-form"><i class="bi bi-plus-lg"></i> Agregar libro</button></div>' : ''}
      </div>
      ${staff ? '<div id="formLibroHost"></div>' : ''}
      ${card('Catálogo', 'bi-journal-bookmark', table(
        ['Título y código', 'Autor', 'Disponibilidad', ...(staff ? ['Copias'] : [])],
        books.map(book => `<tr data-book-search="${esc(`${book.titulo} ${book.autor} ${book.codigo}`.toLowerCase())}">
          <td><strong>${esc(book.titulo)}</strong><div class="text-muted-2 small">${esc(book.codigo)}${book.categoria ? ` · ${esc(book.categoria)}` : ''}</div></td>
          <td>${esc(book.autor)}</td><td>${Number(book.copias_disponibles) > 0
            ? `<span class="badge text-bg-success">Disponible · ${book.copias_disponibles}</span>`
            : '<span class="badge text-bg-secondary">No disponible</span>'}</td>
          ${staff ? `<td>${esc(book.copias_disponibles)} / ${esc(book.copias_totales)}${book.estado !== 'Activo' ? ` · ${esc(book.estado)}` : ''}</td>` : ''}
        </tr>`),
        view === 'opac'
          ? 'El catálogo local todavía no tiene libros registrados. El OPAC institucional se abre con el enlace superior.'
          : 'No hay libros registrados.'
      ))}`;
    }
    if (view === 'dashboard' || view === 'reportes' || view === 'mora' || view === 'misPrestamos' ||
        view === 'prestamos' || view === 'devoluciones') {
      const { data: loans } = await api('/api/prestamos');
      const staff = ['SUPERADMIN', 'BIBLIOTECARIA'].includes(user?.role);
      if (view === 'misPrestamos') {
        const late = loans.filter(loan => loan.estado === 'Activo' && Number(loan.dias_mora) > 0);
        const lateAmount = late.reduce((sum, loan) => sum + Number(loan.dias_mora), 0);
        return `<div class="row g-3 mb-3">
          <div class="col-md-6"><div class="kpi"><div class="etiqueta">Préstamos activos</div><div class="valor">${loans.filter(loan => loan.estado === 'Activo').length}</div></div></div>
          <div class="col-md-6"><div class="kpi"><div class="etiqueta">Días de mora acumulados</div><div class="valor">${lateAmount}</div></div></div>
        </div>${card('Historial de mis préstamos', 'bi-journal-check', table(
          ['Libro', 'Fecha de préstamo', 'Fecha límite', 'Estado'],
          loanRows(loans)
        ))}`;
      }
      if (view === 'mora') {
        const late = loans.filter(loan => loan.estado === 'Activo' && Number(loan.dias_mora) > 0);
        return card('Préstamos vencidos', 'bi-exclamation-triangle', table(
          ['Libro', 'Prestatario', 'Fecha límite', 'Mora'],
          late.map(loan => `<tr><td>${esc(loan.titulo)}</td><td>${esc(loan.usuario)}</td><td>${esc(loan.fecha_limite)}</td><td><span class="badge text-bg-danger">${esc(loan.dias_mora)} día(s)</span></td></tr>`),
          'No hay préstamos vencidos.'
        ));
      }
      if (view === 'prestamos') {
        const { data: books } = await api('/api/libros');
        const availableBooks = books.filter(book => book.estado === 'Activo' && Number(book.copias_disponibles) > 0);
        const bookOptions = `<option value="">Seleccione un libro…</option>${availableBooks.map(book => `<option value="${book.id}">${esc(book.titulo)} · ${esc(book.copias_disponibles)} disponible(s)</option>`).join('')}`;
        const loanFields = `<div class="col-md-6"><label class="form-label">Libro disponible</label><select class="form-select" name="libro_id" required>${bookOptions}</select></div>
          <div class="col-12" data-access-option><div class="form-check">
            <input class="form-check-input" type="checkbox" name="crear_cuenta" id="createBorrowerAccount" data-action="toggle-access">
            <label class="form-check-label" for="createBorrowerAccount">Crear acceso para que consulte sus préstamos y mora</label>
          </div><div class="text-muted-2 small mt-1">Opcional. Sin cuenta, el préstamo queda registrado pero el prestatario no podrá iniciar sesión.</div></div>
          <div class="col-12 d-none" data-access-fields><div class="row g-3">
            <div class="col-md-6"><label class="form-label">Nombre de usuario</label><input class="form-control" name="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" autocomplete="username"></div>
            <div class="col-md-6"><label class="form-label">Contraseña inicial</label><input class="form-control" type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password"></div>
          </div></div>
          <div class="col-12"><button class="btn btn-primary" type="submit"><i class="bi bi-check2-circle me-1"></i>Registrar préstamo</button></div>`;
        return `<div class="card mb-3"><div class="card-header"><i class="bi bi-plus-circle text-primary me-1"></i> Registrar préstamo</div>
          <div class="card-body"><form data-form="loan" class="row g-3">
            <div class="col-md-8"><label class="form-label" for="loanCarnet">Carnet o código del prestatario</label><input class="form-control" id="loanCarnet" name="carnet" maxlength="40" required autocomplete="off"></div>
            <div class="col-md-4 d-flex align-items-end"><button class="btn btn-outline-primary w-100" type="button" data-action="lookup-reader"><i class="bi bi-search me-1"></i>Buscar carnet</button></div>
            <div class="col-12" id="loanReaderResult"><div class="alert alert-info mb-0"><i class="bi bi-info-circle me-1"></i>Busque el carnet para identificar a la persona. La consulta se realiza en el registro local de demostración, no en la base institucional del ITCA.</div></div>
            <template id="loanFieldsTemplate">${loanFields}</template>
          </form></div></div>
          ${card('Préstamos registrados', 'bi-box-arrow-up-right', table(
            ['Libro', 'Prestatario', 'Fecha de préstamo', 'Fecha límite', 'Estado'],
            loanRows(loans)
          ))}`;
      }
      if (view === 'devoluciones') {
        return card('Circulación', 'bi-box-arrow-in-down-left', table(
          ['Libro', 'Prestatario', 'Fecha de préstamo', 'Fecha límite', 'Estado', 'Acción'],
          loanRows(loans, true)
        ));
      }
      const activeLoans = loans.filter(loan => loan.estado === 'Activo');
      const late = activeLoans.filter(loan => Number(loan.dias_mora) > 0);
      if (view === 'reportes') {
        const [{ data: books }, { total: readers }] = await Promise.all([api('/api/libros'), api('/api/lectores')]);
        return `<div class="row g-3">
          <div class="col-md-4"><div class="kpi"><div class="etiqueta">Libros en catálogo</div><div class="valor">${books.length}</div></div></div>
          <div class="col-md-4"><div class="kpi"><div class="etiqueta">Prestatarios</div><div class="valor">${readers}</div></div></div>
          <div class="col-md-4"><div class="kpi"><div class="etiqueta">Préstamos activos</div><div class="valor">${activeLoans.length}</div></div></div>
        </div>${card('Actividad reciente', 'bi-bar-chart-line', table(
          ['Libro', 'Prestatario', 'Fecha', 'Estado'], loanRows(loans.slice(0, 10))
        ))}`;
      }
      return `<div class="row g-3 mb-3">
        <div class="col-md-4"><div class="kpi"><div class="etiqueta">Préstamos activos</div><div class="valor">${activeLoans.length}</div></div></div>
        <div class="col-md-4"><div class="kpi"><div class="etiqueta">Vencidos</div><div class="valor">${late.length}</div></div></div>
        <div class="col-md-4"><div class="kpi"><div class="etiqueta">En circulación</div><div class="valor">${loans.length}</div></div></div>
      </div>${card('Préstamos activos', 'bi-speedometer2', table(
        ['Libro', 'Prestatario', 'Fecha de préstamo', 'Fecha límite', 'Estado'],
        loanRows(activeLoans)
      ))}`;
    }
    if (view === 'config') {
      const { data: librarians } = await api('/api/accounts');
      return `<div class="card"><div class="card-header"><i class="bi bi-person-gear text-primary me-1"></i> Crear cuenta de bibliotecaria</div>
        <div class="card-body"><form data-form="librarian" class="row g-3">
          <div class="col-md-4"><label class="form-label">Nombre completo</label><input class="form-control" name="nombre" maxlength="120" required></div>
          <div class="col-md-4"><label class="form-label">Nombre de usuario</label><input class="form-control" name="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" required></div>
          <div class="col-md-4"><label class="form-label">Contraseña inicial</label><input class="form-control" type="password" name="password" minlength="12" maxlength="128" required></div>
          <div class="col-12"><button class="btn btn-primary" type="submit">Crear cuenta BIBLIOTECARIA</button></div>
        </form><p class="text-muted-2 small mb-0 mt-3">Solo SUPERADMIN puede crear y administrar cuentas de bibliotecaria.</p></div></div>
        <div id="accountEditHost"></div>
        ${card('Cuentas de bibliotecaria', 'bi-people-gear', table(
          ['Nombre', 'Usuario', 'Rol', 'Creada', 'Acciones'],
          librarians.map(account => `<tr>
            <td>${esc(account.nombre)}</td><td>${esc(account.username)}</td><td>${esc(roleNames[account.role] || account.role)}</td>
            <td>${esc(String(account.creado_en || '').slice(0, 10) || '—')}</td>
            <td><button class="btn btn-sm btn-outline-primary" type="button" data-edit-account="${account.id}">
              <i class="bi bi-pencil-square me-1"></i>Editar / contraseña
            </button></td>
          </tr>`),
          'Aún no hay cuentas de bibliotecaria.'
        ))}`;
    }
    if (view === 'auditoria') {
      return card('Auditoría', 'bi-shield-check', '<div class="alert alert-info mb-0">La API actual no expone un registro de auditoría consultable. No se muestran datos de demostración.</div>');
    }
    return card('Biblioteca ITCA FEPADE', 'bi-info-circle', '<p class="mb-0">Catálogo público, circulación y consulta privada de préstamos en la Sede Santa Ana.</p>');
  }

  async function submitForm(event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    let readerCreated = false;
    try {
      if (form.dataset.form === 'loan') {
        const result = $('#loanReaderResult', form);
        if (result?.dataset.readerReady !== 'true') {
          toast('Busque y confirme el carnet antes de registrar el préstamo.', 'warning');
          return;
        }
        const values = Object.fromEntries(new FormData(form).entries());
        const { carnet, crear_cuenta: createAccountValue, username, password, nombre, tipo, correo, telefono, ...loan } = values;
        const createAccount = createAccountValue === 'on';
        let readerId = Number(values.usuario_id) || null;
        if (result.dataset.newReader === 'true') {
          const { data: reader } = await api('/api/usuarios', {
            method: 'POST',
            body: JSON.stringify({ nombre, carnet, tipo, correo, telefono })
          });
          readerId = reader.id;
          readerCreated = true;
        }
        await api('/api/prestamos', {
          method: 'POST',
          body: JSON.stringify({ ...loan, usuario_id: readerId })
        });
        if (createAccount) {
          try {
            await api('/api/accounts', {
              method: 'POST',
              body: JSON.stringify({ role: 'PRESTATARIO', username, password, reader_id: readerId })
            });
          } catch (error) {
            toast(`El préstamo quedó registrado, pero no se pudo crear el acceso: ${error.message}`, 'warning', 'Préstamo registrado');
            await openView(vistaActual);
            return;
          }
        }
        toast(createAccount
          ? 'Préstamo registrado y acceso de prestatario creado.'
          : 'Préstamo registrado correctamente.', 'success');
        await openView(vistaActual);
        return;
      } else if (form.dataset.form === 'librarian') {
        const values = Object.fromEntries(new FormData(form).entries());
        await api('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({ ...values, role: 'BIBLIOTECARIA' })
        });
      } else if (form.dataset.form === 'account-edit') {
        const values = Object.fromEntries(new FormData(form).entries());
        const { account_id, password, ...account } = values;
        if (password) account.password = password;
        await api(`/api/accounts/${encodeURIComponent(account_id)}`, {
          method: 'PATCH',
          body: JSON.stringify(account)
        });
      } else if (form.dataset.form === 'book') {
        const values = Object.fromEntries(new FormData(form).entries());
        await api('/api/libros', { method: 'POST', body: JSON.stringify(values) });
      }
      toast('Los cambios se guardaron correctamente.', 'success');
      await openView(vistaActual);
    } catch (error) {
      toast(readerCreated
        ? `El prestatario quedó registrado, pero el préstamo no se completó: ${error.message}`
        : esc(error.message), 'danger', readerCreated ? 'Prestatario registrado' : 'No se pudo completar la operación');
    }
  }

  async function setup() {
    const form = $('#formLogin');
    form.removeEventListener('submit', window.procesarLogin);
    form.addEventListener('submit', authenticate);
    $('#vistaContenedor').addEventListener('submit', submitForm);
    $('#vistaContenedor').addEventListener('input', event => {
      if (event.target.id !== 'filtroLibros') return;
      const query = event.target.value.trim().toLocaleLowerCase();
      document.querySelectorAll('[data-book-search]').forEach(row => {
        row.classList.toggle('d-none', !row.dataset.bookSearch.includes(query));
      });
    });
    $('#vistaContenedor').addEventListener('click', async event => {
      const lookupButton = event.target.closest('[data-action="lookup-reader"]');
      if (lookupButton) {
        const form = lookupButton.closest('form[data-form="loan"]');
        const carnetInput = form.elements.carnet;
        if (!carnetInput.reportValidity()) return;
        const result = $('#loanReaderResult', form);
        const carnet = carnetInput.value.trim();
        const bookTemplate = $('#loanFieldsTemplate', form);
        if (!bookTemplate) return;
        result.dataset.readerReady = 'false';
        delete result.dataset.newReader;
        lookupButton.disabled = true;
        result.innerHTML = '<div class="alert alert-info mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Buscando carnet en el registro local…</div>';
        try {
          const { data: reader } = await api(`/api/lectores/buscar?carnet=${encodeURIComponent(carnet)}`);
          const fields = document.createElement('template');
          fields.innerHTML = bookTemplate.innerHTML;
          if (reader.estado !== 'Activo') {
            result.dataset.readerReady = 'false';
            result.innerHTML = `<div class="alert alert-warning mb-0">El registro de ${esc(reader.nombre)} está ${esc(reader.estado)} y no puede recibir préstamos.</div>`;
          } else {
            const accessOption = fields.content.querySelector('[data-access-option]');
            if (reader.tiene_cuenta) {
              accessOption.outerHTML = '<div class="col-12"><div class="alert alert-success mb-0"><i class="bi bi-person-check me-1"></i>Prestatario identificado. Ya tiene acceso para consultar sus préstamos.</div></div>';
              fields.content.querySelector('[data-access-fields]').remove();
            }
            result.dataset.readerReady = 'true';
            result.dataset.newReader = 'false';
            result.innerHTML = `<input type="hidden" name="usuario_id" value="${esc(reader.id)}">
              <div class="alert alert-success mb-0"><i class="bi bi-person-check me-1"></i><strong>${esc(reader.nombre)}</strong> · ${esc(reader.tipo)} · Carnet ${esc(reader.carnet)}</div>
              <div class="row g-3">${fields.innerHTML}</div>`;
          }
        } catch (error) {
          if (error.status !== 404) {
            toast(esc(error.message), 'danger', 'No se pudo buscar el carnet');
            result.innerHTML = '<div class="alert alert-warning mb-0">No se pudo completar la búsqueda. Verifique la conexión e inténtelo de nuevo.</div>';
          } else {
            const fields = document.createElement('template');
            fields.innerHTML = bookTemplate.innerHTML;
            result.dataset.readerReady = 'true';
            result.dataset.newReader = 'true';
            result.innerHTML = `<div class="alert alert-warning mb-0"><i class="bi bi-person-plus me-1"></i>Este carnet no está en el registro local. Ingrese los datos para crear el prestatario y continuar con el préstamo.</div>
              <div class="row g-3">
              <div class="col-md-6"><label class="form-label">Nombre completo</label><input class="form-control" name="nombre" maxlength="120" required></div>
              <div class="col-md-6"><label class="form-label">Tipo de prestatario</label><select class="form-select" name="tipo" required><option value="estudiante_tecnico">Estudiante técnico</option><option value="cursos_libres">Cursos libres</option><option value="personal_administrativo">Personal administrativo</option><option value="otro">Otro</option></select></div>
              <div class="col-md-6"><label class="form-label">Correo institucional (opcional)</label><input class="form-control" type="email" name="correo" maxlength="254"></div>
              <div class="col-md-6"><label class="form-label">Teléfono (opcional)</label><input class="form-control" name="telefono" maxlength="30"></div>
              ${fields.innerHTML}</div>`;
          }
        } finally {
          lookupButton.disabled = false;
        }
        return;
      }
      const editAccountButton = event.target.closest('[data-edit-account]');
      if (editAccountButton) {
        const accountId = editAccountButton.dataset.editAccount;
        const { data: accounts } = await api('/api/accounts');
        const account = accounts.find(item => String(item.id) === accountId);
        if (!account) {
          toast('Actualice la lista de cuentas e inténtelo de nuevo.', 'warning', 'Cuenta no encontrada');
          await openView('config');
          return;
        }
        $('#accountEditHost').innerHTML = `<div class="card mb-3"><div class="card-header"><i class="bi bi-pencil-square text-primary me-1"></i> Editar cuenta de bibliotecaria</div>
          <div class="card-body"><form data-form="account-edit" class="row g-3">
            <input type="hidden" name="account_id" value="${esc(account.id)}">
            <div class="col-md-4"><label class="form-label">Nombre completo</label><input class="form-control" name="nombre" maxlength="120" value="${esc(account.nombre)}" required></div>
            <div class="col-md-4"><label class="form-label">Nombre de usuario</label><input class="form-control" name="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" value="${esc(account.username)}" required></div>
            <div class="col-md-4"><label class="form-label">Nueva contraseña <span class="text-muted-2">(opcional)</span></label><input class="form-control" type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="Mínimo 12 caracteres"></div>
            <div class="col-12 d-flex flex-wrap gap-2"><button class="btn btn-primary" type="submit">Guardar cambios</button><button class="btn btn-outline-secondary" type="button" data-cancel-account-edit>Cancelar</button></div>
            <div class="col-12 text-muted-2 small">Si cambia la contraseña, se cerrarán las sesiones activas de esta cuenta.</div>
          </form></div></div>`;
        $('#accountEditHost').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (event.target.closest('[data-cancel-account-edit]')) {
        $('#accountEditHost').replaceChildren();
        return;
      }
      if (event.target.matches('[data-action="toggle-access"]')) {
        const fields = $('#vistaContenedor [data-access-fields]');
        fields.classList.toggle('d-none', !event.target.checked);
        fields.querySelectorAll('input').forEach(input => {
          input.required = event.target.checked;
          if (!event.target.checked) input.value = '';
        });
        return;
      }
      const returnButton = event.target.closest('[data-return-loan]');
      if (returnButton) {
        returnButton.disabled = true;
        try {
          await api(`/api/prestamos/${encodeURIComponent(returnButton.dataset.returnLoan)}/devolucion`, { method: 'POST' });
          toast('Devolución registrada.', 'success');
          await openView('devoluciones');
        } catch (error) {
          returnButton.disabled = false;
          toast(esc(error.message), 'danger', 'No se pudo registrar la devolución');
        }
        return;
      }
      if (event.target.closest('[data-action="show-book-form"]')) {
        $('#formLibroHost').innerHTML = `<div class="card mb-3"><div class="card-body"><form data-form="book" class="row g-3">
          <div class="col-md-3"><label class="form-label">Código</label><input class="form-control" name="codigo" maxlength="40" required></div>
          <div class="col-md-4"><label class="form-label">Título</label><input class="form-control" name="titulo" maxlength="200" required></div>
          <div class="col-md-3"><label class="form-label">Autor</label><input class="form-control" name="autor" maxlength="160" required></div>
          <div class="col-md-2"><label class="form-label">Copias</label><input class="form-control" type="number" min="1" step="1" name="copias_totales" required></div>
          <div class="col-md-8"><label class="form-label">Categoría (opcional)</label><input class="form-control" name="categoria" maxlength="120"></div>
          <div class="col-md-4 d-flex align-items-end"><button class="btn btn-primary w-100" type="submit">Guardar libro</button></div>
        </form></div></div>`;
      }
    });
    try {
      const status = await api('/api/auth/setup-status');
      showSetupMode(status.setupRequired);
      const { user: account } = await api('/api/auth/me');
      if (account) {
        startSession(account);
      } else if (status.setupRequired) {
        $('#nombreSetup').focus();
      } else {
        $('#usuario').focus();
      }
    } catch (error) {
      showSetupMode(false);
      alertLogin(`No se pudo conectar con el servidor: ${error.message}`);
    }
  }

  window.bibliotecaServerAuth = {
    openView,
    logout() {
      active = false;
      api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
  };
  document.addEventListener('DOMContentLoaded', setup);
})();
