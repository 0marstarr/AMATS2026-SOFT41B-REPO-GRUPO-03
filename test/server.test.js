const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');

const databasePath = path.join(__dirname, 'server-test-data.sqlite');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${databasePath}${suffix}`, { force: true });
process.env.BIBLIOTECA_DB_PATH = databasePath;

const { app, db } = require('../server');
let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${databasePath}${suffix}`, { force: true });
});

async function request(endpoint, options = {}, cookie) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const body = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function login(username, password) {
  const result = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(result.response.status, 200);
  return { user: result.body.user, cookie: result.cookie };
}

test('setup, login, OPAC and role/owner isolation work server-side', async () => {
  const home = await request('/');
  assert.match(home.body, /Biblioteca ITCA FEPADE/);
  assert.match(home.body, /id="formLogin"/);
  assert.match(home.body, /app-auth\.js/);
  assert.match(home.body, /Explora nuestro catálogo/);
  assert.doesNotMatch(home.body, /Continuar como visitante/);
  assert.match(home.body, /data-roles="SUPERADMIN">.*Registro institucional/);
  assert.doesNotMatch(home.body, /data-vista="lectores"/);
  assert.match(home.body, /biblioteca\.itca\.edu\.sv\/biblioteca\/opac/);
  assert.doesNotMatch(home.body, /Credenciales de demostración/);
  const unauthenticatedRegistration = await request('/registro-usuarios.html', { redirect: 'manual' });
  assert.equal(unauthenticatedRegistration.response.status, 302);
  assert.equal(unauthenticatedRegistration.response.headers.get('location'), '/');
  assert.equal((await request('/test/server-test-data.sqlite')).response.status, 404);
  assert.equal((await request('/api/auth/setup-status')).body.setupRequired, true);
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.storage, 'sqlite');

  for (const endpoint of ['/api/usuarios', '/api/lectores', '/api/prestamos', '/api/notificaciones']) {
    assert.equal((await request(endpoint)).response.status, 401, `${endpoint} must require authentication`);
  }
  assert.equal((await request('/api/accounts')).response.status, 401);
  assert.equal((await request('/api/libros')).response.status, 200);
  assert.equal((await request('/api/lectores', { method: 'POST', body: {} })).response.status, 401);
  assert.equal((await request('/api/libros', { method: 'POST', body: {} })).response.status, 401);
  assert.equal((await request('/api/prestamos', { method: 'POST', body: {} })).response.status, 401);

  const setup = await request('/api/auth/setup', {
    method: 'POST',
    body: { nombre: 'Administradora', username: 'admin.local', password: 'super-secret-setup-1' }
  });
  assert.equal(setup.response.status, 201);
  assert.equal(setup.body.user.role, 'SUPERADMIN');
  assert.match(setup.cookie, /^biblioteca_session=/);
  const cookieHeader = setup.response.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Lax/);
  assert.match(cookieHeader, /Path=\//);
  const credentials = db.prepare('SELECT password_salt, password_hash, nombre FROM Cuentas').get();
  assert.match(credentials.password_hash, /^[a-f0-9]{128}$/);
  assert.notEqual(credentials.password_hash, 'super-secret-setup-1');
  assert.equal(credentials.nombre, 'Administradora');
  const rawSessionToken = decodeURIComponent(setup.cookie.slice('biblioteca_session='.length));
  assert.equal(db.prepare('SELECT token_hash FROM Sesiones').get().token_hash,
    crypto.createHash('sha256').update(rawSessionToken).digest('hex'));
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM Sesiones').get().total, 1);
  assert.equal((await request('/api/auth/setup', {
    method: 'POST', body: { nombre: 'Intruso', username: 'second.admin', password: 'another-secret-1' }
  })).response.status, 409);

  const badLogin = await request('/api/auth/login', {
    method: 'POST', body: { username: 'admin.local', password: 'wrong-password' }
  });
  assert.equal(badLogin.response.status, 401);
  const admin = { user: setup.body.user, cookie: setup.cookie };
  const registrationPage = await request('/registro-usuarios.html', {}, admin.cookie);
  assert.equal(registrationPage.response.status, 200);
  assert.match(registrationPage.body, /staffName/);
  assert.doesNotMatch(registrationPage.body, /Ada Elizabeth Pérez de Artiga/);
  const currentSession = await request('/api/auth/me', {}, admin.cookie);
  assert.equal(currentSession.body.user.role, 'SUPERADMIN');
  assert.equal(currentSession.body.user.nombre, 'Administradora');

  const createdLibrarian = await request('/api/accounts', {
    method: 'POST',
    body: { role: 'BIBLIOTECARIA', username: 'bibliotecaria', password: 'librarian-password-1' }
  }, admin.cookie);
  assert.equal(createdLibrarian.response.status, 201);
  assert.equal(createdLibrarian.body.user.role, 'BIBLIOTECARIA');
  const accountList = await request('/api/accounts', {}, admin.cookie);
  assert.equal(accountList.response.status, 200);
  assert.equal(accountList.body.total, 1);
  assert.deepEqual(Object.keys(accountList.body.data[0]).sort(), ['creado_en', 'id', 'nombre', 'role', 'username']);
  const librarianSession = await login('bibliotecaria', 'librarian-password-1');
  const updatedLibrarian = await request(`/api/accounts/${createdLibrarian.body.user.id}`, {
    method: 'PATCH',
    body: {
      nombre: 'Bibliotecaria Actualizada',
      username: 'bibliotecaria.nueva',
      password: 'librarian-password-2'
    }
  }, admin.cookie);
  assert.equal(updatedLibrarian.response.status, 200);
  assert.equal(updatedLibrarian.body.user.nombre, 'Bibliotecaria Actualizada');
  assert.equal(updatedLibrarian.body.user.username, 'bibliotecaria.nueva');
  assert.equal((await request('/api/accounts', {}, librarianSession.cookie)).response.status, 401);
  assert.equal((await request('/api/auth/login', {
    method: 'POST', body: { username: 'bibliotecaria', password: 'librarian-password-1' }
  })).response.status, 401);
  const librarian = await login('bibliotecaria.nueva', 'librarian-password-2');
  assert.equal(librarian.user.role, 'BIBLIOTECARIA');
  assert.equal(librarian.user.nombre, 'Bibliotecaria Actualizada');
  assert.equal((await request('/api/accounts', {}, librarian.cookie)).response.status, 403);
  const librarianRegistrationPage = await request('/registro-usuarios.html', { redirect: 'manual' }, librarian.cookie);
  assert.equal(librarianRegistrationPage.response.status, 302);
  assert.equal(librarianRegistrationPage.response.headers.get('location'), '/');
  assert.equal((await request(`/api/accounts/${admin.user.id}`, {
    method: 'PATCH', body: { nombre: 'Cuenta no modificable' }
  }, admin.cookie)).response.status, 404);
  assert.equal((await request(`/api/accounts/${createdLibrarian.body.user.id}`, {
    method: 'PATCH', body: { password: 'short' }
  }, admin.cookie)).response.status, 400);
  assert.equal((await request('/api/accounts', {
    method: 'POST',
    body: { role: 'BIBLIOTECARIA', username: 'not-allowed', password: 'another-password-1' }
  }, librarian.cookie)).response.status, 403);

  const firstReaderAccount = await request('/api/accounts', {
    method: 'POST',
    body: {
      role: 'PRESTATARIO',
      username: 'reader.one',
      password: 'reader-one-password',
      lector: {
        nombre: 'Prestataria Uno',
        carnet: 'R-001',
        correo: 'reader.one@itca.edu.sv',
        tipo: 'estudiante_tecnico'
      }
    }
  }, librarian.cookie);
  assert.equal(firstReaderAccount.response.status, 201);
  assert.ok(firstReaderAccount.body.user.reader_id);
  const secondReaderAccount = await request('/api/accounts', {
    method: 'POST',
    body: {
      role: 'PRESTATARIO',
      username: 'reader.two',
      password: 'reader-two-password',
      lector: { nombre: 'Prestatario Dos', tipo: 'cursos_libres' }
    }
  }, librarian.cookie);
  assert.equal(secondReaderAccount.response.status, 201);
  const foundReader = await request('/api/lectores/buscar?carnet=R-001', {}, librarian.cookie);
  assert.equal(foundReader.response.status, 200);
  assert.equal(foundReader.body.data.nombre, 'Prestataria Uno');
  assert.equal(foundReader.body.data.tiene_cuenta, 1);
  assert.equal((await request('/api/lectores/buscar?carnet=missing', {}, librarian.cookie)).response.status, 404);
  assert.equal((await request('/api/lectores/buscar', {}, librarian.cookie)).response.status, 400);

  const firstBook = await request('/api/libros', {
    method: 'POST',
    body: { codigo: 'ITCA-001', titulo: 'Libro prestado', autor: 'Autora', copias_totales: 1 }
  }, librarian.cookie);
  assert.equal(firstBook.response.status, 201);
  const availableBook = await request('/api/libros', {
    method: 'POST',
    body: { codigo: 'ITCA-002', titulo: 'Libro disponible', autor: 'Autor', copias_totales: 3 }
  }, librarian.cookie);
  assert.equal(availableBook.response.status, 201);
  const firstLoan = await request('/api/prestamos', {
    method: 'POST',
    body: { usuario_id: firstReaderAccount.body.user.reader_id, libro_id: firstBook.body.data.id }
  }, librarian.cookie);
  assert.equal(firstLoan.response.status, 201);
  const secondLoan = await request('/api/prestamos', {
    method: 'POST',
    body: { usuario_id: secondReaderAccount.body.user.reader_id, libro_id: availableBook.body.data.id }
  }, librarian.cookie);
  assert.equal(secondLoan.response.status, 201);
  const newBorrower = await request('/api/usuarios', {
    method: 'POST',
    body: { nombre: 'Estudiante de cursos libres', carnet: 'CL-003', tipo: 'cursos_libres' }
  }, librarian.cookie);
  assert.equal(newBorrower.response.status, 201);
  const foundNewBorrower = await request('/api/lectores/buscar?carnet=CL-003', {}, librarian.cookie);
  assert.equal(foundNewBorrower.response.status, 200);
  assert.equal(foundNewBorrower.body.data.tiene_cuenta, 0);
  const thirdLoan = await request('/api/prestamos', {
    method: 'POST',
    body: { usuario_id: newBorrower.body.data.id, libro_id: availableBook.body.data.id }
  }, librarian.cookie);
  assert.equal(thirdLoan.response.status, 201);

  const publicBooks = await request('/api/libros');
  assert.deepEqual(publicBooks.body.data.map((book) => book.titulo), ['Libro disponible']);
  const reader = await login('reader.one', 'reader-one-password');
  assert.equal(reader.user.role, 'PRESTATARIO');
  assert.equal(reader.user.reader_id, firstReaderAccount.body.user.reader_id);
  const readerRegistrationPage = await request('/registro-usuarios.html', { redirect: 'manual' }, reader.cookie);
  assert.equal(readerRegistrationPage.response.status, 302);
  assert.equal((await request('/api/accounts', {
    method: 'POST',
    body: { role: 'PRESTATARIO', username: 'borrower.denied', password: 'borrower-password' }
  }, reader.cookie)).response.status, 403);
  const ownLoans = await request('/api/prestamos', {}, reader.cookie);
  assert.equal(ownLoans.response.status, 200);
  assert.equal(ownLoans.body.total, 1);
  assert.equal(ownLoans.body.data[0].usuario_id, reader.user.reader_id);
  assert.equal(ownLoans.body.data[0].titulo, 'Libro prestado');
  assert.equal((await request('/api/notificaciones', {}, reader.cookie)).response.status, 403);
  assert.equal((await request('/api/lectores', {}, reader.cookie)).response.status, 403);
  assert.equal((await request(`/api/usuarios/${secondReaderAccount.body.user.reader_id}`, {}, reader.cookie)).response.status, 403);
  assert.equal((await request('/api/prestamos', { method: 'POST', body: {} }, reader.cookie)).response.status, 403);
  assert.equal((await request(`/api/prestamos/${firstLoan.body.data.id}/devolucion`, {
    method: 'POST'
  }, reader.cookie)).response.status, 403);
  assert.equal((await request('/api/libros', { method: 'POST', body: {} }, reader.cookie)).response.status, 403);

  const staffLoans = await request('/api/prestamos', {}, librarian.cookie);
  assert.equal(staffLoans.body.total, 3);
  assert.equal((await request('/api/notificaciones', {}, librarian.cookie)).response.status, 200);
  assert.equal((await request('/api/lectores', {}, librarian.cookie)).body.total, 3);

  const logout = await request('/api/auth/logout', { method: 'POST' }, reader.cookie);
  assert.equal(logout.response.status, 200);
  assert.equal((await request('/api/prestamos', {}, reader.cookie)).response.status, 401);
});
