from __future__ import annotations

import base64
import io
import json
import sys
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from starlette.datastructures import Headers
from dataclasses import replace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from uvpython_service.main import app
from uvpython_service.seedream_images import IMAGE_READ_BYTES, SEEDREAM55_MAX_IMAGE_BYTES, SEEDREAM55_MODEL_ID, ImageRequestBody, StagedImage, read_image_uploads, validate_image_options
from uvpython_service.config import get_settings

HEADERS = {"X-Canva-Banana-Local-Action": "volcengine-submit", "Origin": "http://localhost:5173"}
PNG = b"\x89PNG\r\n\x1a\nimage"
JPEG = b"\xff\xd8\xffimage"
URL = "/api/volcengine/images/generations"


@pytest.fixture
def upstream():
    requests: list[httpx.Request] = []
    responses = {"status": 200, "headers": {"X-Request-Id": "ark-request"}, "body": {"data": [{"b64_json": "aW1hZ2U="}]}}
    client_type = httpx.Client

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(responses["status"], headers=responses["headers"], json=responses["body"])

    def create_client(**kwargs):
        return client_type(transport=httpx.MockTransport(handle), **kwargs)

    with patch("uvpython_service.seedream_images.httpx.Client", side_effect=create_client) as factory, patch("uvpython_service.seedream_images.get_settings", return_value=replace(get_settings(), ark_api_key="test-only")):
        yield requests, responses, factory


def post(data: dict[str, str], *, files=None, headers=None, client_host="127.0.0.1"):
    return TestClient(app, client=(client_host, 50000)).post(URL, data=data, files=files, headers=HEADERS if headers is None else headers)


def image_file(content=PNG, mime="image/png"):
    return ("images", ("reference.png", content, mime))


def test_text_to_image_defaults_reach_streamed_http_body(upstream) -> None:
    requests, _, _ = upstream
    response = post({"operation": "text_to_image"})
    assert response.status_code == 200
    assert response.json() == {"requestId": "ark-request", "data": [{"b64_json": "aW1hZ2U=", "output_format": "png"}]}
    assert len(requests) == 1
    assert str(requests[0].url) == "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    assert requests[0].headers["authorization"] == "Bearer test-only"
    assert int(requests[0].headers["content-length"]) == len(requests[0].content)
    assert "transfer-encoding" not in requests[0].headers
    assert json.loads(requests[0].content) == {
        "model": SEEDREAM55_MODEL_ID, "prompt": "", "size": "2K", "output_format": "png",
        "response_format": "b64_json", "watermark": False, "background": "auto",
    }


@pytest.mark.parametrize("size", ["1K", "1.5K", "2K"])
@pytest.mark.parametrize("background", ["auto", "transparent", "opaque"])
def test_image_edit_preserves_order_and_options_in_streamed_body(upstream, size, background) -> None:
    requests, _, _ = upstream
    response = post({"operation": "image_edit", "prompt": "Edit both", "size": size, "output_format": "png" if background == "transparent" else "jpeg", "background": background}, files=[image_file(), image_file(JPEG, "image/jpeg")])
    assert response.status_code == 200
    output_format = "png" if background == "transparent" else "jpeg"
    assert response.json()["data"][0]["output_format"] == output_format
    body = json.loads(requests[0].content)
    assert body == {
        "model": SEEDREAM55_MODEL_ID, "prompt": "Edit both", "size": size, "output_format": output_format,
        "response_format": "b64_json", "watermark": False, "background": background,
        "image": [f"data:image/png;base64,{base64.b64encode(PNG).decode()}", f"data:image/jpeg;base64,{base64.b64encode(JPEG).decode()}"],
    }


