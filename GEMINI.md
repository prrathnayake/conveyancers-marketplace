# Conveyancers Marketplace (AU)

## Project Overview

This repository contains a full-stack web application that serves as a marketplace for conveyancers in Australia. The project is a "simulation-focused starter kit" designed for exploring conveyancing workflows. It includes a public-facing marketplace, an admin portal, and a set of demo backend services.

The architecture is based on a microservices approach, with two Next.js applications for the frontend and admin portal, and a set of C++ microservices for the backend. The entire stack is orchestrated using Docker Compose.

**Key Technologies:**

*   **Frontend:** Next.js 14, React, TypeScript
*   **Admin Portal:** Next.js 14, React, TypeScript
*   **Backend (Demo):** C++20, httplib
*   **Database:** PostgreSQL
*   **Infrastructure:** Docker, Docker Compose, Nginx

## Building and Running

The project is designed to be run with Docker Compose.

**Prerequisites:**

*   Docker Desktop 4.24+
*   Node.js 20 LTS
*   npm 10+
*   CMake 3.26+
*   A modern C++20 compiler (Clang 15 or GCC 12)
*   OpenSSL

**Quick Start:**

1.  **Create environment file:**
    ```bash
    cp .env.example .env
    ```
2.  **Map hostnames (macOS/Linux):**
    ```bash
    printf "127.0.0.1 localhost admin.localhost api.localhost\n" | sudo tee -a /etc/hosts
    ```
3.  **Generate TLS certificates:**
    ```bash
    bash infra/tls/dev_certs.sh
    ```
4.  **Build and start the stack:**
    ```bash
    docker compose --env-file .env -f infra/docker-compose.yml up -d --build
    ```

**Accessing the applications:**

*   **Public marketplace:** https://localhost
*   **Admin portal:** https://admin.localhost
*   **Demo gateway:** https://api.localhost

## Development Conventions

### Frontend (Next.js)

The `frontend` and `admin-portal` are both Next.js applications.

*   **Run development server:**
    ```bash
    cd frontend # or admin-portal
    npm install
    npm run dev
    ```
*   **Build for production:**
    ```bash
    npm run build
    ```
*   **Run production server:**
    ```bash
    npm run start
    ```
*   **Run tests:**
    ```bash
    npm run test
    ```

### Backend (C++)

The C++ backend is built with CMake.

*   **Build:**
    ```bash
    cd backend
    cmake -S . -B build
    cmake --build build
    ```
*   **Run tests:**
    ```bash
    ctest --test-dir build
    ```

### Database

The database schema and seed data are managed through SQL files in the `backend/sql` directory. These are automatically applied when the PostgreSQL container starts.

## Key Features and Implementation

### Homepage

*   **File:** `frontend/pages/index.tsx`
*   **Data:** Fetches content from the CMS and database to display dynamic content, including hero content, personas, workflow steps, resources, and FAQs.
*   **Features:** 
    *   Displays marketplace statistics.
    *   Allows users to submit product reviews.

### Search

*   **File:** `frontend/pages/search.tsx`
*   **Data:** Fetches conveyancer profiles from the `/api/profiles/search` endpoint.
*   **Features:** 
    *   Filter conveyancers by name, suburb, keyword, state, "ConveySafe verified", and "remote friendly".
    *   Sort results by relevance, rating, number of reviews, or name.
    *   View results in a grid or table layout.
    *   Initiate a secure chat with a conveyancer.

### Service Catalogue

*   **File:** `frontend/lib/catalogue.ts`
*   **Data:** Manages the service catalogue stored in the `service_catalogue` table.
*   **Features:** 
    *   Lists all services offered by conveyancers.
    *   Provides functions to save and delete service catalogue entries.

## Mentoring

I have familiarized myself with the project structure, key technologies, and core features. I am ready to act as your mentor and help you with the following:

*   **Answering questions:** I can answer your questions about the codebase, architecture, and implementation details.
*   **Explaining concepts:** I can explain the concepts and technologies used in this project.
*   **Providing guidance:** I can provide guidance on how to approach new tasks and challenges.

Feel free to ask me anything about the project. Let's start learning together!