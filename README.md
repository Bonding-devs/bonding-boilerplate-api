# Bonding Boilerplate API

[![image](https://camo.githubusercontent.com/2093e1eb4bc9b4f31f6b65facf62aa81bfb0630639ed2607cc1006f2656f1cf7/68747470733a2f2f6e6573746a732e636f6d2f696d672f6c6f676f2d736d616c6c2e737667)](https://nestjs.com/)

## Descripción

`bonding-boilerplate-api` es un boilerplate completo de API REST basado en NestJS, diseñado para ser el punto de partida ideal para proyectos empresariales. Incluye autenticación, autorización, integración con bases de datos, sistema de archivos, internacionalización y mucho más.

[Documentación completa aquí](/docs/readme.md)

## Tabla de Contenidos

- [Descripción](#descripción)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Features](#features)
- [Contribuidores](#contribuidores)

## Requisitos

- Node.js v18 o superior
- NPM v8 o superior
- Docker (opcional, para desarrollo con contenedores)
- PostgreSQL (para desarrollo local sin Docker)

## Instalación

### Desarrollo Cómodo (PostgreSQL + TypeORM)

1. Clona el repositorio:

    ```bash
    git clone --depth 1 https://github.com/Bonding-devs/bonding-boilerplate-api.git mi-proyecto
    ```

2. Ve a la carpeta del proyecto y copia `env-example-relational` como `.env`:

    ```bash
    cd mi-proyecto/
    cp env-example-relational .env
    ```

3. Cambia `DATABASE_HOST=postgres` a `DATABASE_HOST=localhost` en el archivo `.env`.

4. Cambia `MAIL_HOST=maildev` a `MAIL_HOST=localhost` en el archivo `.env`.

5. Ejecuta los contenedores adicionales:

    ```bash
    docker compose up -d postgres adminer maildev
    ```

6. Instala las dependencias:

    ```bash
    npm install
    ```

7. Ejecuta las migraciones:

    ```bash
    npm run migration:run
    ```

8. Ejecuta las semillas:

    ```bash
    npm run seed:run:relational
    ```

9. Inicia la aplicación en modo desarrollo:

    ```bash
    npm run start:dev
    ```

10. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### Ejecución Rápida con Docker

Si deseas una ejecución rápida de la aplicación, puedes usar Docker:

1. Clona el repositorio:

    ```bash
    git clone --depth 1 https://github.com/Bonding-devs/bonding-boilerplate-api.git mi-proyecto
    ```

2. Ve a la carpeta del proyecto:

    ```bash
    cd mi-proyecto/
    ```

3. Copia el archivo de ejemplo:

    ```bash
    cp env-example-relational .env
    ```

4. Levanta todos los servicios:

    ```bash
    docker compose up -d
    ```

## Configuración

El proyecto utiliza variables de entorno para su configuración. Las principales variables incluyen:

- `NODE_ENV`: Entorno de ejecución (development, production)
- `APP_PORT`: Puerto de la aplicación (por defecto 3000)
- `DATABASE_*`: Configuración de la base de datos
- `JWT_*`: Configuración de autenticación JWT
- `MAIL_*`: Configuración del servicio de correo
- `FILE_DRIVER`: Driver para subida de archivos (local, s3, s3-presigned)

## Uso

### Documentación API

Una vez iniciada la aplicación, puedes acceder a:

- **Swagger Documentation**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **API Endpoint**: [http://localhost:3000/api](http://localhost:3000/api)

### Comandos Útiles

```bash
# Desarrollo
npm run start:dev

# Producción
npm run build
npm run start:prod

# Tests
npm run test
npm run test:e2e

# Migraciones
npm run migration:generate
npm run migration:run

# Semillas
npm run seed:run:relational

# Linting
npm run lint
```

## Features

- [x] **Base de datos**: Soporte para TypeORM (PostgreSQL) y Mongoose (MongoDB)
- [x] **Seeders**: Sistema de semillas para datos iniciales
- [x] **Configuración**: Servicio de configuración con @nestjs/config
- [x] **Correos**: Sistema de envío de correos con nodemailer
- [x] **Autenticación**: Registro e inicio de sesión por email y redes sociales (Apple, Facebook, Google)
- [x] **Autorización**: Roles de Administrador y Usuario con sistema de permisos
- [x] **Internacionalización**: Soporte multi-idioma (I18N) con nestjs-i18n
- [x] **Subida de archivos**: Soporte para drivers locales y Amazon S3
- [x] **Documentación**: Swagger/OpenAPI automático
- [x] **Testing**: Tests E2E y unitarios con Jest
- [x] **Docker**: Configuración completa para desarrollo y producción
- [x] **CI/CD**: Integración continua con Github Actions
- [x] **Stripe**: Integración de pagos lista para usar
- [x] **Arquitectura Hexagonal**: Separación clara entre dominio e infraestructura

## Contribuidores

<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/andihaskel"><img src="https://avatars.githubusercontent.com/u/26433170?v=4" width="100px;" alt="Andrés Haskel"/><br /><sub><b>Andrés Haskel</b></sub></a><br /><sub>Desarrollador Backend, DevOps y Administrador del Proyecto</sub></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/gabrielbursztein2"><img src="https://avatars.githubusercontent.com/u/28164421?v=4" width="100px;" alt="Gabriel Bursztein"/><br /><sub><b>Gabriel Bursztein</b></sub></a><br /><sub>Project manager, Backend Admin, Desarrollador y Administrador del Proyecto</sub></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/DOrazi-Julio"><img src="https://avatars.githubusercontent.com/u/91574046?v=4" width="100px;" alt="Julio D'Orazi"/><br /><sub><b>Julio D'Orazi</b></sub></a><br /><sub>Desarrollador Backend</sub></td>
    </tr>
  </tbody>
</table>
