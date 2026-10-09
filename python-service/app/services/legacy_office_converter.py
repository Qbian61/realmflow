from __future__ import annotations

import asyncio
import io
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable


SOURCE_TO_TARGET = {
    "doc": "docx",
    "dot": "docx",
    "wps": "docx",
    "wpt": "docx",
    "xls": "xlsx",
    "xlt": "xlsx",
    "ppt": "pptx",
    "pps": "pptx",
    "pot": "pptx",
}

MAIN_PARTS = {
    "docx": "word/document.xml",
    "xlsx": "xl/workbook.xml",
    "pptx": "ppt/presentation.xml",
}


class LegacyOfficeConversionError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LegacyOfficeConversionResult:
    document: bytes
    target_format: str
    converter: str


ResolveExecutable = Callable[[], str | None]
RunLibreOffice = Callable[[str, Path, Path, Path], Awaitable[None]]


class LegacyOfficeConverter:
    def __init__(
        self,
        *,
        resolve_executable: ResolveExecutable | None = None,
        run: RunLibreOffice | None = None,
    ) -> None:
        self._resolve_executable = resolve_executable or _find_libreoffice
        self._run = run or _run_libreoffice

    async def convert(
        self,
        *,
        format_: str,
        document: bytes,
    ) -> LegacyOfficeConversionResult:
        target_format = SOURCE_TO_TARGET.get(format_)
        if target_format is None:
            raise LegacyOfficeConversionError(
                "legacy_office_format_unsupported",
                "Legacy Office format is unsupported",
            )
        if not document:
            raise LegacyOfficeConversionError(
                "legacy_office_input_invalid",
                "Legacy Office document is empty",
            )
        executable = self._resolve_executable()
        if not executable:
            raise LegacyOfficeConversionError(
                "converter_unavailable",
                "LibreOffice is unavailable. Install LibreOffice and retry.",
            )

        with tempfile.TemporaryDirectory(
            prefix="realmflow-legacy-office-"
        ) as directory:
            root = Path(directory)
            input_path = root / f"source.{format_}"
            output_directory = root / "output"
            output_directory.mkdir()
            output_path = output_directory / f"source.{target_format}"
            profile_path = root / "profile"
            profile_path.mkdir()
            input_path.write_bytes(document)
            try:
                await self._run(
                    executable,
                    input_path,
                    output_path,
                    profile_path,
                )
            except LegacyOfficeConversionError:
                raise
            except Exception as error:
                raise LegacyOfficeConversionError(
                    "legacy_office_conversion_failed",
                    "Legacy Office conversion failed",
                ) from error
            try:
                converted = output_path.read_bytes()
                _validate_ooxml(converted, target_format)
            except LegacyOfficeConversionError:
                raise
            except Exception as error:
                raise LegacyOfficeConversionError(
                    "legacy_office_output_invalid",
                    "Converted Office document is invalid",
                ) from error
            return LegacyOfficeConversionResult(
                document=converted,
                target_format=target_format,
                converter="LibreOffice",
            )


def _find_libreoffice() -> str | None:
    discovered = shutil.which("libreoffice") or shutil.which("soffice")
    if discovered:
        return discovered
    macos_path = Path(
        "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    )
    return str(macos_path) if macos_path.is_file() else None


def libreoffice_command(
    *,
    executable: str,
    source_path: Path,
    output_path: Path,
    profile_path: Path,
) -> tuple[str, ...]:
    target_format = output_path.suffix.removeprefix(".")
    return (
        executable,
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        f"-env:UserInstallation={profile_path.as_uri()}",
        "--convert-to",
        target_format,
        "--outdir",
        str(output_path.parent),
        str(source_path),
    )


async def _run_libreoffice(
    executable: str,
    source_path: Path,
    output_path: Path,
    profile_path: Path,
) -> None:
    process = await asyncio.create_subprocess_exec(
        *libreoffice_command(
            executable=executable,
            source_path=source_path,
            output_path=output_path,
            profile_path=profile_path,
        ),
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
        raise LegacyOfficeConversionError(
            "legacy_office_conversion_failed",
            "Legacy Office conversion timed out",
        ) from error
    if process.returncode != 0 or not output_path.is_file():
        detail = (stderr or stdout).decode("utf-8", errors="replace").strip()
        raise LegacyOfficeConversionError(
            "legacy_office_conversion_failed",
            detail[:500] or "Legacy Office conversion failed",
        )


def _validate_ooxml(document: bytes, target_format: str) -> None:
    if not document.startswith(b"PK"):
        raise LegacyOfficeConversionError(
            "legacy_office_output_invalid",
            "Converted Office document is not an OOXML package",
        )
    main_part = MAIN_PARTS[target_format]
    try:
        with zipfile.ZipFile(io.BytesIO(document)) as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names or main_part not in names:
                raise LegacyOfficeConversionError(
                    "legacy_office_output_invalid",
                    "Converted Office document has an invalid structure",
                )
            archive.testzip()
    except LegacyOfficeConversionError:
        raise
    except (OSError, zipfile.BadZipFile) as error:
        raise LegacyOfficeConversionError(
            "legacy_office_output_invalid",
            "Converted Office document is not a valid ZIP package",
        ) from error
