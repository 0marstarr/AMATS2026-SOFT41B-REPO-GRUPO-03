# Tarea 3.4 — Endpoints CRUD para la tabla Libros

## Objetivo

Implementar los endpoints para listar, consultar, crear, actualizar y eliminar
libros en la tabla `libros`, con validaciones y respuestas JSON consistentes.

## Historia de usuario

> **Como** bibliotecario
> **quiero** administrar el catálogo de libros desde el API
> **para** mantener actualizada la información de ejemplares disponibles.

## Alcance

- `GET /api/libros.php` para listar el catálogo.
- `GET /api/libros.php?id=N` para consultar un libro.
- `POST /api/libros.php` para crear.
- `PUT /api/libros.php?id=N` para actualizar.
- `DELETE /api/libros.php?id=N` para eliminar.
- Validación de campos, código único y disponibilidad coherente.

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
|----|------|--------|----------|
| CA-3.4.1 | Libros registrados | Se envía `GET /api/libros.php` | Responde `200` con `libros` y `total` |
| CA-3.4.2 | Un id existente | Se envía `GET /api/libros.php?id=N` | Responde `200` con el libro |
| CA-3.4.3 | Un id inexistente | Se consulta | Responde `404` |
| CA-3.4.4 | Datos válidos y código único | Se envía `POST` | Responde `201` con el libro creado |
| CA-3.4.5 | Un código ya registrado | Se intenta crear u actualizar | Responde `409` |
| CA-3.4.6 | Faltan campos obligatorios o son inválidos | Se envía la petición | Responde `422` |
| CA-3.4.7 | Un libro existente | Se envía `PUT` con datos válidos | Responde `200` con los datos actualizados |
| CA-3.4.8 | Un libro existente | Se envía `DELETE` | Responde `200` y el libro deja de existir |
| CA-3.4.9 | Un libro inexistente | Se intenta actualizar o eliminar | Responde `404` |
| CA-3.4.10 | `disponibles` mayor que `ejemplares` | Se envía la petición | Responde `422` |
| CA-3.4.11 | Un método no soportado | Se llama al endpoint | Responde `405` con la cabecera `Allow` |

## Endpoints

| Método | URL | Acción | Éxito |
|--------|-----|--------|-------|
| `GET` | `/api/libros.php` | Listar todos | `200` |
| `GET` | `/api/libros.php?id=1` | Consultar uno | `200` |
| `POST` | `/api/libros.php` | Crear | `201` |
| `PUT` | `/api/libros.php?id=1` | Actualizar | `200` |
| `DELETE` | `/api/libros.php?id=1` | Eliminar | `200` |

## Campos del libro

| Campo | Tipo | Obligatorio | Reglas |
|-------|------|-------------|--------|
| `codigo` | string | Sí | 2 a 30 caracteres, único |
| `titulo` | string | Sí | 2 a 200 caracteres |
| `autor` | string | Sí | 2 a 150 caracteres |
| `editorial` | string / null | No | Máximo 150 caracteres |
| `anio` | int / null | No | Entre 1400 y el año actual + 1 |
| `ejemplares` | int | Sí | Mayor o igual a 1 |
| `disponibles` | int | No | Entre 0 y `ejemplares`; si se omite se usa `ejemplares` al crear y el valor actual al actualizar |

## Ejemplos

### Listar

```http
GET /api/libros.php
```

```json
{
  "libros": [
    {
      "id": 1,
      "codigo": "LIB-001",
      "titulo": "Ingeniería de Software: Un Enfoque Práctico",
      "autor": "Roger S. Pressman",
      "editorial": "McGraw-Hill",
      "anio": 2020,
      "ejemplares": 3,
      "disponibles": 3,
      "creado_en": "2026-10-23 10:20:00"
    }
  ],
  "total": 1
}
```

### Crear

```http
POST /api/libros.php
Content-Type: application/json
```

```json
{
  "codigo": "LIB-004",
  "titulo": "Clean Code",
  "autor": "Robert C. Martin",
  "editorial": "Prentice Hall",
  "anio": 2009,
  "ejemplares": 2,
  "disponibles": 2
}
```

### Actualizar

```http
PUT /api/libros.php?id=4
Content-Type: application/json
```

```json
{
  "codigo": "LIB-004",
  "titulo": "Clean Code",
  "autor": "Robert C. Martin",
  "editorial": "Prentice Hall",
  "anio": 2009,
  "ejemplares": 3,
  "disponibles": 2
}
```

### Eliminar

```http
DELETE /api/libros.php?id=4
```

## Códigos de respuesta

| Código | Situación |
|--------|-----------|
| `200` | Consulta, actualización o eliminación correcta |
| `201` | Libro creado |
| `400` | Cuerpo vacío o JSON inválido |
| `404` | Libro no encontrado |
| `405` | Método HTTP no permitido |
| `409` | Código de libro duplicado |
| `422` | Datos inválidos o id incorrecto |
| `500` | Error de base de datos o interno |

## Seguridad implementada

- Todas las consultas usan sentencias preparadas.
- El id se valida como entero positivo.
- Los campos de texto se recortan y se validan por longitud.
- `disponibles` nunca puede superar a `ejemplares` (validación en PHP y
  restricción `CHECK` en la base de datos).

## Integración con el sprint 2

- El proyecto incluye dos esquemas: `database/schema.sqlite.sql` con
  `database/seed.sqlite.sql` para el modo local, y `database/schema.sql` con
  `database/seed.sql` para MariaDB.
- Si cambian las columnas, solo se actualizan `app/LibroRepository.php`, los
  esquemas y las validaciones de `api/libros.php`.
- El panel `index.html` consume estos endpoints y sirve como evidencia visual.

## Evidencias sugeridas

1. Listado con datos en el panel de pruebas.
2. Creación con `201`.
3. Edición con `200`.
4. Eliminación y posterior consulta con `404`.
5. Intento de código duplicado con `409`.
