from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

PYTHON_APP_ROOT = Path(__file__).resolve().parents[2]  # Reach apps/python-backend from backend/tests.
sys.path.insert(0, str(PYTHON_APP_ROOT / "backend" / "src"))  # Import the backend package without installing it.

from uvpython_service.models import MediaInput, SeedanceJobPayload
from uvpython_service.worker import _build_content, _create_remote_task, _validate_payload

SEEDANCE25_MODEL_ID = "doubao-seedance-2-5-260628"  # Seedance 2.5 follows different validation rules than 2.0.


def build_media_input(path: Path, content_type: str) -> MediaInput:
    path.write_bytes(b"media")
    return MediaInput(
        file_name=path.name,
        content_type=content_type,
        temp_path=path,
        size_bytes=path.stat().st_size,
        duration_seconds=3.0,
    )  # Minimal staged media record for request-building tests.


class WorkerContentTests(unittest.TestCase):
    def test_reference_audio_content_uses_reference_audio_role(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            reference_image = build_media_input(tmp_path / "ref.png", "image/png")
            reference_video = build_media_input(tmp_path / "ref.mp4", "video/mp4")
            reference_audio = build_media_input(tmp_path / "ref.wav", "audio/wav")
            payload = SeedanceJobPayload(
                prompt="make a product video",
                model_id="doubao-seedance-2-0-260128",
                variant="reference",
                ratio="16:9",
                duration=5,
                reference_images=[reference_image],
                reference_videos=[reference_video],
                reference_audios=[reference_audio],
            )

            with patch("uvpython_service.worker.media_to_data_url", side_effect=lambda media: f"data:{media.file_name}"):
                with patch("uvpython_service.worker.upload_video_to_tos", return_value="https://example.com/ref.mp4"):
                    content = _build_content("job-1", payload, settings=object())  # Settings are only needed by the patched upload helper.

        self.assertEqual(content[1]["role"], "reference_image")
        self.assertEqual(content[2]["role"], "reference_video")
        self.assertEqual(content[3]["role"], "reference_audio")


def build_smart_payload(model_id: str, resolution: str | None = None, **overrides: object) -> SeedanceJobPayload:
    payload_kwargs: dict[str, object] = {
        "prompt": "make a video",
        "model_id": model_id,
        "variant": "smart",
        "ratio": "16:9",
        "duration": 5,
        "resolution": resolution,  # type: ignore[arg-type]  # Exercise raw values against the validator.
    }
    payload_kwargs.update(overrides)
    return SeedanceJobPayload(**payload_kwargs)  # type: ignore[arg-type]  # Smart mode needs no media, which keeps validation tests minimal.


class WorkerValidationTests(unittest.TestCase):
    def test_mini_model_is_supported(self) -> None:
        _validate_payload(build_smart_payload("doubao-seedance-2-0-mini-260615"))  # Should not raise.

    def test_standard_model_accepts_4k(self) -> None:
        _validate_payload(build_smart_payload("doubao-seedance-2-0-260128", resolution="4k"))  # Should not raise.

    def test_fast_model_rejects_4k(self) -> None:
        with self.assertRaises(ValueError):
            _validate_payload(build_smart_payload("doubao-seedance-2-0-fast-260128", resolution="4k"))

    def test_mini_model_rejects_1080p(self) -> None:
        with self.assertRaises(ValueError):
            _validate_payload(build_smart_payload("doubao-seedance-2-0-mini-260615", resolution="1080p"))


def build_variant_payload(
    variant: str,
    tmp_path: Path,
    *,
    model_id: str = "doubao-seedance-2-0-260128",
    ratio: str = "16:9",
    duration: int = 5,
    clip_duration: float = 3.0,
    images: int = 0,
    videos: int = 0,
    audios: int = 0,
    output_format: str | None = None,
    primary_image: MediaInput | None = None,
    last_frame_image: MediaInput | None = None,
) -> SeedanceJobPayload:
    def build_clip(name: str, content_type: str) -> MediaInput:
        media = build_media_input(tmp_path / name, content_type)
        media.duration_seconds = clip_duration  # Override the default clip length for duration-limit tests.
        return media

    return SeedanceJobPayload(
        prompt="make a video",
        model_id=model_id,
        variant=variant,  # type: ignore[arg-type]  # Exercise raw values against the validator.
        ratio=ratio,  # type: ignore[arg-type]
        duration=duration,
        output_format=output_format,  # type: ignore[arg-type]
        primary_image=primary_image,
        last_frame_image=last_frame_image,
        reference_images=[build_media_input(tmp_path / f"ref{i}.png", "image/png") for i in range(images)],
        reference_videos=[build_clip(f"ref{i}.mp4", "video/mp4") for i in range(videos)],
        reference_audios=[build_clip(f"ref{i}.wav", "audio/wav") for i in range(audios)],
    )  # MediaInput.duration_seconds is preset, so validation skips ffprobe.


class WorkerEditExtendValidationTests(unittest.TestCase):
    def test_edit_without_video_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload("edit", Path(tmp_dir))
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_edit_with_video_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload("edit", Path(tmp_dir), videos=1)
            _validate_payload(payload)  # Should not raise.

    def test_edit_with_video_image_and_audio_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload("edit", Path(tmp_dir), videos=1, images=1, audios=1)
            _validate_payload(payload)  # Should not raise.

    def test_edit_rejects_first_and_last_frame_images(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            first_frame = build_media_input(tmp_path / "first.png", "image/png")
            last_frame = build_media_input(tmp_path / "last.png", "image/png")
            payload = build_variant_payload(
                "edit",
                tmp_path,
                videos=1,
                primary_image=first_frame,
                last_frame_image=last_frame,
            )
            with self.assertRaisesRegex(ValueError, "do not accept first-frame or last-frame images"):
                _validate_payload(payload)

    def test_extend_with_two_videos_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload("extend", Path(tmp_dir), videos=2)
            _validate_payload(payload)  # Should not raise.

    def test_extend_without_video_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload("extend", Path(tmp_dir))
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_extend_with_reference_image_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload("extend", Path(tmp_dir), videos=1, images=1)
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_extend_rejects_first_and_last_frame_images(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            first_frame = build_media_input(tmp_path / "first.png", "image/png")
            payload = build_variant_payload("extend", tmp_path, videos=1, primary_image=first_frame)
            with self.assertRaisesRegex(ValueError, "do not accept first-frame or last-frame images"):
                _validate_payload(payload)

    def test_extend_with_four_videos_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload("extend", Path(tmp_dir), videos=4)
            with self.assertRaises(ValueError):
                _validate_payload(payload)


def build_seedance25_smart_payload(**overrides: object) -> SeedanceJobPayload:
    payload_kwargs: dict[str, object] = {
        "prompt": "make a video",
        "model_id": SEEDANCE25_MODEL_ID,
        "variant": "smart",
        "ratio": "adaptive",  # Seedance 2.5 first-frame tasks must use the adaptive ratio.
        "duration": -1,  # -1 lets the model auto-select the duration.
    }
    payload_kwargs.update(overrides)
    return SeedanceJobPayload(**payload_kwargs)  # type: ignore[arg-type]  # Exercise raw values against the validator.


class Seedance25ValidationTests(unittest.TestCase):
    def test_seedance25_smart_passes_with_adaptive_ratio(self) -> None:
        _validate_payload(build_seedance25_smart_payload())  # Should not raise.

    def test_seedance25_accepts_duration_30(self) -> None:
        _validate_payload(build_seedance25_smart_payload(duration=30))  # Should not raise.

    def test_seedance25_rejects_duration_31(self) -> None:
        with self.assertRaises(ValueError):
            _validate_payload(build_seedance25_smart_payload(duration=31))

    def test_seedance25_rejects_duration_below_4(self) -> None:
        with self.assertRaises(ValueError):
            _validate_payload(build_seedance25_smart_payload(duration=3))

    def test_seedance20_models_accept_duration_auto_select(self) -> None:
        for model_id in (
            "doubao-seedance-2-0-260128",
            "doubao-seedance-2-0-fast-260128",
            "doubao-seedance-2-0-mini-260615",
        ):
            _validate_payload(build_smart_payload(model_id, duration=-1))  # Every Volcengine 2.0 sub-model supports Auto.

    def test_seedance25_text_to_video_allows_explicit_ratio(self) -> None:
        _validate_payload(build_seedance25_smart_payload(ratio="16:9"))  # Text-only generation supports explicit ratios.

    def test_seedance25_first_frame_rejects_explicit_ratio(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            primary_image = build_media_input(Path(tmp_dir) / "first-frame.png", "image/png")
            with self.assertRaises(ValueError):
                _validate_payload(build_seedance25_smart_payload(ratio="16:9", primary_image=primary_image))

    def test_seedance25_rejects_non_adaptive_ratio_for_edit_and_extend(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            for variant in ("edit", "extend"):
                payload = build_variant_payload(
                    variant,
                    Path(tmp_dir),
                    model_id=SEEDANCE25_MODEL_ID,
                    duration=-1,
                    videos=1,
                )
                with self.assertRaises(ValueError):
                    _validate_payload(payload)

    def test_seedance25_reference_allows_explicit_ratio(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                images=1,
            )
            _validate_payload(payload)  # Should not raise; the adaptive rule only covers first-frame tasks.

    def test_seedance25_edit_requires_auto_duration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "edit",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                ratio="adaptive",
                duration=10,
                videos=1,
            )
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_seedance25_edit_passes_with_auto_duration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "edit",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                ratio="adaptive",
                duration=-1,
                videos=1,
                clip_duration=5.0,
            )
            _validate_payload(payload)  # Should not raise.

    def test_seedance25_edit_rejects_video_shorter_than_four_seconds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "edit",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                ratio="adaptive",
                duration=-1,
                videos=1,
                clip_duration=3.0,
            )
            with self.assertRaisesRegex(ValueError, "between 4 and 30 seconds"):
                _validate_payload(payload)

    def test_seedance25_reference_allows_video_shorter_than_four_seconds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                videos=1,
                clip_duration=3.0,
            )
            _validate_payload(payload)  # The general reference-video minimum remains two seconds.

    def test_seedance25_reference_caps_allow_30_images_10_videos_10_audios(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                images=30,
                videos=10,
                audios=10,
            )
            _validate_payload(payload)  # Should not raise; 10 clips at 3s stay within the 30s combined cap.

    def test_seedance25_rejects_31_images(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                images=31,
            )
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_seedance25_rejects_11_videos(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                videos=11,
            )
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_seedance25_rejects_11_audios(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                audios=11,
            )
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_seedance25_allows_30_second_clip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                videos=1,
                clip_duration=30.0,
            )
            _validate_payload(payload)  # Should not raise.

    def test_seedance25_rejects_clip_over_30_seconds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                videos=1,
                clip_duration=31.0,
            )
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_seedance25_rejects_combined_videos_over_30_seconds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                videos=2,
                clip_duration=16.0,
            )
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_seedance25_rejects_combined_audios_over_30_seconds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "reference",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                duration=-1,
                audios=2,
                clip_duration=16.0,
            )
            with self.assertRaises(ValueError):
                _validate_payload(payload)

    def test_seedance25_accepts_output_format(self) -> None:
        _validate_payload(build_seedance25_smart_payload(output_format="mov"))  # Should not raise.

    def test_seedance20_rejects_output_format(self) -> None:
        with self.assertRaises(ValueError):
            _validate_payload(build_smart_payload("doubao-seedance-2-0-260128", output_format="mov"))

    def test_seedance25_rejects_1080p(self) -> None:
        with self.assertRaises(ValueError):
            _validate_payload(build_seedance25_smart_payload(resolution="1080p"))


