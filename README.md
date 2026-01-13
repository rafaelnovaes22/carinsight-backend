# CarInsight Backend

Backend API for CarInsight platform, built with NestJS, Prisma, and PostgreSQL.

## Prerequisites

- Node.js (v18+)
- Docker & Docker Compose (Required for Database)

## Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Variables:**
    The `.env` file has been created with default values for local development.

3.  **Start Database:**
    ```bash
    docker-compose up -d
    ```
    *If you don't have Docker installed, you cannot run the database locally.*

4.  **Database Migration:**
    Once DB is running:
    ```bash
    npx prisma migrate dev --name init
    ```

5.  **Run Application:**
    ```bash
    npm run start:dev
    ```

## API Modules

- `/vehicles`: Manage vehicle inventory and search.
- `/users`: User management.
- `/interactions`: Track user interest (saved cars, views).
- `/dealers`: Partner management.

## Project Structure

- `src/prisma`: Database connection module.
- `prisma/schema.prisma`: Database schema definition.
