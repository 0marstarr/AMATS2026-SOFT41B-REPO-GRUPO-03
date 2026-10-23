# Tarea 1.3 — Controlador/API para insertar usuarios

## Objetivo

Implementar el endpoint que recibe los datos de un nuevo usuario, valida la
información y lo inserta en la tabla `usuarios` de MariaDB con la contraseña
hasheada.

## Historia de usuario

> **Como** administrador del sistema de biblioteca
> **quiero** registrar nuevos usuarios desde el API
> **para** que puedan identificarse y usar los servicios de préstamo.

## Alcance

- Endpoint `POST /api/usuarios.php`.
- Validación de nombre, correo, contraseña y rol.
- Verificación de correo duplicado.
- Almacenamiento seguro de la contraseña con `password_hash`.
- Respuestas JSON con códigos HTTP coherentes.
- Sin interfaz de login todavía: esta tarea solo cubre la inserción.

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
|----|------|--------|----------|
| CA-1.3.1 | Un JSON con nombre, correo, contraseña y rol válidos | Se envía `POST /api/usuarios.php` | Responde `201` con `success: true` y los datos del usuario sin contraseña |
| CA-1.3.2 | Un correo ya registrado | Se intenta crear otro usuario con ese correo | Responde `409` con un mensaje claro |
| CA-1.3.3 | Un correo con formato inválido | Se envía la petición | Responde `422` indicando el campo |
| CA-1.3.4 | Una contraseña de menos de 6 caracteres | Se envía la petición | Responde `422` |
| CA-1.3.5 | Un rol fuera de la lista permitida | Se envía la petición | Responde `422` |
| CA-1.3.6 | El campo `rol` no se envía | Se crea el usuario | Se asigna `estudiante` por defecto |
| CA-1.3.7 | Un usuario creado correctamente | Se consulta la tabla `usuarios` | La contraseña está hasheada, nunca en texto plano |
| CA-1.3.8 | Una petición `GET`, `PUT` o `DELETE` | Se llama al endpoint | Responde `405` con la cabecera `Allow` |
| CA-1.3.9 | Un cuerpo vacío o un JSON mal formado | Se envía la petición | Responde `400` |

## Contrato del endpoint

**Método:** `POST`
**URL:** `/api/usuarios.php`
**Content-Type:** `application/json`

### Campos del cuerpo

| Campo | Tipo | Obligatorio | Reglas |
|-------|------|-------------|--------|
| `nombre` | string | Sí | 3 a 100 caracteres |
| `correo` | string | Sí | Formato de correo válido, único, máximo 150 caracteres |
| `contrasena` | string | Sí | 6 a 72 caracteres |
| `rol` | string | No | `administrador`, `bibliotecario` o `estudiante` (por defecto `estudiante`) |

### Ejemplo de petición

```json
{
  "nombre": "Ana María López",
  "correo": "ana.lopez@itca.edu.sv",
  "contrasena": "Secreta123",
  "rol": "estudiante"
}
```

### Ejemplo de respuesta `201`

```json
{
  "success": true,
  "message": "Usuario registrado correctamente.",
  "usuario": {
    "id": 1,
    "nombre": "Ana María López",
    "correo": "ana.lopez@itca.edu.sv",
    "rol": "estudiante",
    "creado_en": "2026-10-23 10:15:00"
  }
}
```

### Códigos de respuesta

| Código | Situación |
|--------|-----------|
| `201` | Usuario creado |
| `400` | Cuerpo vacío o JSON inválido |
| `405` | Método HTTP no permitido |
| `409` | Correo ya registrado |
| `422` | Datos inválidos |
| `500` | Error de base de datos o interno |

## Seguridad implementada

- Consultas con sentencias preparadas (`PDO::prepare`).
- Contraseña almacenada con `password_hash(..., PASSWORD_DEFAULT)`.
- La contraseña nunca se devuelve en la respuesta.
- Validación del correo con `filter_var(..., FILTER_VALIDATE_EMAIL)`.
- Mensajes de error sin detalles internos de la base de datos.

## Integración con el sprint 2

- El proyecto incluye dos esquemas: `database/schema.sqlite.sql` para el modo
  local y `database/schema.sql` para MariaDB.
- Si el diseño cambia, solo se ajusta `app/UsuarioRepository.php` y el esquema
  correspondiente.
- La conexión se configura con variables de entorno (`DB_DRIVER`,
  `DB_SQLITE_PATH`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`).
- El endpoint no depende del frontend: puede consumirse desde el panel de
  pruebas, Postman o `curl`.

## Evidencias sugeridas

1. Petición exitosa con `201` desde el panel o desde `tests/api.http`.
2. Intento duplicado con `409`.
3. Error de validación con `422`.
4. Consulta SQL que muestre el hash de la contraseña:

```sql
SELECT id, nombre, correo, rol, contrasena FROM usuarios;
```
