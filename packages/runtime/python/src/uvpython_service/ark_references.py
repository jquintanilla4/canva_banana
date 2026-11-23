from __future__ import annotations

import json
import re

from uvpython_service.models import AssetInput, MediaInput


def validate_ark_identifier(identifier: object) -> str:
    if not isinstance(identifier, str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,255}", identifier) is None:
        raise ValueError("Ark identifiers must be bare IDs containing letters, numbers, underscores, or hyphens")
    return identifier


def resolve_reference_sources(
    manifest: str | None,
    uploads: dict[str, list[MediaInput]],
) -> dict[str, list[MediaInput | AssetInput]]:
    if manifest is None:
        return {media_type: list(media) for media_type, media in uploads.items()}
    try:
        sources = json.loads(manifest)
    except (ValueError, TypeError) as exc:
        raise ValueError("reference_sources must be a JSON list") from exc
    if not isinstance(sources, list):
        raise ValueError("reference_sources must be a JSON list")
    resolved: dict[str, list[MediaInput | AssetInput]] = {media_type: [] for media_type in uploads}
    mapped_uploads: set[tuple[str, int]] = set()
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("Each reference source must be an object")
        media_type = source.get("mediaType")
        if not isinstance(media_type, str) or media_type not in uploads:
            raise ValueError("Reference source mediaType must be image, video, or audio")
        if source.get("kind") == "upload":
            if set(source) != {"kind", "mediaType", "index"}:
                raise ValueError("Upload references require only kind, mediaType, and index")
            index = source["index"]
            if type(index) is not int or index < 0 or index >= len(uploads[media_type]):
                raise ValueError("Reference upload index is out of range")
            key = (media_type, index)
            if key in mapped_uploads:
                raise ValueError("Each uploaded reference must appear exactly once")
            mapped_uploads.add(key)
            resolved[media_type].append(uploads[media_type][index])
        elif source.get("kind") == "asset":
            if set(source) != {"kind", "mediaType", "assetId"}:
                raise ValueError("Asset references require only kind, mediaType, and assetId")
            resolved[media_type].append(AssetInput(validate_ark_identifier(source["assetId"])))
        else:
            raise ValueError("Reference source kind must be upload or asset")
    if len(mapped_uploads) != sum(len(media) for media in uploads.values()):
        raise ValueError("Each uploaded reference must appear exactly once")
    return resolved
