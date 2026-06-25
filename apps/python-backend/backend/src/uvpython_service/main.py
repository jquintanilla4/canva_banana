from __future__ import annotations

import asyncio
import http.client
import os
import socket
import tempfile
from ipaddress import ip_address
from pathlib import Path
from typing import Any, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

from fastapi import FastAPI, File, Form, HTTPException, Request as FastAPIRequest, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from uvpython_service.config import get_settings
from uvpython_service.jimeng_worker import JIMENG_MODEL_ID, check_jimeng_health, clear_jimeng_cache, create_jimeng_job, get_jimeng_setup_status, install_or_update_jimeng_cli, jimeng_job_store, serialize_jimeng_job, start_jimeng_login
from uvpython_service.media import get_ffprobe_status, probe_media_duration_seconds
from uvpython_service.models import JobState
from uvpython_service.models import DEFAULT_MODEL_ID, MediaInput, SeedanceJobPayload
from uvpython_service.store import job_store
from uvpython_service.worker import create_job, serialize_job

app = FastAPI(title="Canva Banana UV Python Service")  # Local dev API surface.
JIMENG_VIDEO_MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}  # Preserve local CLI output MIME types so the frontend video loader accepts them.
LOCAL_ACTION_HEADER_NAME = "x-canva-banana-local-action"  # Browser setup calls must opt in with a non-simple header.
DESKTOP_AUTH_TOKEN_HEADER_NAME = "x-canva-banana-desktop-token"  # Desktop requests carry the per-launch nonce here.
DESKTOP_AUTH_TOKEN_ENV_NAME = "CANVA_BANANA_DESKTOP_AUTH_TOKEN"  # Electron injects this into managed local services.
JIMENG_LOCAL_ACTION_HEADER_VALUE = "jimeng-setup"  # Shared marker for Jimeng setup mutations.
VOLCENGINE_LOCAL_ACTION_HEADER_VALUE = "volcengine-submit"  # Shared marker for Volcengine generation submits.
TRUSTED_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}  # Only same-machine frontends may trigger setup actions.
TRUSTED_DESKTOP_ORIGINS = {"null"}  # Packaged file:// Electron requests commonly send Origin: null.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Keep local frontend iteration simple.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req: Request, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None  # Keep urllib from following provider redirects before the target URL is validated.


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, pinned_ip: str, **kwargs: Any) -> None:
        super().__init__(host, **kwargs)
        self._pinned_ip = pinned_ip  # Connect to the already-validated DNS result.

    def connect(self) -> None:
        self.sock = self._create_connection((self._pinned_ip, self.port), self.timeout, self.source_address)
        if self._tunnel_host:
            self._tunnel()  # Preserve standard proxy-tunnel behavior if it is ever configured.


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, pinned_ip: str, **kwargs: Any) -> None:
        super().__init__(host, **kwargs)
        self._pinned_ip = pinned_ip  # Keep SNI/certificate validation on host while dialing the checked IP.

    def connect(self) -> None:
        sock = self._create_connection((self._pinned_ip, self.port), self.timeout, self.source_address)
        if self._tunnel_host:
            self.sock = sock
            self._tunnel()
            sock = self.sock
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def _is_trusted_local_origin(origin: str) -> bool:
    if origin in TRUSTED_DESKTOP_ORIGINS:
        return True  # The caller TCP peer and action header are checked before this origin is trusted.
    parsed_origin = urlparse(origin)
    if parsed_origin.scheme == "file" and not parsed_origin.hostname:
        return True  # Some desktop runtimes expose a file:// origin instead of null.
    return parsed_origin.scheme in {"http", "https"} and (parsed_origin.hostname or "") in TRUSTED_LOCAL_HOSTS  # Keep browser setup calls local-only.


def _is_desktop_origin(origin: str) -> bool:
    if origin in TRUSTED_DESKTOP_ORIGINS:
        return True  # Chromium file renderers commonly send Origin: null.
    parsed_origin = urlparse(origin)
    return parsed_origin.scheme == "file" and not parsed_origin.hostname  # Some desktop runtimes expose file://.