@pytest.mark.parametrize("content,mime", [(PNG, "image/png"), (JPEG, "image/jpeg")])
def test_layerize_preserves_extra_response_fields_and_omits_background(upstream, content, mime) -> None:
    requests, responses, _ = upstream
    responses["headers"] = {}
    responses["body"] = {
        "request_id": "layers-request",
        "data": [
            {"b64_json": "YmFjaw==", "z_index": 0, "bounding_box": {"absolute": [0, 0, 1024, 768]}, "name": "background"},
            {"b64_json": "ZnJvbnQ=", "z_index": 2, "bounding_box": {"absolute": [10, 20, 300, 400]}, "name": "subject"},
        ],
    }
    response = post({"operation": "layerize", "background": "transparent"}, files=[image_file(content, mime)])
    assert response.status_code == 200
    assert response.json() == {"requestId": "layers-request", "data": [{**entry, "output_format": "png"} for entry in responses["body"]["data"]]}
    assert int(requests[0].headers["content-length"]) == len(requests[0].content)
    assert "transfer-encoding" not in requests[0].headers
    assert json.loads(requests[0].content) == {
        "model": SEEDREAM55_MODEL_ID, "prompt": "", "size": "auto", "output_format": "png",
        "response_format": "b64_json", "watermark": False, "layer_decomposition": True,
        "image": f"data:{mime};base64,{base64.b64encode(content).decode()}",
    }


@pytest.mark.parametrize("data,files", [
    ({"operation": "unknown"}, None),
    ({"operation": "text_to_image", "size": "4K"}, None),
    ({"operation": "text_to_image", "size": "auto"}, None),
    ({"operation": "text_to_image", "output_format": "webp"}, None),
    ({"operation": "text_to_image", "background": "invalid"}, None),
    ({"operation": "text_to_image"}, [image_file()]),
    ({"operation": "image_edit"}, None),
    ({"operation": "image_edit"}, [image_file()] * 11),
    ({"operation": "layerize"}, None),
    ({"operation": "layerize"}, [image_file()] * 2),
    ({"operation": "layerize", "size": "2K"}, [image_file()]),
    ({"operation": "layerize"}, [image_file(b"GIF89a", "image/gif")]),
    ({"operation": "layerize"}, [image_file(b"not-png", "image/png")]),
    ({"operation": "image_edit"}, [image_file(b"", "image/png")]),
    ({"operation": "image_edit"}, [image_file(b"text", "text/plain")]),
])
def test_invalid_options_and_images_rejected_before_ark(upstream, data, files) -> None:
    requests, _, factory = upstream
    response = post(data, files=files)
    assert response.status_code == 400
    assert requests == []
    factory.assert_not_called()


def test_ten_edit_images_are_supported(upstream) -> None:
    requests, _, _ = upstream
    response = post({"operation": "image_edit"}, files=[image_file()] * 10)
    assert response.status_code == 200
    assert len(json.loads(requests[0].content)["image"]) == 10


def test_oversized_image_rejected_before_ark(upstream) -> None:
    requests, _, factory = upstream
    content = PNG + b"x" * (SEEDREAM55_MAX_IMAGE_BYTES + 1 - len(PNG))
    response = post({"operation": "image_edit"}, files=[image_file(content)])
    assert response.status_code == 400
    assert "30,000,000" in response.json()["detail"]
    assert requests == []
    factory.assert_not_called()


def test_exact_image_byte_limit_accepted() -> None:
    import asyncio

    content = PNG + b"x" * (SEEDREAM55_MAX_IMAGE_BYTES - len(PNG))
    upload = UploadFile(io.BytesIO(content), filename="large.png", headers=Headers({"content-type": "image/png"}))
    result = asyncio.run(read_image_uploads([upload], layerize=True))
    assert result[0].size == SEEDREAM55_MAX_IMAGE_BYTES
    assert result[0].file is upload.file
    asyncio.run(upload.close())


