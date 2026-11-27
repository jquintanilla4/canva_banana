from __future__ import annotations

import errno
import os
import stat
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from pathlib import Path
from typing import Literal, TypedDict

from uvpython_service.config import get_legacy_jimeng_work_dir
from uvpython_service.jimeng_canvas_cli import CanvasCliError, find_canvas_executable

LegacyCliLocation = Literal["home", "app"]
_LOCATIONS: tuple[LegacyCliLocation, ...] = ("home", "app")
_NAME = "dreamina"
_UNAVAILABLE = {errno.ENOENT, errno.ENOTDIR, errno.ELOOP}


class LegacyCliInstallation(TypedDict):
    location: LegacyCliLocation
    path: str


@contextmanager
def _installation_directory(location: LegacyCliLocation) -> Iterator[tuple[int, Path]]:
    if location == "home":
        base, parts = Path.home(), (".local", "bin")
    else:
        base, parts = get_legacy_jimeng_work_dir().parent, (".tools", "jimeng", "bin")
    base = base.resolve()
    with ExitStack() as stack:
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        fd = os.open(base, flags)
        stack.callback(os.close, fd)
        for part in parts:
            fd = os.open(part, flags, dir_fd=fd)
            stack.callback(os.close, fd)
        yield fd, base.joinpath(*parts)


def _is_removable(fd: int) -> bool:
    candidate = os.stat(_NAME, dir_fd=fd, follow_symlinks=False)
    if not stat.S_ISREG(candidate.st_mode) or not candidate.st_mode & 0o111:
        return False
    canvas = find_canvas_executable()
    return not canvas or not os.path.samestat(candidate, os.stat(canvas))


def list_legacy_cli_installations() -> list[LegacyCliInstallation]:
    installations: list[LegacyCliInstallation] = []
    if os.name != "posix":
        return installations
    for location in _LOCATIONS:
        try:
            with _installation_directory(location) as (fd, directory):
                if _is_removable(fd):
                    installations.append({"location": location, "path": str(directory / _NAME)})
        except (OSError, RuntimeError):
            continue
    return installations


def remove_legacy_cli(location: LegacyCliLocation) -> dict[str, str]:
    if os.name != "posix":
        raise CanvasCliError("Remove the legacy Dreamina CLI manually on this platform.")
    try:
        with _installation_directory(location) as (fd, _):
            if _is_removable(fd):
                os.unlink(_NAME, dir_fd=fd)
                return {"status": "ok", "message": "Legacy Dreamina CLI removed. Login data was kept."}
    except RuntimeError:
        raise CanvasCliError("Could not resolve the legacy Dreamina CLI location.") from None
    except OSError as exc:
        if exc.errno not in _UNAVAILABLE:
            raise CanvasCliError("Could not remove the legacy Dreamina CLI. Check file permissions and try again.") from None
        return {"status": "ok", "message": "No removable legacy Dreamina CLI was found at this location."}
    raise CanvasCliError("This file cannot be removed as a legacy Dreamina CLI.")
