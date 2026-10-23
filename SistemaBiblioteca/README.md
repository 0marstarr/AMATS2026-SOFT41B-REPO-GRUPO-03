# Sistema de Biblioteca — API de Usuarios y Libros

Implementación de las tareas **1.3** y **3.4** del proyecto de biblioteca de
ITCA FEPADE Santa Ana. Incluye un API en PHP 8, un panel web de pruebas y dos
motores de base de datos:

- **SQLite** por defecto: funciona de inmediato, sin servidor ni contraseña.
- **MariaDB/MySQL** opcional: listo para integrarse en el sprint 2.

| Tarea | Descripción | Endpoint |
|-------|-------------|----------|
| 1.3 | Insertar nuevos usuarios | `POST /api/usuarios.php` |
| 3.4 | CRUD de libros | `/api/libros.php` |

## Stack

- PHP 8.2 (PDO, `pdo_sqlite`, `pdo_mysql`, `mbstring`)
- SQLite 3 para el modo local
- MariaDB 10.11 / MySQL 8 para el modo servidor
- HTML, CSS y JavaScript sin frameworks
- Servidor de desarrollo integrado de PHP

## Estructura

```
Examen XP/
├─ index.html                    Panel de pruebas
├─ assets/
│  ├─ css/styles.css
│  └─ js/app.js
├─ api/
│  ├─ usuarios.php               Tarea 1.3
│  └─ libros.php                 Tarea 3.4
├─ app/
│  ├─ bootstrap.php              Carga de clases y .env
│  ├─ Database.php               Conexión PDO (SQLite / MySQL)
│  ├─ Response.php               Respuestas JSON y CORS
│  ├─ Validator.php              Validaciones
│  ├─ UsuarioRepository.php
│  └─ LibroRepository.php
├─ config/database.php           Configuración de la conexión
├─ database/
│  ├─ schema.sqlite.sql          Esquema SQLite
│  ├─ seed.sqlite.sql            Datos de ejemplo SQLite
│  ├─ init_sqlite.php            Inicializa SQLite y carga el seed
│  ├─ schema.sql                 Esquema MariaDB (sprint 2)
│  └─ seed.sql                   Datos de ejemplo MariaDB
├─ docs/
│  ├─ tarea-1.3-usuarios.md
│  └─ tarea-3.4-libros.md
└─ tests/api.http                Pruebas con REST Client
```

## Requisitos

Para el modo SQLite (recomendado para verlo ya):

- PHP 8.1 o superior con `pdo_sqlite` y `mbstring`.
- No se necesita instalar ni iniciar ningún servidor de base de datos.

Para el modo MariaDB (sprint 2):

- PHP con `pdo_mysql`.
- MariaDB o MySQL en ejecución.

## Puesta en marcha con SQLite

Desde la raíz del proyecto:

```powershell
php database/init_sqlite.php
php -S localhost:8000
```

Abre <http://localhost:8000> en el navegador.

La base se crea en `database/biblioteca.sqlite` y se carga con tres libros de
ejemplo. El archivo está en `.gitignore`, así que no se sube al repositorio.

También puedes abrir el panel sin ejecutar el inicializador: la primera
conexión crea las tablas automáticamente. El inicializador solo agrega los
datos de ejemplo.

## Puesta en marcha con MariaDB

### 1. Configurar la conexión

Copia `.env.example` como `.env` y descomenta el bloque de MariaDB:

```powershell
Copy-Item .env.example .env
```

El archivo debe quedar así:

```ini
DB_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=biblioteca
DB_USER=root
DB_PASS=tu_contraseña
```

> La instalación local de MariaDB usa el puerto **3307**. Si tu `root` tiene
> contraseña, escríbela en `DB_PASS`. Si usas otro puerto u otro usuario,
> ajusta esos valores.

### 2. Crear la base y las tablas

```powershell
& "C:\Program Files\MariaDB 10.11\bin\mariadb.exe" --default-character-set=utf8mb4 -u root -p -e "source database/schema.sql"
```

Datos de ejemplo opcionales:

