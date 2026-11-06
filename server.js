const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const usuarios = [
  { id: 1, nombre: 'Ana López', carnet: '2024001', correo: 'ana@itca.edu.sv', tipo: 'estudiante_tecnico', estado: 'Activo' },
  { id: 2, nombre: 'Carlos Ruiz', carnet: '2024002', correo: 'carlos@itca.edu.sv', tipo: 'cursos_libres', estado: 'Activo' },
  { id: 3, nombre: 'María Torres', carnet: '2024003', correo: 'maria@itca.edu.sv', tipo: 'personal_administrativo', estado: 'Inactivo' }
];

const libros = [
  { id: 1, codigo: 'B-1001', titulo: 'Metodologías Ágiles', autor: 'José García', copiasDisponibles: 3, copiasTotales: 5 },
  { id: 2, codigo: 'B-1002', titulo: 'Scrum en práctica', autor: 'Luisa Pérez', copiasDisponibles: 2, copiasTotales: 4 },
  { id: 3, codigo: 'B-1003', titulo: 'Gestión de proyectos', autor: 'Roberto Díaz', copiasDisponibles: 1, copiasTotales: 2 }
];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'online',
    service: 'amats2026-soft41b-repo-grupo-03',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/usuarios', (req, res) => {
  res.json({
    ok: true,
    total: usuarios.length,
    data: usuarios
  });
});

app.get('/api/usuarios/:id', (req, res) => {
  const usuario = usuarios.find((item) => item.id === Number(req.params.id));

  if (!usuario) {
    return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
  }

  return res.json({ ok: true, data: usuario });
});

app.get('/api/libros', (req, res) => {
  res.json({
    ok: true,
    total: libros.length,
    data: libros
  });
});

app.post('/api/usuarios', (req, res) => {
  const { nombre, carnet, correo, tipo, estado } = req.body || {};

  if (!nombre || !carnet || !correo) {
    return res.status(400).json({
      ok: false,
      message: 'Debe enviar nombre, carnet y correo'
    });
  }

  const nuevoUsuario = {
    id: usuarios.length ? usuarios[usuarios.length - 1].id + 1 : 1,
    nombre,
    carnet,
    correo,
    tipo: tipo || 'otro',
    estado: estado || 'Activo'
  };

  usuarios.push(nuevoUsuario);

  return res.status(201).json({
    ok: true,
    message: 'Usuario registrado correctamente',
    data: nuevoUsuario
  });
});

app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body || {};

  if (!usuario || !password) {
    return res.status(400).json({ ok: false, message: 'Faltan credenciales' });
  }

  const usuarioValido = usuario === 'usr.ada' && password === 'demo123';

  if (!usuarioValido) {
    return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
  }

  return res.json({
    ok: true,
    message: 'Login válido',
    user: { nombre: 'Ada', usuario: 'usr.ada' }
  });
});

app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path.replace(/^\//, ''));

  if (filePath.includes('..')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }

  return res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
