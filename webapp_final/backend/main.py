from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.cities import router as cities_router
from app.api.upload import router as upload_router
from app.api.baseline import router as baseline_router
from app.api.layers import router as layers_router
from app.api.analytics import router as analytics_router
from app.api.simulation import router as simulation_router
from app.api.surface import router as surface_router

from contextlib import asynccontextmanager
from app.core.config import CITIES_DIR
from app.services.accessibility_surface import warm_accessibility_surface_cache

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Warming accessibility surface cache...")

    try:
        CITIES_DIR.mkdir(parents=True, exist_ok=True)

        for city_folder in CITIES_DIR.iterdir():
            if city_folder.is_dir():
                city_id = city_folder.name
                warm_accessibility_surface_cache(city_id, grid_sizes=[500, 750])

    except Exception as exc:
        print(f"Surface cache warmup failed: {exc}")

    yield

app = FastAPI(title="MorocCare Access API",  lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(cities_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(baseline_router, prefix="/api")
app.include_router(layers_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(simulation_router, prefix="/api")
app.include_router(surface_router, prefix="/api")