def _has_valid_desktop_auth_token(request: FastAPIRequest) -> bool:
    expected_token = os.environ.get(DESKTOP_AUTH_TOKEN_ENV_NAME, "").strip()
    if not expected_token:
        return False  # Desktop origins must have an Electron-provided nonce.
    return request.headers.get(DESKTOP_AUTH_TOKEN_HEADER_NAME, "").strip() == expected_token  # Compare the header token only.


def _is_trusted_local_client(host: str | None) -> bool:
    if host is None:
        return False
    if host == "localhost":
        return True
    try:
        client_ip = ip_address(host)
    except ValueError:
        return False
    if client_ip.version == 6 and client_ip.ipv4_mapped is not None:
        return client_ip.ipv4_mapped.is_loopback  # Treat ::ffff:127.0.0.1 as same-machine loopback.
    return client_ip.is_loopback  # Require the real TCP peer to be on the same machine.


def _require_trusted_local_action(request: FastAPIRequest, expected_action: str) -> None:
    if not _is_trusted_local_client(request.client.host if request.client else None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local action requires a local client")

    action_header = request.headers.get(LOCAL_ACTION_HEADER_NAME)
    if action_header != expected_action:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local action requires a trusted action header")

    origin = request.headers.get("origin")
    if origin is not None and not _is_trusted_local_origin(origin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local action requires a trusted local origin")
    if origin is not None and _is_desktop_origin(origin) and not _has_valid_desktop_auth_token(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local action requires desktop authorization")


def _require_trusted_setup_request(request: FastAPIRequest) -> None:
    _require_trusted_local_action(request, JIMENG_LOCAL_ACTION_HEADER_VALUE)  # Setup routes use the Jimeng-specific marker.


def _require_trusted_volcengine_submit_request(request: FastAPIRequest) -> None:
    _require_trusted_local_action(request, VOLCENGINE_LOCAL_ACTION_HEADER_VALUE)  # Volcengine submits can spend user API credits.


def _resolve_public_remote_ip(hostname: str) -> str | None:
    try:
        address_infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return None
    public_ips: list[str] = []
    for address_info in address_infos:
        resolved_host = address_info[4][0]
        try:
            resolved_ip = ip_address(resolved_host)
        except ValueError:
            return None
        if resolved_ip.version == 6 and resolved_ip.ipv4_mapped is not None:
            resolved_ip = resolved_ip.ipv4_mapped  # Apply IPv4 checks to mapped local/private addresses.
        if resolved_ip.is_loopback or resolved_ip.is_private or resolved_ip.is_link_local or resolved_ip.is_multicast or resolved_ip.is_reserved:
            return None
        public_ips.append(str(resolved_ip))
    return public_ips[0] if public_ips else None  # Pin the fetch to a public address from this validation pass.


def _require_safe_jimeng_remote_url(remote_url: str) -> str:
    parsed_url = urlparse(remote_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.hostname:
        raise HTTPException(status_code=403, detail="Jimeng remote output URL is not allowed")
    if parsed_url.username or parsed_url.password:
        raise HTTPException(status_code=403, detail="Jimeng remote output URL must not include credentials")
    if Path(parsed_url.path).suffix.lower() not in JIMENG_VIDEO_MEDIA_TYPES:
        raise HTTPException(status_code=403, detail="Jimeng remote output URL must point to a video asset")
    resolved_ip = _resolve_public_remote_ip(parsed_url.hostname)
    if not resolved_ip:
        raise HTTPException(status_code=403, detail="Jimeng remote output URL must resolve to a public host")
    return resolved_ip  # Callers must use the pinned address instead of resolving again.


async def _read_upload(
    upload: UploadFile | None,
    *,
    should_probe_duration: bool = False,
    media_label: str = "upload",
) -> MediaInput | None:
    if upload is None:
        return None
    suffix = Path(upload.filename or "upload.bin").suffix  # Preserve original extensions when possible.
    size_bytes = 0
    tmp_path: Path | None = None
    try:
        await upload.seek(0)  # Always stage from the beginning of the uploaded stream.
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_path = Path(tmp_file.name)  # Store uploads on disk so requests do not hold them in memory.
            while chunk := await upload.read(1024 * 1024):
                tmp_file.write(chunk)
                size_bytes += len(chunk)
        if size_bytes == 0:
            if tmp_path:
                tmp_path.unlink(missing_ok=True)
            return None
        ffprobe_status = get_ffprobe_status() if should_probe_duration else None
        duration_seconds = probe_media_duration_seconds(tmp_path) if should_probe_duration else None  # Only audio and video references need duration metadata.
        duration_probe_skipped = bool(should_probe_duration and ffprobe_status is not None and not ffprobe_status.available)
        if should_probe_duration and not duration_probe_skipped and duration_seconds is None:
            raise ValueError(f"Could not read {media_label} duration from {upload.filename or 'upload.bin'}")
        return MediaInput(
            file_name=upload.filename or "upload.bin",
            content_type=(upload.content_type or "").strip(),
            temp_path=tmp_path,
            size_bytes=size_bytes,
            duration_seconds=duration_seconds,
            duration_probe_skipped=duration_probe_skipped,
        )
    except Exception:
        if tmp_path:
            tmp_path.unlink(missing_ok=True)  # Avoid leaving partial temp files behind on failed uploads.
        raise
    finally:
        await upload.close()  # Release FastAPI's upload handle as soon as the file is staged.


async def _read_uploads(
    uploads: list[UploadFile] | None,
    *,
    should_probe_duration: bool = False,
    media_label: str = "upload",
) -> list[MediaInput]:
    media_items: list[MediaInput] = []
    for upload in uploads or []:
        media = await _read_upload(upload, should_probe_duration=should_probe_duration, media_label=media_label)
        if media is not None:
            media_items.append(media)
    return media_items  # Keep staged uploads explicit so failures can clean them up deterministically.


def _cleanup_media_items(media_items: list[MediaInput]) -> None:
    for media in media_items:
        media.cleanup()  # Best-effort cleanup is enough because temp file removal is idempotent.


def _build_job_response(request: FastAPIRequest, job: JobState) -> dict[str, object]:
    output_proxy_url = (
        str(request.url_for("download_seedance_job_output", job_id=job.id))
        if job.output_url
        else None
    )  # Hand the frontend a same-backend URL so browser fetches avoid provider CORS blocks.
    last_frame_proxy_url = (
        str(request.url_for("download_seedance_job_last_frame", job_id=job.id))
        if job.last_frame_url
        else None
    )  # Keep last-frame downloads on the same transport path as videos.
    return serialize_job(
        job,
        output_url=output_proxy_url,
        last_frame_url=last_frame_proxy_url,
    )  # Preserve the raw provider URLs separately for debugging.


def _build_job_response_from_url(base_url: str, job: JobState) -> dict[str, object]:
    http_base_url = base_url.replace("ws://", "http://", 1).replace("wss://", "https://", 1)  # WebSocket requests should still hand back HTTP proxy asset URLs.
    output_proxy_url = (
        f"{http_base_url.rstrip('/')}/api/volcengine/jobs/{job.id}/output"
        if job.output_url
        else None
    )  # WebSocket clients still need the same proxied asset paths as REST clients.
    last_frame_proxy_url = (
        f"{http_base_url.rstrip('/')}/api/volcengine/jobs/{job.id}/last-frame"
        if job.last_frame_url
        else None
    )  # Reuse the REST path layout so frontend URL normalization stays unchanged.
    return serialize_job(
        job,
        output_url=output_proxy_url,
        last_frame_url=last_frame_proxy_url,
    )  # Keep WebSocket payloads aligned with the REST serializer.


def _build_jimeng_job_response(request: FastAPIRequest, job: JobState) -> dict[str, object]:
    output_proxy_url = (
        str(request.url_for("download_jimeng_job_output", job_id=job.id))
        if job.output_url
        else None
    )  # Always hand the browser a backend URL for local files and remote provider assets.
    return serialize_jimeng_job(job, output_url=output_proxy_url)


def _build_jimeng_job_response_from_url(base_url: str, job: JobState) -> dict[str, object]:
    http_base_url = base_url.replace("ws://", "http://", 1).replace("wss://", "https://", 1)  # WebSocket callers still need HTTP asset URLs.
    output_proxy_url = (
        f"{http_base_url.rstrip('/')}/api/jimeng/jobs/{job.id}/output"
        if job.output_url
        else None
    )  # Keep Jimeng asset URLs aligned with the REST path layout.
    return serialize_jimeng_job(job, output_url=output_proxy_url)


def _stream_remote_asset(remote_url: str, *, allow_redirects: bool = True) -> StreamingResponse:
    try:
        request = Request(
            remote_url,
            headers={
                "Accept": "*/*",
                "User-Agent": "Canva Banana UV Python Service/0.1",
            },
        )  # Share the same request headers whether redirects are allowed or rejected.
        upstream_response = (
            urlopen(request, timeout=60)
            if allow_redirects
            else build_opener(_NoRedirectHandler).open(request, timeout=60)
        )  # Server-side downloads bypass the provider bucket's missing browser CORS headers.
    except HTTPError as exc:
        if not allow_redirects and 300 <= exc.code < 400:
            raise HTTPException(status_code=403, detail="Jimeng remote output URL redirects are not allowed") from exc
        raise HTTPException(status_code=502, detail=f"Volcengine asset download failed with HTTP {exc.code}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Volcengine asset download failed: {exc.reason}") from exc

    media_type = upstream_response.headers.get_content_type() or "application/octet-stream"  # Reuse the provider mime when available.
    response_headers: dict[str, str] = {}
    for header_name in ("Content-Disposition", "Content-Length", "ETag", "Last-Modified"):
        header_value = upstream_response.headers.get(header_name)
        if header_value:
            response_headers[header_name] = header_value  # Mirror useful file metadata for direct opens and downloads.

    def iter_content() -> Iterator[bytes]:
        try:
            while True:
                chunk = upstream_response.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            upstream_response.close()  # Release the upstream connection even if the client disconnects.

    return StreamingResponse(iter_content(), media_type=media_type, headers=response_headers)


def _open_pinned_remote_asset(remote_url: str, pinned_ip: str) -> http.client.HTTPResponse:
    parsed_url = urlparse(remote_url)
    assert parsed_url.hostname is not None  # _require_safe_jimeng_remote_url validates host before this call.
    connection_class = _PinnedHTTPSConnection if parsed_url.scheme == "https" else _PinnedHTTPConnection
    connection = connection_class(parsed_url.hostname, pinned_ip, port=parsed_url.port, timeout=60)
    path = parsed_url.path or "/"
    if parsed_url.query:
        path = f"{path}?{parsed_url.query}"
    try:
        connection.request(
            "GET",
            path,
            headers={
                "Accept": "*/*",
                "Host": parsed_url.netloc,
                "User-Agent": "Canva Banana UV Python Service/0.1",
            },
        )  # Fetch through the checked IP while preserving the original virtual host.
        response = connection.getresponse()
    except OSError as exc:
        connection.close()
        raise HTTPException(status_code=502, detail=f"Jimeng asset download failed: {exc}") from exc
    if 300 <= response.status < 400:
        response.close()
        connection.close()
        raise HTTPException(status_code=403, detail="Jimeng remote output URL redirects are not allowed")
    if response.status >= 400:
        status_code = response.status
        response.close()
        connection.close()
        raise HTTPException(status_code=502, detail=f"Jimeng asset download failed with HTTP {status_code}")
    return response  # StreamingResponse closes the HTTPResponse after iterating.


def _stream_pinned_jimeng_remote_asset(remote_url: str, pinned_ip: str) -> StreamingResponse:
    upstream_response = _open_pinned_remote_asset(remote_url, pinned_ip)
    media_type = upstream_response.headers.get_content_type() or "application/octet-stream"  # Reuse the provider mime when available.
    response_headers: dict[str, str] = {}
    for header_name in ("Content-Disposition", "Content-Length", "ETag", "Last-Modified"):
        header_value = upstream_response.headers.get(header_name)
        if header_value:
            response_headers[header_name] = header_value  # Mirror useful file metadata for direct opens and downloads.

    def iter_content() -> Iterator[bytes]:
        try:
            while True:
                chunk = upstream_response.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            upstream_response.close()  # Release the pinned upstream connection even if the client disconnects.

    return StreamingResponse(iter_content(), media_type=media_type, headers=response_headers)


def _stream_jimeng_asset(output_url: str) -> StreamingResponse | FileResponse:
    if output_url.startswith(("http://", "https://")):
        pinned_ip = _require_safe_jimeng_remote_url(output_url)
        return _stream_pinned_jimeng_remote_asset(output_url, pinned_ip)  # Avoid a second DNS lookup after host validation.
    output_path = Path(output_url).expanduser()
    if not output_path.exists() or not output_path.is_file():
        raise HTTPException(status_code=404, detail="Jimeng output file is not available")
    resolved_output_path = output_path.resolve()
    resolved_work_dir = get_settings().jimeng_work_dir.resolve()
    try:
        resolved_output_path.relative_to(resolved_work_dir)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Jimeng output file is outside the configured work directory") from exc
    media_type = JIMENG_VIDEO_MEDIA_TYPES.get(output_path.suffix.lower(), "application/octet-stream")
    return FileResponse(resolved_output_path, media_type=media_type, filename=resolved_output_path.name)  # Local downloads stream from the backend work dir.


@app.get("/health")
def healthcheck() -> dict[str, object]:
    ffprobe_status = get_ffprobe_status()
    return {
        "status": "ok",
        "ffprobeAvailable": ffprobe_status.available,
        "ffprobeSource": ffprobe_status.source,
        "ffprobePath": ffprobe_status.path,
        "ffprobeWarning": ffprobe_status.warning,
    }  # Surface backend media-probe readiness without failing the whole health check.


@app.get("/api/jimeng/health")
def jimeng_healthcheck(request: FastAPIRequest) -> dict[str, object]:
    _require_trusted_setup_request(request)
    try:
        return check_jimeng_health()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/jimeng/setup/status")
def jimeng_setup_status(request: FastAPIRequest) -> dict[str, object]:
    _require_trusted_setup_request(request)
    return get_jimeng_setup_status()


@app.post("/api/jimeng/setup/install")
def install_jimeng_cli_endpoint(request: FastAPIRequest) -> dict[str, object]:
    _require_trusted_setup_request(request)
    try:
        return install_or_update_jimeng_cli()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/jimeng/setup/login")
def start_jimeng_login_endpoint(request: FastAPIRequest, debug: bool = False) -> dict[str, object]:
    _require_trusted_setup_request(request)
    try:
        return start_jimeng_login(debug=debug)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/api/jimeng/cache")
def clear_jimeng_cache_endpoint(request: FastAPIRequest) -> dict[str, object]:
    _require_trusted_setup_request(request)
    try:
        return clear_jimeng_cache()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/volcengine/jobs")
async def submit_seedance_job(
    request: FastAPIRequest,
    prompt: str = Form(...),
    model_id: str = Form(DEFAULT_MODEL_ID),
    variant: str = Form("smart"),
    ratio: str = Form("16:9"),
    duration: int = Form(5),
    resolution: str | None = Form(None),
    generate_audio: bool = Form(False),
    camera_fixed: bool = Form(False),
    primary_image: UploadFile | None = File(None),
    last_frame_image: UploadFile | None = File(None),
    reference_images: list[UploadFile] | None = File(None),
    reference_videos: list[UploadFile] | None = File(None),
    reference_audios: list[UploadFile] | None = File(None),
) -> dict[str, object]:
    _require_trusted_volcengine_submit_request(request)
    payload: SeedanceJobPayload | None = None
    staged_media: list[MediaInput] = []
    try:
        primary_image_media = await _read_upload(primary_image)
        if primary_image_media is not None:
            staged_media.append(primary_image_media)

        last_frame_image_media = await _read_upload(last_frame_image)
        if last_frame_image_media is not None:
            staged_media.append(last_frame_image_media)

        reference_image_media = await _read_uploads(reference_images)
        staged_media.extend(reference_image_media)

        reference_video_media = await _read_uploads(reference_videos, should_probe_duration=True, media_label="reference video")
        staged_media.extend(reference_video_media)

        reference_audio_media = await _read_uploads(reference_audios, should_probe_duration=True, media_label="reference audio")
        staged_media.extend(reference_audio_media)

        payload = SeedanceJobPayload(
            prompt=prompt,
            model_id=model_id,
            variant=variant if variant in {"smart", "reference"} else "smart",
            ratio=ratio if ratio in {"21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"} else "16:9",
            duration=duration,
            resolution=resolution if resolution in {"480p", "720p", "1080p"} else None,
            generate_audio=generate_audio,
            camera_fixed=camera_fixed,
            primary_image=primary_image_media,
            last_frame_image=last_frame_image_media,
            reference_images=reference_image_media,
            reference_videos=reference_video_media,
            reference_audios=reference_audio_media,
        )
        job = create_job(payload)
        payload = None  # The worker now owns the staged media lifecycle.
        return _build_job_response(request, job)
    except ValueError as exc:
        if payload is not None:
            payload.cleanup()  # Discard staged files for rejected jobs.
        else:
            _cleanup_media_items(staged_media)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        if payload is not None:
            payload.cleanup()  # Clean up staged files on unexpected submission failures.
        else:
            _cleanup_media_items(staged_media)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/jimeng/jobs")
async def submit_jimeng_job(
    request: FastAPIRequest,
    prompt: str = Form(...),
    model_id: str = Form(JIMENG_MODEL_ID),
    variant: str = Form("smart"),
    model_version: str = Form("seedance2.0fast"),
    ratio: str = Form("16:9"),
    duration: int = Form(5),
    resolution: str | None = Form(None),
    generate_audio: bool = Form(False),
    camera_fixed: bool = Form(False),
    primary_image: UploadFile | None = File(None),
    last_frame_image: UploadFile | None = File(None),
    reference_images: list[UploadFile] | None = File(None),
    reference_videos: list[UploadFile] | None = File(None),
    reference_audios: list[UploadFile] | None = File(None),
) -> dict[str, object]:
    _require_trusted_setup_request(request)
    payload: SeedanceJobPayload | None = None
    staged_media: list[MediaInput] = []
    try:
        primary_image_media = await _read_upload(primary_image)
        if primary_image_media is not None:
            staged_media.append(primary_image_media)

        last_frame_image_media = await _read_upload(last_frame_image)
        if last_frame_image_media is not None:
            staged_media.append(last_frame_image_media)

        reference_image_media = await _read_uploads(reference_images)
        staged_media.extend(reference_image_media)

        reference_video_media = await _read_uploads(reference_videos, should_probe_duration=True, media_label="reference video")
        staged_media.extend(reference_video_media)

        reference_audio_media = await _read_uploads(reference_audios, should_probe_duration=True, media_label="reference audio")
        staged_media.extend(reference_audio_media)

        payload = SeedanceJobPayload(
            prompt=prompt,
            model_id=model_id,
            variant=variant if variant in {"smart", "reference"} else "smart",
            ratio=ratio if ratio in {"21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"} else "16:9",
            duration=duration,
            resolution=resolution if resolution in {"480p", "720p", "1080p"} else None,
            jimeng_model_version=model_version if model_version in {"seedance2.0fast", "seedance2.0", "seedance2.0_vip", "seedance2.0fast_vip"} else "seedance2.0fast",
            generate_audio=generate_audio,
            camera_fixed=camera_fixed,
            primary_image=primary_image_media,
            last_frame_image=last_frame_image_media,
            reference_images=reference_image_media,
            reference_videos=reference_video_media,
            reference_audios=reference_audio_media,
        )
        job = create_jimeng_job(payload)
        payload = None  # The Jimeng worker now owns the staged upload lifecycle.
        return _build_jimeng_job_response(request, job)
    except ValueError as exc:
        if payload is not None:
            payload.cleanup()  # Discard staged files for rejected jobs.
        else:
            _cleanup_media_items(staged_media)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        if payload is not None:
            payload.cleanup()  # Clean up staged files on unexpected submission failures.
        else:
            _cleanup_media_items(staged_media)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/volcengine/jobs/{job_id}")
def get_seedance_job(job_id: str, request: FastAPIRequest) -> dict[str, object]:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _build_job_response(request, job)


@app.get("/api/jimeng/jobs/{job_id}")
def get_jimeng_job(job_id: str, request: FastAPIRequest) -> dict[str, object]:
    job = jimeng_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _build_jimeng_job_response(request, job)


@app.websocket("/api/volcengine/jobs/{job_id}/ws")
async def stream_seedance_job(job_id: str, websocket: WebSocket) -> None:
    await websocket.accept()  # Accept first so the client receives an explicit close code on missing jobs.
    job_queue: asyncio.Queue[JobState] = asyncio.Queue()  # Queue job snapshots as the worker mutates them.
    event_loop = asyncio.get_running_loop()
    websocket_base_url = str(websocket.base_url).rstrip("/")  # Build proxy asset URLs from the active request host.
    closed = False

    def handle_job_update(job: JobState) -> None:
        if closed:
            return
        try:
            event_loop.call_soon_threadsafe(job_queue.put_nowait, job)
        except RuntimeError:
            return  # Ignore late worker notifications after the request loop is gone.

    subscription = job_store.subscribe(job_id, handle_job_update)
    if subscription is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Job not found")
        return

    current_job, unsubscribe = subscription

    try:
        await websocket.send_json(_build_job_response_from_url(websocket_base_url, current_job))
        if current_job.status in job_store.TERMINAL_STATUSES:
            await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)  # Close immediately after the terminal snapshot is delivered.
            return

        while True:
            next_job = await job_queue.get()
            await websocket.send_json(_build_job_response_from_url(websocket_base_url, next_job))
            if next_job.status in job_store.TERMINAL_STATUSES:
                await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)  # Deliver the final state before the socket shuts down.
                return
    except WebSocketDisconnect:
        return
    finally:
        closed = True
        unsubscribe()  # Remove the per-job listener when the client disconnects.


@app.websocket("/api/jimeng/jobs/{job_id}/ws")
async def stream_jimeng_job(job_id: str, websocket: WebSocket) -> None:
    await websocket.accept()  # Accept first so missing jobs close with a clear policy code.
    job_queue: asyncio.Queue[JobState] = asyncio.Queue()  # Queue job snapshots as the worker mutates them.
    event_loop = asyncio.get_running_loop()
    websocket_base_url = str(websocket.base_url).rstrip("/")  # Build proxy asset URLs from the active request host.
    closed = False

    def handle_job_update(job: JobState) -> None:
        if closed:
            return
        try:
            event_loop.call_soon_threadsafe(job_queue.put_nowait, job)
        except RuntimeError:
            return  # Ignore late worker notifications after the request loop is gone.

    subscription = jimeng_job_store.subscribe(job_id, handle_job_update)
    if subscription is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Job not found")
        return

    current_job, unsubscribe = subscription

    try:
        await websocket.send_json(_build_jimeng_job_response_from_url(websocket_base_url, current_job))
        if current_job.status in jimeng_job_store.TERMINAL_STATUSES:
            await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)  # Deliver the terminal snapshot before closing.
            return

        while True:
            next_job = await job_queue.get()
            await websocket.send_json(_build_jimeng_job_response_from_url(websocket_base_url, next_job))
            if next_job.status in jimeng_job_store.TERMINAL_STATUSES:
                await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)  # Deliver the final state before shutdown.
                return
    except WebSocketDisconnect:
        return
    finally:
        closed = True
        unsubscribe()  # Remove the per-job listener when the client disconnects.


@app.get("/api/volcengine/jobs/{job_id}/output", name="download_seedance_job_output")
def download_seedance_job_output(job_id: str) -> StreamingResponse:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.output_url:
        raise HTTPException(status_code=404, detail="Job output is not available")
    return _stream_remote_asset(job.output_url)  # Proxy the generated video through the local backend for browser compatibility.


@app.get("/api/jimeng/jobs/{job_id}/output", name="download_jimeng_job_output")
def download_jimeng_job_output(job_id: str):
    job = jimeng_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.output_url:
        raise HTTPException(status_code=404, detail="Job output is not available")
    return _stream_jimeng_asset(job.output_url)  # Jimeng may produce either a downloaded local file or a remote URL.


@app.get("/api/volcengine/jobs/{job_id}/last-frame", name="download_seedance_job_last_frame")
def download_seedance_job_last_frame(job_id: str) -> StreamingResponse:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.last_frame_url:
        raise HTTPException(status_code=404, detail="Job last frame is not available")
    return _stream_remote_asset(job.last_frame_url)  # Keep optional last-frame assets reachable through the same proxy path.