class FakeCreateTasks:
    def __init__(self) -> None:
        self.kwargs: dict[str, object] | None = None

    def create(
        self,
        *,
        model: object,
        content: object,
        ratio: object,
        duration: object,
        watermark: object,
        generate_audio: object,
        camera_fixed: object | None = None,
        resolution: object | None = None,
        extra_body: dict[str, object] | None = None,
    ) -> object:
        self.kwargs = {
            "model": model,
            "content": content,
            "ratio": ratio,
            "duration": duration,
            "watermark": watermark,
            "generate_audio": generate_audio,
        }  # An explicit signature rejects unsupported SDK keyword arguments.
        if camera_fixed is not None:
            self.kwargs["camera_fixed"] = camera_fixed
        if resolution is not None:
            self.kwargs["resolution"] = resolution
        if extra_body is not None:
            self.kwargs["extra_body"] = extra_body
        return SimpleNamespace(id="task-1")


def build_fake_ark_client() -> SimpleNamespace:
    tasks = FakeCreateTasks()
    return SimpleNamespace(content_generation=SimpleNamespace(tasks=tasks))


class CreateRemoteTaskTests(unittest.TestCase):
    def test_seedance20_smart_request_keeps_camera_fixed_and_omits_25_params(self) -> None:
        client = build_fake_ark_client()
        payload = build_smart_payload("doubao-seedance-2-0-260128")

        _create_remote_task(client, payload, content=[{"type": "text", "text": "make a video"}])  # type: ignore[arg-type]

        kwargs = client.content_generation.tasks.kwargs or {}
        self.assertIn("camera_fixed", kwargs)
        self.assertNotIn("output_format", kwargs)
        self.assertNotIn("omni_reference_task_type", kwargs)
        self.assertNotIn("extra_body", kwargs)
        self.assertEqual(kwargs["watermark"], False)

    def test_seedance20_edit_and_extend_requests_omit_25_task_type(self) -> None:
        model_ids = (
            "doubao-seedance-2-0-260128",
            "doubao-seedance-2-0-fast-260128",
            "doubao-seedance-2-0-mini-260615",
        )
        for model_id in model_ids:
            for variant in ("edit", "extend"):
                with self.subTest(model_id=model_id, variant=variant), tempfile.TemporaryDirectory() as tmp_dir:
                    client = build_fake_ark_client()
                    payload = build_variant_payload(variant, Path(tmp_dir), model_id=model_id, videos=1)

                    _create_remote_task(client, payload, content=[{"type": "text", "text": "make a video"}])  # type: ignore[arg-type]

                    kwargs = client.content_generation.tasks.kwargs or {}
                    self.assertNotIn("extra_body", kwargs)
                    self.assertIn("camera_fixed", kwargs)

    def test_seedance25_request_omits_camera_fixed(self) -> None:
        client = build_fake_ark_client()
        payload = build_seedance25_smart_payload(output_format="mov")

        _create_remote_task(client, payload, content=[{"type": "text", "text": "make a video"}])  # type: ignore[arg-type]

        kwargs = client.content_generation.tasks.kwargs or {}
        self.assertNotIn("camera_fixed", kwargs)
        self.assertNotIn("output_format", kwargs)  # Provider extensions must not become unsupported SDK keyword arguments.
        self.assertEqual(kwargs["extra_body"], {"output_format": "mov"})  # Smart tasks leave the omni task type on auto.

    def test_seedance25_edit_request_sets_omni_task_type(self) -> None:
        client = build_fake_ark_client()
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "edit",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                ratio="adaptive",
                duration=-1,
                videos=1,
            )

            _create_remote_task(client, payload, content=[{"type": "text", "text": "make a video"}])  # type: ignore[arg-type]

        kwargs = client.content_generation.tasks.kwargs or {}
        self.assertEqual(kwargs["extra_body"], {"omni_reference_task_type": "edit"})
        self.assertNotIn("camera_fixed", kwargs)
        self.assertNotIn("output_format", kwargs)  # Omitted when the caller leaves the provider default.

    def test_seedance25_extend_request_sets_omni_task_type(self) -> None:
        client = build_fake_ark_client()
        with tempfile.TemporaryDirectory() as tmp_dir:
            payload = build_variant_payload(
                "extend",
                Path(tmp_dir),
                model_id=SEEDANCE25_MODEL_ID,
                ratio="adaptive",
                duration=-1,
                videos=1,
            )

            _create_remote_task(client, payload, content=[{"type": "text", "text": "make a video"}])  # type: ignore[arg-type]

        kwargs = client.content_generation.tasks.kwargs or {}
        self.assertEqual(kwargs["extra_body"], {"omni_reference_task_type": "extend"})


if __name__ == "__main__":
    unittest.main()