@pytest.mark.parametrize("headers,host", [
    ({}, "127.0.0.1"),
    ({**HEADERS, "Origin": "https://attacker.example"}, "127.0.0.1"),
    (HEADERS, "192.168.1.20"),
    ({**HEADERS, "Origin": "null"}, "127.0.0.1"),
    ({**HEADERS, "Origin": "null", "X-Canva-Banana-Desktop-Token": "wrong"}, "127.0.0.1"),
])
def test_untrusted_requests_cannot_submit(upstream, monkeypatch, headers, host) -> None:
    requests, _, factory = upstream
    monkeypatch.setenv("CANVA_BANANA_DESKTOP_AUTH_TOKEN", "desktop-test")
    response = post({"operation": "text_to_image"}, headers=headers, client_host=host)
    assert response.status_code == 403
    assert requests == []
    factory.assert_not_called()


def test_authenticated_desktop_can_submit(upstream, monkeypatch) -> None:
    monkeypatch.setenv("CANVA_BANANA_DESKTOP_AUTH_TOKEN", "desktop-test")
    response = post({"operation": "text_to_image"}, headers={**HEADERS, "Origin": "null", "X-Canva-Banana-Desktop-Token": "desktop-test"})
    assert response.status_code == 200


@pytest.mark.parametrize("provider_status,local_status", [(400, 400), (401, 401), (429, 429), (503, 502)])
def test_provider_errors_are_not_retried(upstream, provider_status, local_status) -> None:
    requests, responses, _ = upstream
    responses.update(status=provider_status, body={"error": {"message": "Provider unavailable", "code": "test-error"}})
    response = post({"operation": "text_to_image"})
    assert response.status_code == local_status
    assert len(requests) == 1
    assert "test-error" in response.json()["detail"]


@pytest.mark.parametrize("body", [{"data": []}, {"data": [{"url": "https://example.test/image.png"}]}, {"error": {"code": "Failed", "message": "failed"}}])
def test_invalid_provider_success_is_reported_as_failure(upstream, body) -> None:
    _, responses, _ = upstream
    responses["body"] = body
    assert post({"operation": "text_to_image"}).status_code == 502


async def run_without_body_async(*, headers=HEADERS) -> int:
    sent = []

    async def receive():
        raise AssertionError("Request body was consumed")

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
        "scheme": "http", "path": URL, "raw_path": URL.encode(), "query_string": b"",
        "headers": [(name.lower().encode(), value.encode()) for name, value in headers.items()] + [(b"content-type", b"multipart/form-data; boundary=test")],
        "client": ("127.0.0.1", 50000), "server": ("localhost", 80),
    }
    await app(scope, receive, send)
    return next(message["status"] for message in sent if message["type"] == "http.response.start")


def run_without_body(*, headers=HEADERS) -> int:
    import asyncio

    return asyncio.run(run_without_body_async(headers=headers))


def test_authorization_precedes_any_body_receive(upstream) -> None:
    requests, _, factory = upstream
    assert run_without_body(headers={}) == 403
    assert requests == []
    factory.assert_not_called()


@pytest.mark.parametrize("operation,files", [("text_to_image", None), ("image_edit", [image_file()])])
def test_transparent_jpeg_rejected_before_submission(upstream, operation, files) -> None:
    requests, _, factory = upstream
    response = post({"operation": operation, "output_format": "jpeg", "background": "transparent"}, files=files)
    assert response.status_code == 400
    assert "PNG" in response.json()["detail"]
    assert requests == []
    factory.assert_not_called()


def test_layerize_allows_jpeg_base_with_transparent_layers(upstream) -> None:
    requests, responses, _ = upstream
    responses["body"] = {"data": [{"b64_json": "YmFjaw==", "z_index": 0}, {"b64_json": "ZnJvbnQ=", "z_index": 1}]}
    response = post({"operation": "layerize", "output_format": "jpeg", "background": "transparent"}, files=[image_file()])
    assert response.status_code == 200
    assert [item["output_format"] for item in response.json()["data"]] == ["jpeg", "png"]
    assert len(requests) == 1


