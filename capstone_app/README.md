# capstone_app

Isolated full-stack capstone web app for healthcare accessibility in Casablanca.

## Structure

- `backend/` FastAPI service
- `frontend/` React + Vite + TypeScript + Tailwind app

## Run locally (without Docker)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend URL: `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## Run with Docker

```bash
docker compose up --build
```

