from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analytics import router as analytics_router
from app.api.baseline import router as baseline_router
from app.api.cities import router as cities_router
from app.api.health import router as health_router
from app.api.layers import router as layers_router
from app.api.simulation import router as simulation_router
from app.api.upload import router as upload_router
from app.core.config import get_data_root
from app.services.city_registry import clear_city_bundle_cache, list_city_statuses

logger = logging.getLogger("moroccare")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    clear_city_bundle_cache()
    logger.info("Using data root: %s", get_data_root())
    rows = list_city_statuses()
    logger.info("Ready: %s cities discovered", len(rows))
    yield


app = FastAPI(title="MorocCare Access API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(cities_router)
app.include_router(baseline_router)
app.include_router(layers_router)
app.include_router(simulation_router)
app.include_router(upload_router)
app.include_router(analytics_router)
