from __future__ import annotations

import asyncio
import io
import shutil
import tempfile
from pathlib import Path
from typing import Awaitable, Callable

from openpyxl import load_workbook


class SpreadsheetRecalculationError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


ResolveExecutable = Callable[[], str | None]
RunLibreOffice = Callable[[str, Path, Path], Awaitable[None]]


class SpreadsheetRecalculationService:
    def __init__(
        self,
        *,
        resolve_executable: ResolveExecutable | None = None,
        run: RunLibreOffice | None = None,
    ) -> None:
        self._resolve_executable = resolve_executable or _find_libreoffice
        self._run = run or _run_libreoffice

    async def recalculate(self, document: bytes) -> bytes:
        executable = self._resolve_executable()
        if not executable:
            raise SpreadsheetRecalculationError(
                "spreadsheet_recalculation_unavailable",
                "LibreOffice recalculation is unavailable",
            )
        with tempfile.TemporaryDirectory(prefix="realmflow-sheet-") as directory:
            root = Path(directory)
            input_path = root / "source.xlsx"
            output_directory = root / "output"
            output_directory.mkdir()
            output_path = output_directory / "source.xlsx"
            input_path.write_bytes(document)
            try:
                await self._run(executable, input_path, output_path)
                converted = output_path.read_bytes()
                load_workbook(io.BytesIO(converted), data_only=True).close()
            except SpreadsheetRecalculationError:
                raise
            except Exception as error:
                raise SpreadsheetRecalculationError(
                    "spreadsheet_recalculation_failed",
                    "Spreadsheet formula recalculation failed",
                ) from error
            return converted


def _find_libreoffice() -> str | None:
    discovered = shutil.which("libreoffice") or shutil.which("soffice")
    if discovered:
        return discovered
    macos_path = Path(
        "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    )
    return str(macos_path) if macos_path.is_file() else None


async def _run_libreoffice(
    executable: str,
    input_path: Path,
    output_path: Path,
) -> None:
    process = await asyncio.create_subprocess_exec(
        executable,
        "--headless",
        "--convert-to",
        "xlsx",
        "--outdir",
        str(output_path.parent),
        str(input_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=120,
        )
    except TimeoutError as error:
        process.kill()
        await process.wait()
        raise SpreadsheetRecalculationError(
            "spreadsheet_recalculation_failed",
            "Spreadsheet formula recalculation timed out",
        ) from error
    if process.returncode != 0 or not output_path.is_file():
        detail = (stderr or stdout).decode("utf-8", errors="replace").strip()
        raise SpreadsheetRecalculationError(
            "spreadsheet_recalculation_failed",
            detail[:500] or "Spreadsheet formula recalculation failed",
        )
