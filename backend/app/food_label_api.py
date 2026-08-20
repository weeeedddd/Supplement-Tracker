"""Explicit, opt-in nutrition-label OCR route."""
from fastapi import APIRouter, File, HTTPException, UploadFile

from .services.vision import MAX_IMAGE_BYTES, scan_nutrition_label

router = APIRouter(prefix="/api/food", tags=["food verification"])


@router.post("/label")
async def food_label(file: UploadFile = File(...)) -> dict:
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "max 8 MB")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(415, "image required")
    return scan_nutrition_label(data)
