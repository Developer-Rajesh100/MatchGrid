from typing import Literal
from pydantic import BaseModel, Field

UploadCategory = Literal["crests", "photos", "logos", "banners"]


class UploadImageOut(BaseModel):
    url: str
    key: str
    category: UploadCategory
    tournament_id: str
    content_type: str
    size_bytes: int
    width: int
    height: int


class DeleteImageRequest(BaseModel):
    url_or_key: str = Field(min_length=1)


class DeleteImageOut(BaseModel):
    deleted: bool
    key: str
