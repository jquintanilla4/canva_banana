import os

import pytest

from uvpython_service.jimeng_canvas_cli import CanvasCliError
from uvpython_service.jimeng_legacy_cli import list_legacy_cli_installations, remove_legacy_cli

pytestmark = pytest.mark.skipif(os.name != "posix", reason="Local CLI removal requires POSIX directory descriptors")


@pytest.fixture
def legacy_path(monkeypatch, tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("JIMENG_WORK_DIR", str(tmp_path / "app-data/jimeng-work"))
    monkeypatch.setenv("JIMENG_CANVAS_CLI_PATH", str(tmp_path / "canvas-not-installed"))
    return home / ".local/bin/dreamina"


def test_does_not_follow_legacy_file_symlink(legacy_path, tmp_path):
    target = tmp_path / "outside/dreamina"
    target.parent.mkdir()
    target.touch(mode=0o700)
    legacy_path.parent.mkdir(parents=True)
    legacy_path.symlink_to(target)
    assert list_legacy_cli_installations() == []
    with pytest.raises(CanvasCliError, match="cannot be removed"):
        remove_legacy_cli("home")
    assert legacy_path.is_symlink()
    assert target.is_file()


def test_does_not_follow_legacy_parent_symlink(legacy_path, tmp_path):
    target = tmp_path / "outside/bin/dreamina"
    target.parent.mkdir(parents=True)
    target.touch(mode=0o700)
    legacy_path.parent.parent.symlink_to(target.parent.parent, target_is_directory=True)
    assert list_legacy_cli_installations() == []
    assert "No removable" in remove_legacy_cli("home")["message"]
    assert target.is_file()


@pytest.mark.parametrize("alias", ["symlink", "hardlink", "different-case"])
def test_does_not_remove_the_configured_canvas_executable(legacy_path, monkeypatch, tmp_path, alias):
    legacy_path.parent.mkdir(parents=True)
    legacy_path.touch(mode=0o700)
    canvas = tmp_path / "dreamina-canvas"
    if alias == "symlink":
        canvas.symlink_to(legacy_path)
    elif alias == "hardlink":
        canvas.hardlink_to(legacy_path)
    else:
        canvas = legacy_path.with_name("Dreamina")
        if not canvas.is_file():
            pytest.skip("Requires a case-insensitive filesystem")
    monkeypatch.setenv("JIMENG_CANVAS_CLI_PATH", str(canvas))
    assert list_legacy_cli_installations() == []
    with pytest.raises(CanvasCliError, match="cannot be removed"):
        remove_legacy_cli("home")
    assert legacy_path.is_file()
    assert canvas.is_file()


def test_legacy_removal_reports_permission_failure(legacy_path, monkeypatch):
    legacy_path.parent.mkdir(parents=True)
    legacy_path.touch(mode=0o700)

    def deny_unlink(*args, **kwargs):
        raise PermissionError("filesystem details")

    with monkeypatch.context() as context:
        context.setattr("uvpython_service.jimeng_legacy_cli.os.unlink", deny_unlink)
        with pytest.raises(CanvasCliError, match="Check file permissions"):
            remove_legacy_cli("home")
    assert legacy_path.is_file()
