from fastapi import HTTPException


class CityNotFoundError(Exception):
    pass


class InvalidDatasetError(Exception):
    pass


def not_found(city_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"City '{city_id}' not found")