@pytest.mark.parametrize("size", [1, 2, 3, IMAGE_READ_BYTES - 1, IMAGE_READ_BYTES, IMAGE_READ_BYTES + 1, 2 * IMAGE_READ_BYTES - 1, 2 * IMAGE_READ_BYTES + 2])
@pytest.mark.parametrize("operation", ["image_edit", "layerize"])
def test_streamed_base64_boundaries_and_content_length(size, operation) -> None:
    content = (bytes(range(256)) * ((size + 255) // 256))[:size]
    images = [StagedImage(io.BytesIO(content), size, "image/png")]
    options = validate_image_options(operation, "Unicode: 🌴", None, "png", "auto", 1)
    body = ImageRequestBody(options, images)
    chunks = list(body)
    assert max(map(len, chunks)) <= IMAGE_READ_BYTES * 4 // 3
    serialized = b"".join(chunks)
    assert len(serialized) == body.content_length
    value = json.loads(serialized)["image"]
    encoded = value if operation == "layerize" else value[0]
    assert base64.b64decode(encoded.split(",", 1)[1], validate=True) == content


@pytest.mark.parametrize("multipart", [False, True])
@pytest.mark.parametrize("data", [{"operation": "text_to_image", "prompt": "x" * (1024 * 1024 + 1)}, {"operation": "text_to_image", **{f"field{index}": "x" for index in range(6)}}])
def test_form_field_bounds_precede_submission(upstream, multipart, data) -> None:
    requests, _, factory = upstream
    response = post(data, files=[("unused", (None, "text"))] if multipart else None)
    assert response.status_code == 400
    assert requests == []
    factory.assert_not_called()


@pytest.fixture
def staged_files(monkeypatch):
    import starlette.formparsers

    original = starlette.formparsers.SpooledTemporaryFile
    files = []

    def create_file(*args, **kwargs):
        file = original(*args, **kwargs)
        files.append(file)
        return file

    monkeypatch.setattr(starlette.formparsers, "SpooledTemporaryFile", create_file)
    return files


def test_file_count_bound_closes_all_staged_files(upstream, staged_files) -> None:
    response = post({"operation": "image_edit"}, files=[image_file()] * 11)
    assert response.status_code == 400
    assert len(staged_files) == 10
    assert all(file.closed for file in staged_files)


def test_validation_error_closes_uploads(upstream, staged_files) -> None:
    assert post({"operation": "text_to_image"}, files=[image_file()]).status_code == 400
    assert len(staged_files) == 1
    assert staged_files[0].closed


def send_stream(content):
    import asyncio

    async def send():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
            return await client.post(URL, content=content, headers={**HEADERS, "Content-Type": "multipart/form-data; boundary=test"})

    return asyncio.run(send())


@pytest.mark.parametrize("failure", ["file", "total", "incomplete", "disconnect", "idle"])
def test_staging_bounds_and_receive_failures_close_files(upstream, staged_files, monkeypatch, failure) -> None:
    import asyncio
    import uvpython_service.seedream_images as images

    received = []
    if failure == "file":
        monkeypatch.setattr(images, "SEEDREAM55_MAX_IMAGE_BYTES", 1024)
    if failure == "total":
        monkeypatch.setattr(images, "SEEDREAM55_MAX_FORM_BYTES", 1024)
    if failure == "idle":
        monkeypatch.setattr(images, "SEEDREAM55_UPLOAD_IDLE_SECONDS", 0.01)

    async def content():
        yield b'--test\r\nContent-Disposition: form-data; name="images"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'
        yield PNG
        if failure == "disconnect":
            raise RuntimeError("disconnected")
        if failure == "idle":
            await asyncio.sleep(0.1)
            return
        if failure != "incomplete":
            yield b"x" * 2048
            received.append("excess read")
            yield b"x" * 2048
            yield b"\r\n--test--\r\n"

    response = send_stream(content())
    assert response.status_code == {"disconnect": 502, "idle": 408}.get(failure, 400)
    assert received == []
    assert staged_files and all(file.closed for file in staged_files)
    assert upstream[0] == []
    if failure == "idle":
        assert post({"operation": "text_to_image"}).status_code == 200


def test_image_route_queues_authorized_submissions_before_staging(upstream, monkeypatch) -> None:
    import asyncio

    async def run():
        import uvpython_service.main as main

        monkeypatch.setattr(main, "_seedream_submit_slot", asyncio.Semaphore(1))
        first_staging = asyncio.Event()
        release_first = asyncio.Event()
        second_staging = asyncio.Event()

        async def first_content():
            yield b'--test\r\nContent-Disposition: form-data; name="operation"\r\n\r\ntext_to_image\r\n'
            first_staging.set()
            await release_first.wait()
            yield b"--test--\r\n"

        async def second_content():
            second_staging.set()
            yield b'--test\r\nContent-Disposition: form-data; name="operation"\r\n\r\ntext_to_image\r\n--test--\r\n'

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
            headers = {**HEADERS, "Content-Type": "multipart/form-data; boundary=test"}
            first = asyncio.create_task(client.post(URL, content=first_content(), headers=headers))
            await first_staging.wait()
            cancelled = asyncio.create_task(client.post(URL, content=second_content(), headers=headers))
            await asyncio.sleep(0.01)
            cancelled.cancel()
            with pytest.raises(asyncio.CancelledError):
                await cancelled
            assert not second_staging.is_set()
            second = asyncio.create_task(client.post(URL, content=second_content(), headers=headers))
            await asyncio.sleep(0.01)
            assert not second.done()
            assert not second_staging.is_set()
            assert await run_without_body_async(headers={}) == 403
            release_first.set()
            responses = await asyncio.gather(first, second)
            assert all(response.status_code == 200 for response in responses)
            assert second_staging.is_set()

    asyncio.run(run())
    assert len(upstream[0]) == 2


def test_request_header_takes_precedence_over_body_id(upstream) -> None:
    _, responses, _ = upstream
    responses["body"]["request_id"] = "body-request"
    assert post({"operation": "text_to_image"}).json()["requestId"] == "ark-request"


def test_ten_full_size_images_stream_once_without_materializing_json(monkeypatch, staged_files) -> None:
    client_type = httpx.Client
    submissions = []

    class DrainTransport(httpx.BaseTransport):
        def handle_request(self, request):
            assert request.headers["authorization"] == "Bearer test-only"
            assert "transfer-encoding" not in request.headers
            lengths = [len(chunk) for chunk in request.stream]
            assert max(lengths) <= IMAGE_READ_BYTES * 4 // 3
            assert sum(lengths) == int(request.headers["content-length"])
            submissions.append(sum(lengths))
            return httpx.Response(200, headers={"X-Request-Id": "full-size"}, json={"data": [{"b64_json": "eA=="}]})

    def create_client(**kwargs):
        return client_type(transport=DrainTransport(), **kwargs)

    async def content():
        yield b'--test\r\nContent-Disposition: form-data; name="operation"\r\n\r\nimage_edit\r\n'
        for index in range(10):
            yield f'--test\r\nContent-Disposition: form-data; name="images"; filename="{index}.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
            yield PNG
            remaining = SEEDREAM55_MAX_IMAGE_BYTES - len(PNG)
            block = b"x" * 262144
            while remaining:
                size = min(remaining, len(block))
                yield block[:size]
                remaining -= size
            yield b"\r\n"
        yield b"--test--\r\n"

    with patch("uvpython_service.seedream_images.httpx.Client", side_effect=create_client), patch("uvpython_service.seedream_images.get_settings", return_value=replace(get_settings(), ark_api_key="test-only")):
        response = send_stream(content())
    assert response.status_code == 200
    assert response.json()["requestId"] == "full-size"
    assert len(submissions) == 1
    assert submissions[0] > 400_000_000
    assert len(staged_files) == 10
    assert all(file.closed for file in staged_files)


def test_invalid_provider_json_is_an_upstream_failure(monkeypatch) -> None:
    client_type = httpx.Client
    submissions = []

    def handle(request):
        submissions.append(request)
        return httpx.Response(200, content=b"invalid json")

    def create_client(**kwargs):
        return client_type(transport=httpx.MockTransport(handle), **kwargs)

    with patch("uvpython_service.seedream_images.httpx.Client", side_effect=create_client), patch("uvpython_service.seedream_images.get_settings", return_value=replace(get_settings(), ark_api_key="test-only")):
        response = post({"operation": "text_to_image"})
    assert response.status_code == 502
    assert len(submissions) == 1
    assert "invalid image response" in response.json()["detail"]


def test_transport_error_does_not_return_authorization_header(monkeypatch) -> None:
    client_type = httpx.Client

    def fail(request):
        raise httpx.LocalProtocolError(f"Invalid header {request.headers['Authorization']!r}")

    monkeypatch.setattr("uvpython_service.seedream_images.httpx.Client", lambda **kwargs: client_type(transport=httpx.MockTransport(fail), **kwargs))
    monkeypatch.setattr("uvpython_service.seedream_images.get_settings", lambda: replace(get_settings(), ark_api_key="secret-fixture-key"))
    response = post({"operation": "text_to_image"})
    assert response.status_code == 502
    assert "secret-fixture-key" not in response.text


def test_cancelled_submission_keeps_slot_and_files_until_transport_finishes(monkeypatch, staged_files) -> None:
    import asyncio
    import threading
    import uvpython_service.main as main

    started = threading.Event()
    release = threading.Event()
    submissions = []

    def generate(options, images):
        submissions.append(options)
        if len(submissions) == 1:
            started.set()
            assert release.wait(timeout=5)
            assert not images[0].file.closed
        return {"data": [{"b64_json": "eA==", "output_format": "png"}]}

    async def run():
        monkeypatch.setattr(main, "_seedream_submit_slot", asyncio.Semaphore(1))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
            first = asyncio.create_task(client.post(URL, headers=HEADERS, data={"operation": "image_edit"}, files=[image_file()]))
            assert await asyncio.to_thread(started.wait, 5)
            first.cancel()
            await asyncio.sleep(0.01)
            first.cancel()
            second = asyncio.create_task(client.post(URL, headers=HEADERS, data={"operation": "text_to_image"}))
            await asyncio.sleep(0.01)
            assert not first.done()
            assert not second.done()
            assert len(submissions) == 1
            assert not staged_files[0].closed
            release.set()
            with pytest.raises(asyncio.CancelledError):
                await first
            assert (await second).status_code == 200

    monkeypatch.setattr(main, "generate_images", generate)
    try:
        asyncio.run(run())
    finally:
        release.set()
    assert len(submissions) == 2
    assert all(file.closed for file in staged_files)


def test_staged_image_validation_reads_only_signature() -> None:
    import asyncio

    class SignatureFile(io.BytesIO):
        def read(self, size=-1):
            assert size == 12
            return super().read(size)

    upload = UploadFile(SignatureFile(PNG), size=len(PNG), filename="test.png", headers=Headers({"content-type": "image/png"}))
    result = asyncio.run(read_image_uploads([upload], layerize=True))
    assert result[0].size == len(PNG)
    asyncio.run(upload.close())


@pytest.mark.parametrize("code", ["x" * 1024, "test-only", "prompt with spaces", "data:image/png;base64,eA=="])
def test_provider_error_summary_omits_untrusted_or_secret_values(upstream, code) -> None:
    _, responses, _ = upstream
    responses.update(status=400, body={"error": {"code": code, "message": "private prompt and image payload"}})
    response = post({"operation": "text_to_image"})
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert code not in detail
    assert "private prompt" not in detail
    assert len(detail) < 256
