from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import city_dir, list_city_ids
from routers.cities import ensure_baseline_data
from routers.cities import router as cities_router
from routers.analytics import router as analytics_router
from routers.simulate import router as simulate_router
from routers.upload import router as upload_router
from routers.export import router as export_router
from services.casablanca_simulation import preload_simulation_data

logger = logging.getLogger("moroccare")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    loaded = 0
    try:
        preload_simulation_data()
    except Exception:
        logger.exception("Casablanca simulation preload failed")
    for city_id in list_city_ids():
        try:
            folder = city_dir(city_id)
            model_path = folder / "model.pkl"
            healthcare_path = folder / "healthcare.csv"
            stops_path = folder / "transport_stops.csv"
            if not model_path.exists() and (not healthcare_path.exists() or not stops_path.exists()):
                logger.warning("Skipping '%s': missing healthcare.csv or transport_stops.csv", city_id)
                continue
            ensure_baseline_data(city_id)
            loaded += 1
        except FileNotFoundError:
            continue
        except Exception:
            logger.exception("Skipping '%s': baseline preload failed", city_id)
            continue
    logger.info("Ready: %s cities loaded", loaded)
    yield


app = FastAPI(title="MorocCare Access API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cities_router)
app.include_router(simulate_router)
app.include_router(upload_router)
app.include_router(export_router)
app.include_router(analytics_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/health")
def api_health() -> dict:
    return {"status": "ok"}
