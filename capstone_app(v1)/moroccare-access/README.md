# MorocCare Access

MorocCare Access is a full-stack planning tool for healthcare accessibility scenarios in Moroccan cities.

## Stack

- Frontend: React 18 + Vite + React-Leaflet + Recharts + React Query + TailwindCSS
- Backend: FastAPI + GeoPandas + Scikit-learn + ReportLab + OpenPyXL
- Infra: Docker Compose (frontend + backend)

## Run with Docker

1. Copy `.env.example` to `.env` (optional).
2. From `moroccare-access/`, run:

```bash
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## City data layout

Data is file-based under `backend/data/cities/<city_id>/`:

- `config.json`
- `healthcare.csv`
- `transport_stops.csv`
- generated artifacts: `model.pkl`, `feature_names.json`, `features.csv`

## Casablanca seed

`backend/data/cities/casablanca/config.json` is pre-seeded with:

- city_id: `casablanca`
- display_name: `Casablanca`
- center_lat: `33.5731`
- center_lon: `-7.5898`
- crs_metric: `EPSG:32629`
- urban_ring_radii_km: `[8, 18, 999]`

Add `healthcare.csv` and `transport_stops.csv` for Casablanca if not already present.

## Startup behavior

On backend startup:

1. Scans all valid city configs in `backend/data/cities`.
2. Auto-trains missing models where CSVs exist and `model.pkl` is missing.
3. Logs: `Ready: {n} cities loaded`.

## API endpoints

- `GET /api/cities`
- `GET /api/cities/{city_id}/baseline`
- `POST /api/cities/{city_id}/simulate`
- `POST /api/cities/upload`
- `GET /api/cities/{city_id}/export?format=pdf|excel`
- `GET /api/cities/{city_id}/summary`
- `GET /api/cities/{city_id}/ranking`
- `POST /api/cities/{city_id}/compare`
- `GET /api/cities/{city_id}/recommendations`
- `GET /api/cities/{city_id}/explainability`
- `POST /api/cities/{city_id}/sensitivity`

## Add a new city

Use the **+ Add city** flow in the sidebar or add files manually:

1. Create `backend/data/cities/<city_id>/config.json`
2. Add `healthcare.csv` and `transport_stops.csv` with required columns
3. Restart backend (or call baseline endpoint) to auto-train model

## Notes

- No database is used.
- State and models are persisted in `backend/data`.
- CORS is configured for `http://localhost:3000`.
- New backend organization includes `services/`, `models/`, and `utils/` modules for analytics, recommendations, explainability, and reusable metrics.
- Baseline/simulation now use an **origin-first** methodology:
  - origins = demand points (from notebook origin metrics when available)
  - facilities = healthcare supply points
  - transport stops = access points
  - district endpoints return district aggregates (or empty if unavailable), never facility points masquerading as districts.