```powershell
& "C:\Program Files\MariaDB 10.11\bin\mariadb.exe" --default-character-set=utf8mb4 -u root -p -e "source database/seed.sql"
```

Si `mariadb` está en el `PATH`, puedes usar `mariadb` en lugar de la ruta
completa. En CMD también funciona:

```cmd
"C:\Program Files\MariaDB 10.11\bin\mariadb.exe" --default-character-set=utf8mb4 -u root -p < database\schema.sql
```

### 3. Levantar el servidor

```powershell
php -S localhost:8000
```

## Endpoints

### Usuarios (Tarea 1.3)

| Método | URL | Descripción |
|--------|-----|-------------|
| `POST` | `/api/usuarios.php` | Registrar un usuario |

Campos: `nombre`, `correo`, `contrasena`, `rol` (opcional).

### Libros (Tarea 3.4)

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/libros.php` | Listar libros |
| `GET` | `/api/libros.php?id=1` | Consultar un libro |
| `POST` | `/api/libros.php` | Crear un libro |
| `PUT` | `/api/libros.php?id=1` | Actualizar un libro |
| `DELETE` | `/api/libros.php?id=1` | Eliminar un libro |

Campos: `codigo`, `titulo`, `autor`, `editorial`, `anio`, `ejemplares`,
`disponibles`.

## Ejemplos rápidos

```powershell
$usuario = @{
  nombre     = 'Ana Lopez'
  correo     = 'ana@itca.edu.sv'
  contrasena = 'Secreta123'
  rol        = 'estudiante'
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:8000/api/usuarios.php `
  -Method Post -ContentType 'application/json' -Body $usuario
```

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/libros.php -Method Get
```

```powershell
$libro = @{
  codigo      = 'LIB-010'
  titulo      = 'Refactoring'
  autor       = 'Martin Fowler'
  ejemplares  = 2
  disponibles = 2
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:8000/api/libros.php `
  -Method Post -ContentType 'application/json' -Body $libro
```

Las pruebas completas están en `tests/api.http`.

## Comportamiento esperado

| Situación | Código |
|-----------|--------|
| Recurso creado | `201` |
| Consulta o actualización correcta | `200` |
| JSON inválido o cuerpo vacío | `400` |
| Recurso no encontrado | `404` |
| Método no permitido | `405` |
| Correo o código duplicado | `409` |
| Datos inválidos | `422` |
| Error interno o de base de datos | `500` |

## Pruebas realizadas

- 26 casos automatizados sobre los dos endpoints (creación, consulta,
  actualización, eliminación, duplicados, validaciones y métodos no
  permitidos).
- Verificación del hash bcrypt de la contraseña (60 caracteres, `$2y$10$`).
- Verificación de caracteres UTF-8 (tildes y `ñ`).
- Verificación de CORS y respuestas `OPTIONS 204`.
- Panel probado en escritorio y en pantalla pequeña.

## Notas para el sprint 2

- SQLite se usa para desarrollo/demostración local; MariaDB queda como motor
  oficial para el sprint 2.
- Los controladores no contienen SQL: la separación permite cambiar de motor
  ajustando `app/Database.php` y los esquemas.
- La conexión se configura con variables de entorno (`DB_DRIVER`,
  `DB_SQLITE_PATH`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`).
- Si el sprint 2 cambia las tablas, solo se actualizan los esquemas y los
  repositorios de `app/`.
- La contraseña se almacena con `password_hash`; el login se implementará en
  una tarea posterior.

## Definition of Done

- [x] Endpoint de usuarios con validaciones y hash de contraseña.
- [x] CRUD completo de libros.
- [x] Sentencias preparadas y códigos HTTP coherentes.
- [x] Esquema SQL para SQLite y MariaDB, con datos de ejemplo.
- [x] Panel de pruebas en HTML/CSS/JS.
- [x] Documentación de criterios de aceptación.
- [x] Funcionamiento sin servidor de base de datos (SQLite).
- [ ] Integración con el diseño definitivo del sprint 2.

---

**Grupo 03 · SOFT41B · AMACCS 2026**
