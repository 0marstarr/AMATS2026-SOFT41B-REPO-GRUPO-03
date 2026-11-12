require('express-async-errors');
const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const { db, dbReady, isPostgres } = require('./database');
const { addBusinessDays, countLateBusinessDays } = require('./loan-calendar');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = isPostgres
  ? null
  : process.env.BIBLIOTECA_DB_PATH || path.join(__dirname, 'data', 'biblioteca.sqlite');
const TIPOS_USUARIO = new Set([
  'estudiante_tecnico',
  'cursos_libres',
  'personal_administrativo',
  'otro'
]);
const ESTADOS_USUARIO = new Set(['Activo', 'Inactivo']);
const ROLES = new Set(['SUPERADMIN', 'BIBLIOTECARIA', 'PRESTATARIO']);
const SESSION_COOKIE = 'biblioteca_session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

const fechaLocal = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
};

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));
app.use((req, res, next) => dbReady.then(next, next));
app.use((req, res, next) => {
  let requestedPath;
  try {
    requestedPath = path.resolve(__dirname, `.${decodeURIComponent(req.path)}`);
  } catch {
    return res.sendStatus(400);
  }
  const databasePaths = !DB_PATH || DB_PATH === ':memory:'
    ? []
    : [path.resolve(DB_PATH), `${path.resolve(DB_PATH)}-wal`, `${path.resolve(DB_PATH)}-shm`];
  if (databasePaths.includes(requestedPath)) return res.sendStatus(404);
  return next();
});
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function publicAccount(account) {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    reader_id: account.reader_id ?? null,
    nombre: account.lector_nombre || account.nombre || account.username
  };
}

function cookieToken(req) {
  const cookie = req.headers.cookie || '';
  const value = cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return value ? decodeURIComponent(value.slice(SESSION_COOKIE.length + 1)) : null;
}

