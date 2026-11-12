# AMATS2026-SOFT41B-REPO-GRUPO-03

## Demostración local

La aplicación principal se sirve desde [index.html](index.html). La
autenticación, el OPAC, el catálogo, prestatarios, préstamos, devoluciones y
consulta privada se conectan mediante [app-auth.js](app-auth.js) al servidor
Express. En local se usa SQLite; cuando se configura `DATABASE_URL`, se usa
PostgreSQL.
`biblioteca-local.html` se conserva como página heredada y no es la página de
inicio.

Esta versión permite demostrar los roles y flujos localmente, pero todavía no
está lista para datos personales reales: falta revisar la seguridad para el
entorno de ITCA y definir/probar respaldos y restauración. Los avisos de mora
se anotan en una bandeja de demostración; no se envían correos ni mensajes de
texto. No carguen datos reales ni expongan el servidor a una red.

Requisitos: Node.js 22.13 o posterior.

```sh
npm install
npm start
```

Abrir http://127.0.0.1:3000. Por defecto, el servidor escucha solo en la propia
computadora y crea `data/biblioteca.sqlite`; ese directorio se excluye de Git.
Para guardar la base en otra ruta, definir `BIBLIOTECA_DB_PATH`. Las
credenciales se crean en la primera ejecución: no hay contraseñas de
demostración preconfiguradas.

## Despliegue de demostración en Render

1. Cree una base PostgreSQL en Render y un servicio web conectado a este
   repositorio (o despliegue el Blueprint de [render.yaml](render.yaml)).
2. En la configuración del servicio web, agregue `DATABASE_URL` como variable
   de entorno privada. Use la URL interna/privada de la base si ambos servicios
   están en Render. No la escriba en el repositorio ni la comparta por chat.
3. Espere a que el despliegue termine y abra la URL del servicio. La primera
   persona que abra el sistema debe configurar inmediatamente la cuenta
   `SUPERADMIN`; esa cuenta podrá crear a la bibliotecaria.
4. Compruebe `https://<dominio-del-servicio>/api/health`: debe devolver
   `"storage":"postgres"`.

El esquema PostgreSQL se crea automáticamente al arrancar; no es necesario
importar ni copiar el archivo SQLite local. Los datos locales actuales y los
datos PostgreSQL son independientes. En la demo compartida, los tres integrantes
deben usar el mismo enlace, no crear despliegues separados.

Render puede suspender servicios del plan gratuito y los servicios gratuitos
de PostgreSQL pueden tener límites de disponibilidad/retención. Verifique las
condiciones vigentes de su cuenta y no use datos personales reales. Configure
respaldos antes de cualquier uso institucional.

## Autenticación y permisos

Cuando no existen cuentas, la pantalla permite configurar una única cuenta
`SUPERADMIN`. Las contraseñas se almacenan con scrypt y sal aleatoria; las
sesiones del servidor se guardan como hashes y se envían en cookies
`HttpOnly`, `SameSite=Lax` con expiración. El superadmin crea bibliotecarias y
es el único rol con acceso a Registro institucional.

En Préstamos, la bibliotecaria busca al prestatario por carnet en el registro
local. Si no existe, puede registrarlo en ese mismo flujo y continuar con el
préstamo. La búsqueda no consulta la base institucional del ITCA. Crear una
cuenta de prestatario para consultar sus propios préstamos y mora es opcional.
Visitantes solo consultan libros disponibles. Bibliotecarias y superadmin
administran el catálogo, préstamos y devoluciones. Prestatarios solo consultan
el catálogo público y sus propios préstamos/mora; no pueden escribir datos.

Los tipos de lector permitidos son `estudiante_tecnico`, `cursos_libres`,
`personal_administrativo` y `otro`; carnet/código, correo y teléfono son
opcionales, y los correos proporcionados deben terminar en `@itca.edu.sv`.

Cada préstamo vence 7 días calendario después de registrarlo. La mora inicia
al día siguiente de la fecha límite, sin multa monetaria. Los avisos son solo
registros locales de demostración; no hay envío de correo, SMS u otras
notificaciones externas.

El catálogo que muestra la demo es independiente del OPAC institucional. El
enlace oficial confirmado es
<https://biblioteca.itca.edu.sv/biblioteca/opac/>; la página de acceso público
solicita un carnet. La demo lo abre en otra pestaña, pero no sincroniza
inventario ni préstamos. No se identificó una API documentada; una integración
de datos requeriría confirmación y autorización de ITCA.

La base de datos SQLite local se crea automáticamente al arrancar. Para
respaldarla, detengan el servidor y copien el archivo. En Render, los respaldos
deben configurarse para el servicio PostgreSQL.

## Pendiente antes de producción

- La pantalla de auditoría no está disponible en la API actual y muestra un
  aviso en vez de datos ficticios. El cambio de contraseña y los parámetros
  administrativos requieren endpoints antes de habilitarse.
- Consultar a ITCA si hay una API autorizada para sincronizar el OPAC; el enlace
  externo ya está disponible para consultas manuales.
- Definir respaldos, restauración, retención y administración de la base con
  ITCA-FEPADE.
- Revisión de seguridad y piloto con datos ficticios antes de cargar información
  personal.