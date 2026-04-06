from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.data import router as data_router
from app.routes.health import router as health_router
from app.routes.simulation import router as simulation_router

app = FastAPI(
    title="Capstone Healthcare Accessibility API",
    description="FastAPI backend for Casablanca healthcare accessibility dashboard.",
    version="0.1.0",
)

# Enable local frontend integration via Vite dev server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(data_router)
app.include_router(simulation_router)