function sessionCookie(token, req) {
  const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`;
}

function clearSessionCookie(req) {
  const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function authenticate(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const token = cookieToken(req);
  if (!token) return res.status(401).json({ ok: false, message: 'Inicie sesión para continuar' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const session = await db.get(`
    SELECT c.id, c.username, c.nombre, c.role, c.reader_id, u.nombre AS lector_nombre
    FROM Sesiones s
    JOIN Cuentas c ON c.id = s.cuenta_id
    LEFT JOIN Usuarios u ON u.id = c.reader_id
    WHERE s.token_hash = ? AND s.expira_en > ?
  `, tokenHash, now);
  if (!session) {
    await db.run('DELETE FROM Sesiones WHERE token_hash = ? OR expira_en <= ?', tokenHash, now);
    res.setHeader('Set-Cookie', clearSessionCookie(req));
    return res.status(401).json({ ok: false, message: 'La sesión expiró; inicie sesión nuevamente' });
  }
  req.account = publicAccount(session);
  return next();
}

async function optionalAuthenticate(req, res, next) {
  const token = cookieToken(req);
  if (!token) return next();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = await db.get(`
    SELECT c.id, c.username, c.nombre, c.role, c.reader_id, u.nombre AS lector_nombre
    FROM Sesiones s
    JOIN Cuentas c ON c.id = s.cuenta_id
    LEFT JOIN Usuarios u ON u.id = c.reader_id
    WHERE s.token_hash = ? AND s.expira_en > ?
  `, tokenHash, Math.floor(Date.now() / 1000));
  if (session) req.account = publicAccount(session);
  else {
    await db.run('DELETE FROM Sesiones WHERE token_hash = ?', tokenHash);
    res.setHeader('Set-Cookie', clearSessionCookie(req));
  }
  return next();
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.account) return res.status(401).json({ ok: false, message: 'Inicie sesión para continuar' });
    if (!roles.includes(req.account.role)) {
      return res.status(403).json({ ok: false, message: 'No tiene permiso para esta operación' });
    }
    return next();
  };
}

const staffRoles = ['SUPERADMIN', 'BIBLIOTECARIA'];
const isoDateValue = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

app.get('/registro-usuarios.html', optionalAuthenticate, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.account || req.account.role !== 'SUPERADMIN') return res.redirect('/');
  return res.sendFile(path.join(__dirname, 'registro-usuarios.html'));
});

app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

const validPassword = (password) => typeof password === 'string' && password.length >= 12 && Buffer.byteLength(password, 'utf8') <= 128;
const validUsername = (username) => typeof username === 'string' && /^[a-zA-Z0-9._-]{3,40}$/.test(username);

async function createAccount(username, password, role, readerId = null, nombre = username, database = db) {
  const credentials = hashPassword(password);
  return database.run(`
    INSERT INTO Cuentas (username, nombre, password_salt, password_hash, role, reader_id)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id
  `, username, nombre, credentials.salt, credentials.hash, role, readerId);
}

async function startSession(accountId, req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  await db.run('DELETE FROM Sesiones WHERE expira_en <= ?', now);
  await db.run('INSERT INTO Sesiones (token_hash, cuenta_id, expira_en, creado_en) VALUES (?, ?, ?, ?)',
    crypto.createHash('sha256').update(token).digest('hex'), accountId, now + SESSION_DURATION_SECONDS, now);
  res.setHeader('Set-Cookie', sessionCookie(token, req));
}

app.get('/api/auth/setup-status', async (req, res) => {
  const accounts = Number((await db.get('SELECT COUNT(*) AS total FROM Cuentas')).total);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, setupRequired: accounts === 0 });
});

app.post('/api/auth/setup', async (req, res) => {
  const { nombre, username, password } = req.body || {};
  const name = typeof nombre === 'string' ? nombre.trim() : '';
  if (!validUsername(username) || !validPassword(password) || !name || name.length > 120) {
    return res.status(400).json({ ok: false, message: 'Ingrese nombre, usuario válido y contraseña de al menos 12 caracteres' });
  }
  try {
    const accountId = await db.transaction(async (tx) => {
      if (isPostgres) await tx.get('SELECT pg_advisory_xact_lock(8274001)');
      if (Number((await tx.get('SELECT COUNT(*) AS total FROM Cuentas')).total) !== 0) return null;
      const created = await createAccount(username, password, 'SUPERADMIN', null, name, tx);
      return created.lastInsertRowid;
    });
    if (accountId === null) {
      return res.status(409).json({ ok: false, message: 'La configuración inicial ya fue completada' });
    }
    await startSession(accountId, req, res);
    return res.status(201).json({
      ok: true,
      user: publicAccount({ id: accountId, username, role: 'SUPERADMIN', nombre: name })
    });
  } catch (error) {
    if (db.isUniqueViolation(error)) {
      return res.status(409).json({ ok: false, message: 'Ese nombre de usuario ya está registrado' });
    }
    console.error('Error al configurar la cuenta inicial:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo completar la configuración inicial' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 128) {
    return res.status(400).json({ ok: false, message: 'Ingrese usuario y contraseña' });
  }
  const account = await db.get(`
    SELECT c.id, c.username, c.nombre, c.password_salt, c.password_hash,
      c.role, c.reader_id, u.nombre AS lector_nombre
    FROM Cuentas c LEFT JOIN Usuarios u ON u.id = c.reader_id
    WHERE lower(c.username) = lower(?)
  `, username);
  const attemptedHash = crypto.scryptSync(password, account?.password_salt || 'invalid-account-salt', 64);
  const storedHash = account ? Buffer.from(account.password_hash, 'hex') : Buffer.alloc(64);
  if (!account || !crypto.timingSafeEqual(attemptedHash, storedHash)) {
    return res.status(401).json({ ok: false, message: 'Usuario o contraseña incorrectos' });
  }
  await startSession(account.id, req, res);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true, user: publicAccount(account) });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = cookieToken(req);
  if (token) {
    await db.run('DELETE FROM Sesiones WHERE token_hash = ?',
      crypto.createHash('sha256').update(token).digest('hex'));
  }
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = cookieToken(req);
  if (!token) return res.json({ ok: true, user: null });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const account = await db.get(`
    SELECT c.id, c.username, c.nombre, c.role, c.reader_id, u.nombre AS lector_nombre
    FROM Sesiones s JOIN Cuentas c ON c.id = s.cuenta_id
    LEFT JOIN Usuarios u ON u.id = c.reader_id
    WHERE s.token_hash = ? AND s.expira_en > ?
  `, tokenHash, Math.floor(Date.now() / 1000));
  if (!account) return res.json({ ok: true, user: null });
  return res.json({ ok: true, user: publicAccount(account) });
});

app.get('/api/accounts', authenticate, allowRoles('SUPERADMIN'), async (req, res) => {
  const data = await db.all(`
    SELECT id, username, nombre, role, creado_en
    FROM Cuentas
    WHERE role = 'BIBLIOTECARIA'
    ORDER BY lower(nombre), id
  `);
  return res.json({ ok: true, total: data.length, data });
});

app.post('/api/accounts', authenticate, async (req, res) => {
  const { role, username, password } = req.body || {};
  if (!validUsername(username) || !validPassword(password) || !ROLES.has(role) || role === 'SUPERADMIN') {
    return res.status(400).json({ ok: false, message: 'Ingrese rol, usuario válido y contraseña de al menos 12 caracteres' });
  }
  if (role === 'BIBLIOTECARIA' && req.account.role !== 'SUPERADMIN') {
    return res.status(403).json({ ok: false, message: 'Solo SUPERADMIN puede crear bibliotecarias' });
  }
  if (role === 'PRESTATARIO' && !staffRoles.includes(req.account.role)) {
    return res.status(403).json({ ok: false, message: 'Solo personal autorizado puede crear prestatarios' });
  }
  if (!staffRoles.includes(req.account.role)) {
    return res.status(403).json({ ok: false, message: 'No tiene permiso para crear cuentas' });
  }
  const accountName = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : username;
  if (!accountName || accountName.length > 120) {
    return res.status(400).json({ ok: false, message: 'El nombre de la cuenta no debe exceder 120 caracteres' });
  }
  let readerId = null;
  let displayName = accountName;
  try {
    const created = await db.transaction(async (tx) => {
    if (role === 'PRESTATARIO') {
      if (Number.isInteger(Number(req.body.reader_id)) && Number(req.body.reader_id) > 0) {
        readerId = Number(req.body.reader_id);
        const reader = await tx.get('SELECT id, nombre FROM Usuarios WHERE id = ?', readerId);
        if (!reader) {
          return { error: 'not-found' };
        }
        displayName = reader.nombre;
      } else {
        const datos = req.body.lector || {};
        const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
        const tipo = typeof datos.tipo === 'string' ? datos.tipo : '';
        const carnet = typeof datos.carnet === 'string' ? datos.carnet.trim() : '';
        const correo = typeof datos.correo === 'string' ? datos.correo.trim().toLowerCase() : '';
        const telefono = typeof datos.telefono === 'string' ? datos.telefono.trim() : '';
        if (!nombre || nombre.length > 120 || !TIPOS_USUARIO.has(tipo) ||
            (carnet && carnet.length > 40) || (telefono && telefono.length > 30) ||
            (correo && (correo.length > 254 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@itca\.edu\.sv$/i.test(correo)))) {
          return { error: 'invalid-reader' };
        }
        readerId = (await tx.run(`
          INSERT INTO Usuarios (nombre, carnet, correo, telefono, tipo, estado)
          VALUES (?, ?, ?, ?, ?, 'Activo') RETURNING id
        `, nombre, carnet || null, correo || null, telefono || null, tipo)).lastInsertRowid;
        displayName = nombre;
      }
    }
    const accountId = (await createAccount(username, password, role, readerId, displayName, tx)).lastInsertRowid;
    const account = await tx.get(`
      SELECT c.id, c.username, c.nombre, c.role, c.reader_id, u.nombre AS lector_nombre
      FROM Cuentas c LEFT JOIN Usuarios u ON u.id = c.reader_id WHERE c.id = ?
    `, accountId);
    return { account };
    });
    if (created.error === 'not-found') {
      return res.status(404).json({ ok: false, message: 'Prestatario no encontrado' });
    }
    if (created.error === 'invalid-reader') {
      return res.status(400).json({ ok: false, message: 'Ingrese datos válidos para crear el prestatario' });
    }
    const account = created.account;
    return res.status(201).json({ ok: true, user: publicAccount(account) });
  } catch (error) {
    if (db.isUniqueViolation(error)) {
      return res.status(409).json({ ok: false, message: 'El usuario ya existe o el prestatario ya tiene una cuenta' });
    }
    console.error('Error al crear cuenta:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo crear la cuenta' });
  }
});

app.patch('/api/accounts/:id', authenticate, allowRoles('SUPERADMIN'), async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId < 1) {
    return res.status(400).json({ ok: false, message: 'Identificador de cuenta inválido' });
  }
  const account = await db.get(`
    SELECT id, username, nombre, role
    FROM Cuentas
    WHERE id = ?
  `, accountId);
  if (!account || account.role !== 'BIBLIOTECARIA') {
    return res.status(404).json({ ok: false, message: 'Cuenta de bibliotecaria no encontrada' });
  }

  const updates = [];
  const values = [];
  if (Object.hasOwn(req.body || {}, 'nombre')) {
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre || nombre.length > 120) {
      return res.status(400).json({ ok: false, message: 'El nombre debe tener entre 1 y 120 caracteres' });
    }
    updates.push('nombre = ?');
    values.push(nombre);
  }
  if (Object.hasOwn(req.body || {}, 'username')) {
    if (!validUsername(req.body.username)) {
      return res.status(400).json({ ok: false, message: 'Ingrese un nombre de usuario válido' });
    }
    updates.push('username = ?');
    values.push(req.body.username);
  }
  const passwordProvided = Object.hasOwn(req.body || {}, 'password');
  if (passwordProvided && !validPassword(req.body.password)) {
    return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 12 caracteres' });
  }
  if (passwordProvided) {
    const credentials = hashPassword(req.body.password);
    updates.push('password_salt = ?', 'password_hash = ?');
    values.push(credentials.salt, credentials.hash);
  }
  if (!updates.length) {
    return res.status(400).json({ ok: false, message: 'No se recibieron cambios para guardar' });
  }

  try {
    await db.run(`UPDATE Cuentas SET ${updates.join(', ')} WHERE id = ?`, ...values, accountId);
    if (passwordProvided) await db.run('DELETE FROM Sesiones WHERE cuenta_id = ?', accountId);
    const updated = await db.get(`
      SELECT id, username, nombre, role, creado_en
      FROM Cuentas
      WHERE id = ?
    `, accountId);
    return res.json({ ok: true, user: publicAccount(updated) });
  } catch (error) {
    if (db.isUniqueViolation(error)) {
      return res.status(409).json({ ok: false, message: 'Ese nombre de usuario ya está registrado' });
    }
    console.error('Error al actualizar cuenta:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo actualizar la cuenta' });
  }
});

app.get('/api/health', async (req, res) => {
  await db.health();
  res.json({
    ok: true,
    status: 'online',
    service: 'amats2026-soft41b-repo-grupo-03',
    storage: db.type,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/config/prestamos', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const configuracion = await db.get('SELECT dias_habiles FROM ConfiguracionPrestamo WHERE id = 1');
  return res.json({ ok: true, data: { dias_habiles: Number(configuracion.dias_habiles) } });
});

app.put('/api/config/prestamos', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const days = Number(req.body?.dias_habiles);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return res.status(400).json({ ok: false, message: 'El plazo debe ser un número entero entre 1 y 90 días hábiles' });
  }
  await db.run('UPDATE ConfiguracionPrestamo SET dias_habiles = ? WHERE id = 1', days);
  return res.json({ ok: true, data: { dias_habiles: days } });
});

app.get('/api/feriados', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const data = await db.all('SELECT fecha, descripcion FROM Feriados ORDER BY fecha');
  return res.json({ ok: true, total: data.length, data: data.map((holiday) => ({ ...holiday, fecha: isoDateValue(holiday.fecha) })) });
});

app.post('/api/feriados', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const date = typeof req.body?.fecha === 'string' ? req.body.fecha : '';
  const description = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : '';
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ ok: false, message: 'Seleccione una fecha válida' });
    }
  } catch {
    return res.status(400).json({ ok: false, message: 'Seleccione una fecha válida' });
  }
  if (!description || description.length > 120) {
    return res.status(400).json({ ok: false, message: 'La descripción debe tener entre 1 y 120 caracteres' });
  }
  try {
    await db.run('INSERT INTO Feriados (fecha, descripcion) VALUES (?, ?)', date, description);
  } catch (error) {
    if (db.isUniqueViolation(error)) {
      return res.status(409).json({ ok: false, message: 'Ya existe un feriado registrado para esa fecha' });
    }
    console.error('Error al registrar feriado:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo guardar el feriado' });
  }
  return res.status(201).json({ ok: true, data: { fecha: date, descripcion: description } });
});

app.delete('/api/feriados/:fecha', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const date = req.params.fecha;
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ ok: false, message: 'Seleccione una fecha válida' });
    }
  } catch {
    return res.status(400).json({ ok: false, message: 'Seleccione una fecha válida' });
  }
  const result = await db.run('DELETE FROM Feriados WHERE fecha = ?', date);
  if (result.changes === 0) return res.status(404).json({ ok: false, message: 'No se encontró el feriado' });
  return res.json({ ok: true });
});

async function listarUsuarios(req, res) {
  const data = await db.all(`
    SELECT id, nombre, carnet, correo, telefono, tipo, estado, creado_en
    FROM Usuarios
    ORDER BY lower(nombre), id
  `);

  res.json({ ok: true, total: data.length, data });
}
app.get('/api/usuarios', authenticate, allowRoles(...staffRoles), listarUsuarios);
app.get('/api/lectores', authenticate, allowRoles(...staffRoles), listarUsuarios);

app.get('/api/lectores/buscar', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const carnet = typeof req.query.carnet === 'string' ? req.query.carnet.trim() : '';
  if (!carnet || carnet.length > 40) {
    return res.status(400).json({ ok: false, message: 'Ingrese un carnet válido' });
  }
  const data = await db.get(`
    SELECT u.id, u.nombre, u.carnet, u.correo, u.telefono, u.tipo, u.estado,
      CASE WHEN EXISTS (SELECT 1 FROM Cuentas c WHERE c.reader_id = u.id) THEN 1 ELSE 0 END AS tiene_cuenta
    FROM Usuarios u
    WHERE lower(u.carnet) = lower(?)
  `, carnet);
  if (!data) return res.status(404).json({ ok: false, message: 'No se encontró el carnet en el registro local' });
  return res.json({ ok: true, data });
});

app.get('/api/usuarios/:id', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const usuario = await db.get(`
    SELECT id, nombre, carnet, correo, telefono, tipo, estado, creado_en
    FROM Usuarios
    WHERE id = ?
  `, Number(req.params.id));

  if (!usuario) {
    return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
  }

  return res.json({ ok: true, data: usuario });
});

async function registrarUsuario(req, res) {
  const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
  const carnetRecibido = typeof req.body?.carnet === 'string' ? req.body.carnet.trim() : '';
  const correoRecibido = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
  const telefonoRecibido = typeof req.body?.telefono === 'string' ? req.body.telefono.trim() : '';
  const tipo = typeof req.body?.tipo === 'string' ? req.body.tipo : '';
  const estado = typeof req.body?.estado === 'string' ? req.body.estado : 'Activo';
  const carnet = carnetRecibido || null;
  const correo = correoRecibido || null;
  const telefono = telefonoRecibido || null;

  if (!nombre || nombre.length > 120) {
    return res.status(400).json({ ok: false, message: 'El nombre es obligatorio y no debe exceder 120 caracteres' });
  }
  if (carnet && carnet.length > 40) {
    return res.status(400).json({ ok: false, message: 'El carnet o código no debe exceder 40 caracteres' });
  }
  if (correo && (
    correo.length > 254 ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@itca\.edu\.sv$/i.test(correo)
  )) {
    return res.status(400).json({ ok: false, message: 'El correo debe ser válido y terminar en @itca.edu.sv' });
  }
  if (telefono && telefono.length > 30) {
    return res.status(400).json({ ok: false, message: 'El teléfono no debe exceder 30 caracteres' });
  }
  if (!TIPOS_USUARIO.has(tipo)) {
    return res.status(400).json({ ok: false, message: 'Seleccione un tipo de usuario válido' });
  }
  if (!ESTADOS_USUARIO.has(estado)) {
    return res.status(400).json({ ok: false, message: 'Seleccione un estado válido' });
  }

  try {
    const result = await db.run(`
      INSERT INTO Usuarios (nombre, carnet, correo, telefono, tipo, estado)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id
    `, nombre, carnet, correo, telefono, tipo, estado);
    const usuario = await db.get(`
      SELECT id, nombre, carnet, correo, telefono, tipo, estado, creado_en
      FROM Usuarios WHERE id = ?
    `, result.lastInsertRowid);

    return res.status(201).json({
      ok: true,
      message: 'Usuario registrado correctamente',
      data: usuario
    });
  } catch (error) {
    if (db.isUniqueViolation(error)) {
      return res.status(409).json({
        ok: false,
        message: 'El carnet o correo ya está registrado'
      });
    }

    console.error('Error al registrar usuario:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo guardar el usuario' });
  }
}
app.post('/api/usuarios', authenticate, allowRoles(...staffRoles), registrarUsuario);
app.post('/api/lectores', authenticate, allowRoles(...staffRoles), registrarUsuario);

app.get('/api/libros', optionalAuthenticate, async (req, res) => {
  const sql = `
    SELECT l.id, l.codigo, l.titulo, l.autor, l.categoria, l.copias_totales,
      CAST((l.copias_totales - COUNT(CASE WHEN p.estado = 'Activo' THEN 1 END)) AS INTEGER) AS copias_disponibles,
      l.estado, l.creado_en
    FROM Libros l
    LEFT JOIN Prestamos p ON p.libro_id = l.id
    ${req.account && staffRoles.includes(req.account.role) ? '' : "WHERE l.estado = 'Activo'"}
    GROUP BY l.id
    ${req.account && staffRoles.includes(req.account.role) ? '' : "HAVING (l.copias_totales - COUNT(CASE WHEN p.estado = 'Activo' THEN 1 END)) > 0"}
    ORDER BY lower(l.titulo), l.id
  `;
  const data = await db.all(sql);
  res.json({ ok: true, total: data.length, data });
});

app.post('/api/libros', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const datos = {
    codigo: typeof req.body?.codigo === 'string' ? req.body.codigo.trim() : '',
    titulo: typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '',
    autor: typeof req.body?.autor === 'string' ? req.body.autor.trim() : '',
    categoria: typeof req.body?.categoria === 'string' ? req.body.categoria.trim() : '',
    copias: Number(req.body?.copias_totales)
  };
  if (!datos.codigo || datos.codigo.length > 40 || !datos.titulo || datos.titulo.length > 200 ||
      !datos.autor || datos.autor.length > 160 || !Number.isInteger(datos.copias) || datos.copias < 1) {
    return res.status(400).json({ ok: false, message: 'Código, título, autor y un número entero de ejemplares mayor que cero son obligatorios' });
  }
  try {
    const result = await db.run(`
      INSERT INTO Libros (codigo, titulo, autor, categoria, copias_totales)
      VALUES (?, ?, ?, ?, ?) RETURNING id
    `, datos.codigo, datos.titulo, datos.autor, datos.categoria || null, datos.copias);
    const libro = await db.get('SELECT * FROM Libros WHERE id = ?', result.lastInsertRowid);
    return res.status(201).json({ ok: true, data: libro });
  } catch (error) {
    if (db.isUniqueViolation(error)) {
      return res.status(409).json({ ok: false, message: 'Ya existe un libro con ese código' });
    }
    console.error('Error al registrar libro:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo guardar el libro' });
  }
});

async function actualizarNotificacionesMora() {
  const hoy = fechaLocal();
  const holidays = new Set((await db.all('SELECT fecha FROM Feriados')).map(({ fecha }) => isoDateValue(fecha)));
  const vencidos = await db.all(`
    SELECT p.id, p.fecha_limite, u.correo, u.telefono
    FROM Prestamos p
    JOIN Usuarios u ON u.id = p.usuario_id
    WHERE p.estado = 'Activo' AND p.fecha_limite < ?
  `, hoy);

  for (const prestamo of vencidos) {
    const diasMora = countLateBusinessDays(prestamo.fecha_limite, hoy, holidays);
    if (diasMora === 0) continue;
    const canal = prestamo.correo ? 'correo' : prestamo.telefono ? 'telefono' : 'sin_contacto';
    const destino = canal === 'correo' ? prestamo.correo : canal === 'telefono' ? prestamo.telefono : null;
    const mensaje = `El préstamo ${prestamo.id} venció el ${prestamo.fecha_limite}. Días de mora: ${diasMora}.`;
    await db.run(`
      INSERT INTO Notificaciones (prestamo_id, canal, destino, mensaje, estado)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (prestamo_id) DO NOTHING
    `, prestamo.id, canal, destino, mensaje, destino ? 'Pendiente (demo)' : 'Sin contacto');
  }
}

async function listarPrestamos(req, res) {
  await actualizarNotificacionesMora();
  const holidays = new Set((await db.all('SELECT fecha FROM Feriados')).map(({ fecha }) => isoDateValue(fecha)));
  const data = await db.all(`
    SELECT p.id, p.usuario_id, p.libro_id, p.fecha_prestamo, p.fecha_limite,
      p.fecha_devolucion, p.estado, u.nombre AS usuario, u.carnet, u.correo,
      u.telefono, l.codigo, l.titulo, p.dias_mora
    FROM Prestamos p
    JOIN Usuarios u ON u.id = p.usuario_id
    JOIN Libros l ON l.id = p.libro_id
    ${req.account.role === 'PRESTATARIO' ? 'WHERE p.usuario_id = ?' : ''}
    ORDER BY p.id DESC
  `, ...(req.account.role === 'PRESTATARIO' ? [req.account.reader_id] : []));
  for (const prestamo of data) {
    prestamo.fecha_limite = isoDateValue(prestamo.fecha_limite);
    prestamo.fecha_prestamo = isoDateValue(prestamo.fecha_prestamo);
    if (prestamo.fecha_devolucion) prestamo.fecha_devolucion = isoDateValue(prestamo.fecha_devolucion);
    if (prestamo.estado === 'Activo') {
      prestamo.dias_mora = countLateBusinessDays(prestamo.fecha_limite, fechaLocal(), holidays);
    }
  }
  res.json({ ok: true, total: data.length, data });
}
app.get('/api/prestamos', authenticate, allowRoles(...staffRoles, 'PRESTATARIO'), listarPrestamos);

app.post('/api/prestamos', authenticate, allowRoles(...staffRoles), async (req, res) => {
  const usuarioId = Number(req.body?.usuario_id);
  const libroId = Number(req.body?.libro_id);
  const usuario = await db.get('SELECT id, estado FROM Usuarios WHERE id = ?', usuarioId);
  if (!Number.isInteger(usuarioId) || !usuario || usuario.estado !== 'Activo') {
    return res.status(400).json({ ok: false, message: 'Seleccione un usuario activo válido' });
  }
  if (!Number.isInteger(libroId) || libroId < 1) {
    return res.status(400).json({ ok: false, message: 'Seleccione un libro activo válido' });
  }

  const [configuracion, holidayRows] = await Promise.all([
    db.get('SELECT dias_habiles FROM ConfiguracionPrestamo WHERE id = 1'),
    db.all('SELECT fecha FROM Feriados')
  ]);
  const holidays = new Set(holidayRows.map(({ fecha }) => isoDateValue(fecha)));
  const fechaPrestamo = fechaLocal();
  const fechaLimite = addBusinessDays(fechaPrestamo, Number(configuracion.dias_habiles), holidays);
  const result = await db.transaction(async (tx) => {
    const libro = await tx.get(
      `SELECT id, copias_totales, estado FROM Libros WHERE id = ?${isPostgres ? ' FOR UPDATE' : ''}`,
      libroId
    );
    if (!libro || libro.estado !== 'Activo') return { error: 'invalid-book' };
    const activeLoans = Number((await tx.get(
      "SELECT COUNT(*) AS total FROM Prestamos WHERE libro_id = ? AND estado = 'Activo'",
      libroId
    )).total);
    if (activeLoans >= libro.copias_totales) return { error: 'unavailable' };
    const inserted = await tx.run(`
      INSERT INTO Prestamos (usuario_id, libro_id, fecha_prestamo, fecha_limite, estado)
      VALUES (?, ?, ?, ?, 'Activo') RETURNING id
    `, usuarioId, libroId, fechaPrestamo, fechaLimite);
    return { id: inserted.lastInsertRowid };
  });
  if (result.error === 'invalid-book') {
    return res.status(400).json({ ok: false, message: 'Seleccione un libro activo válido' });
  }
  if (result.error === 'unavailable') {
    return res.status(409).json({ ok: false, message: 'No hay ejemplares disponibles para préstamo' });
  }
  const prestamo = await db.get('SELECT * FROM Prestamos WHERE id = ?', result.id);
  return res.status(201).json({ ok: true, data: prestamo });
});

app.post('/api/prestamos/:id/devolucion', authenticate, allowRoles(...staffRoles), async (req, res) => {
  await actualizarNotificacionesMora();
  const prestamo = await db.get('SELECT * FROM Prestamos WHERE id = ?', Number(req.params.id));
  if (!prestamo) return res.status(404).json({ ok: false, message: 'Préstamo no encontrado' });
  if (prestamo.estado !== 'Activo') return res.status(409).json({ ok: false, message: 'El préstamo ya fue devuelto' });
  const hoy = fechaLocal();
  const holidays = new Set((await db.all('SELECT fecha FROM Feriados')).map(({ fecha }) => isoDateValue(fecha)));
  const diasMora = countLateBusinessDays(prestamo.fecha_limite, hoy, holidays);
  const result = await db.run("UPDATE Prestamos SET estado = 'Devuelto', fecha_devolucion = ?, dias_mora = ? WHERE id = ? AND estado = 'Activo'",
    hoy, diasMora, prestamo.id);
  if (result.changes !== 1) return res.status(409).json({ ok: false, message: 'El estado del préstamo cambió; actualice la lista' });
  return res.json({ ok: true, message: 'Devolución registrada', data: { ...prestamo, estado: 'Devuelto', fecha_devolucion: hoy, dias_mora: diasMora } });
});

app.get('/api/notificaciones', authenticate, allowRoles(...staffRoles), async (req, res) => {
  await actualizarNotificacionesMora();
  const data = await db.all(`
    SELECT n.id, n.prestamo_id, n.canal, n.destino, n.mensaje, n.estado,
      n.creado_en, u.nombre AS usuario, l.titulo, p.fecha_limite
    FROM Notificaciones n
    JOIN Prestamos p ON p.id = n.prestamo_id
    JOIN Usuarios u ON u.id = p.usuario_id
    JOIN Libros l ON l.id = p.libro_id
    ORDER BY n.id DESC
  `);
  res.json({ ok: true, total: data.length, data });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  const HOST = process.env.HOST || '127.0.0.1';
  dbReady.then(() => app.listen(PORT, HOST, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log(`Base de datos: ${db.type}`);
  })).catch((error) => {
    console.error('No se pudo inicializar la base de datos:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, db };
