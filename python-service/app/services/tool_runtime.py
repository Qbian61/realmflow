import asyncio
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from time import monotonic
from typing import Literal
from urllib.parse import urlsplit

from app.services.skill_runtime import (
    MemoryLimitExceededError,
    OutputLimitExceededError,
    SkillNetworkGrant,
    SkillRuntime,
    SkillRuntimeError,
    SkillRuntimeMetrics,
    SkillRuntimeRequest,
    build_linux_sandbox_command,
    communicate_bounded,
    elapsed_ms,
    encoded_size,
    sandbox_profile,
    process_isolation,
    serialize_network_grants,
    terminate_process,
    validate_entry_path,
    validate_network_grants,
)


ToolRuntimeKind = Literal["python", "process"]
ToolExecutionLevel = Literal[
    "pure_function",
    "controlled_file",
    "controlled_process",
    "controlled_network",
    "external_side_effect",
]


class ToolRuntimeError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ToolRuntimeRequest:
    execution_id: str
    manifest: "ToolSandboxManifest"
    runtime: ToolRuntimeKind
    package_root: Path
    entry_path: Path
    arguments: tuple[str, ...]
    input: dict[str, object]
    capabilities: tuple[str, ...]
    scope_roots: tuple[Path, ...]
    network: tuple[SkillNetworkGrant, ...]
    timeout_ms: int
    max_memory_mb: int
    max_output_bytes: int


@dataclass(frozen=True)
class ToolSandboxNetworkTarget:
    service: str
    origin: str
    path_prefix: str


@dataclass(frozen=True)
class ToolSandboxManifest:
    schema_version: int
    execution_id: str
    execution_level: ToolExecutionLevel
    enforcement: str
    platform_isolation: str
    package_root: Path
    read_only_roots: tuple[Path, ...]
    read_write_roots: tuple[Path, ...]
    environment_variables: tuple[str, ...]
    network_targets: tuple[ToolSandboxNetworkTarget, ...]
    timeout_ms: int
    max_memory_mb: int
    max_output_bytes: int
    policy_digest: str


@dataclass(frozen=True)
class ToolRuntimeResult:
    output: dict[str, object]
    metrics: SkillRuntimeMetrics


class ToolRuntime:
    def __init__(
        self,
        sandbox_executable: str | None | object = ...,
        platform: str | None = None,
    ) -> None:
        self._platform = platform or sys.platform
        if sandbox_executable is ...:
            sandbox_executable = shutil.which(
                "sandbox-exec"
                if self._platform == "darwin"
                else "bwrap"
                if self._platform.startswith("linux")
                else ""
            )
        self._sandbox_executable = (
            str(sandbox_executable)
            if isinstance(sandbox_executable, str)
            else None
        )
        self._process_isolation = process_isolation(
            self._platform,
            self._sandbox_executable,
        )
        self._skill_runtime = SkillRuntime(
            sandbox_executable,
            platform=self._platform,
        )
        self._processes: dict[str, subprocess.Popen[bytes]] = {}
        self._cancelled: set[str] = set()

    def capabilities(self) -> dict[str, str]:
        return {
            "platform": self._platform,
            "processIsolation": self._process_isolation,
        }

    async def execute(
        self, request: ToolRuntimeRequest
    ) -> ToolRuntimeResult:
        if request.runtime == "python":
            return await self._execute_python(request)
        if request.runtime != "process":
            raise ToolRuntimeError(
                "tool_runtime_unsupported", "Unsupported Tool runtime"
            )
        return await self._execute_process(request)

    async def cancel(self, execution_id: str) -> bool:
        process = self._processes.get(execution_id)
        if process is not None and process.returncode is None:
            self._cancelled.add(execution_id)
            await asyncio.to_thread(terminate_process, process)
            return True
        return await self._skill_runtime.cancel(execution_id)

    async def _execute_python(
        self, request: ToolRuntimeRequest
    ) -> ToolRuntimeResult:
        try:
            result = await self._skill_runtime.execute(
                SkillRuntimeRequest(
                    execution_id=request.execution_id,
                    entry_type="python",
                    package_root=request.package_root,
                    entry_path=request.entry_path,
                    input=request.input,
                    capabilities=request.capabilities,
                    scope_roots=request.scope_roots,
                    network=request.network,
                    timeout_ms=request.timeout_ms,
                    max_memory_mb=request.max_memory_mb,
                    max_output_bytes=request.max_output_bytes,
                    arguments=request.arguments,
                )
            )
        except SkillRuntimeError as error:
            raise map_skill_error(error) from error
        return ToolRuntimeResult(
            output=result.output,
            metrics=result.metrics,
        )

    async def _execute_process(
        self, request: ToolRuntimeRequest
    ) -> ToolRuntimeResult:
        started_at = monotonic()
        package_root, entry_path = validate_tool_entry(request)
        validate_network_grants(request.network)
        validate_sandbox_manifest(
            request,
            package_root,
            self._process_isolation,
        )
        if "process.execute" not in request.capabilities:
            raise ToolRuntimeError(
                "tool_permission_denied",
                "Process Tool requires process.execute",
            )
        if (
            self._process_isolation == "unavailable"
            or self._sandbox_executable is None
        ):
            raise ToolRuntimeError(
                "tool_sandbox_unavailable", "Tool sandbox is unavailable"
            )
        if request.execution_id in self._processes:
            raise ToolRuntimeError(
                "tool_execution_failed", "Tool execution is already running"
            )
        command = build_process_command(
            self._sandbox_executable,
            package_root,
            entry_path,
            request,
            self._process_isolation,
        )
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={
                "LANG": "C.UTF-8",
                "LC_ALL": "C.UTF-8",
                "REALMFLOW_TOOL_CONNECTORS": serialize_network_grants(
                    request.network
                ),
            },
            start_new_session=True,
        )
        self._processes[request.execution_id] = process
        try:
            payload = json.dumps(
                request.input,
                ensure_ascii=True,
                separators=(",", ":"),
            ).encode()
            try:
                stdout, _stderr, peak_rss = await asyncio.to_thread(
                    communicate_bounded,
                    process,
                    payload,
                    request.max_output_bytes + 1_024,
                    request.max_memory_mb * 1024 * 1024,
                    request.timeout_ms / 1000,
                )
            except OutputLimitExceededError as error:
                raise ToolRuntimeError(
                    "tool_output_limit", "Tool output limit exceeded"
                ) from error
            except TimeoutError as error:
                raise ToolRuntimeError(
                    "tool_timeout", "Tool execution timed out"
                ) from error
            except MemoryLimitExceededError as error:
                raise ToolRuntimeError(
                    "tool_memory_limit", "Tool memory limit exceeded"
                ) from error
            if request.execution_id in self._cancelled:
                raise ToolRuntimeError(
                    "tool_cancelled", "Tool execution was cancelled"
                )
            if process.returncode != 0:
                raise ToolRuntimeError(
                    "tool_execution_failed", "Tool process failed"
                )
            output = parse_output(stdout)
            output_bytes = encoded_size(output)
            if output_bytes > request.max_output_bytes:
                raise ToolRuntimeError(
                    "tool_output_limit", "Tool output limit exceeded"
                )
            return ToolRuntimeResult(
                output=output,
                metrics=SkillRuntimeMetrics(
                    duration_ms=elapsed_ms(started_at),
                    output_bytes=output_bytes,
                    peak_memory_bytes=peak_rss or None,
                ),
            )
        finally:
            self._processes.pop(request.execution_id, None)
            self._cancelled.discard(request.execution_id)


def validate_tool_entry(
    request: ToolRuntimeRequest,
) -> tuple[Path, Path]:
    try:
        package_root, entry_path = validate_entry_path(
            SkillRuntimeRequest(
                execution_id=request.execution_id,
                entry_type="python",
                package_root=request.package_root,
                entry_path=request.entry_path,
                input=request.input,
                capabilities=request.capabilities,
                scope_roots=request.scope_roots,
                network=request.network,
                timeout_ms=request.timeout_ms,
                max_memory_mb=request.max_memory_mb,
                max_output_bytes=request.max_output_bytes,
            )
        )
    except SkillRuntimeError as error:
        raise ToolRuntimeError(
            "tool_entry_unavailable", "Tool entry is unavailable"
        ) from error
    if not os.access(entry_path, os.X_OK):
        raise ToolRuntimeError(
            "tool_entry_unavailable", "Tool entry is unavailable"
        )
    return package_root, entry_path


def validate_sandbox_manifest(
    request: ToolRuntimeRequest,
    package_root: Path,
    platform_isolation: str = "sandbox-exec",
) -> None:
    manifest = request.manifest
    try:
        canonical_scope_roots = tuple(
            sorted(root.resolve(strict=True) for root in request.scope_roots)
        )
        canonical_package_root = package_root.resolve(strict=True)
        has_read = any(
            capability in request.capabilities
            for capability in ("filesystem.read", "repository.read")
        )
        has_write = any(
            capability in request.capabilities
            for capability in (
                "filesystem.write",
                "filesystem.delete",
                "repository.modify",
            )
        )
        expected_read_only = (
            (canonical_package_root, *canonical_scope_roots)
            if has_read and not has_write
            else (canonical_package_root,)
        )
        expected_read_write = canonical_scope_roots if has_write else ()
        expected_environment = (
            (
                "LANG",
                "LC_ALL",
                "PYTHONHASHSEED",
                *(
                    ("REALMFLOW_SKILL_CONNECTORS",)
                    if request.network
                    else ()
                ),
            )
            if request.runtime == "python"
            else (
                "LANG",
                "LC_ALL",
                *(
                    ("REALMFLOW_TOOL_CONNECTORS",)
                    if request.network
                    else ()
                ),
            )
        )
        expected_network = tuple(
            sorted(
                (
                    ToolSandboxNetworkTarget(
                        service=grant.service,
                        origin=(
                            f"http://127.0.0.1:"
                            f"{urlsplit(grant.url).port}"
                        ),
                        path_prefix=urlsplit(grant.url).path,
                    )
                    for grant in request.network
                ),
                key=lambda target: target.service,
            )
        )
        digest = hashlib.sha256(
            json.dumps(
                sandbox_manifest_payload(manifest),
                ensure_ascii=True,
                separators=(",", ":"),
                sort_keys=True,
            ).encode()
        ).hexdigest()
        if (
            manifest.schema_version != 1
            or manifest.execution_id != request.execution_id
            or manifest.enforcement != "enforced"
            or manifest.platform_isolation != platform_isolation
            or manifest.execution_level
            not in allowed_execution_levels(request.capabilities)
            or manifest.package_root.resolve(strict=True)
            != canonical_package_root
            or tuple(
                sorted(
                    root.resolve(strict=True)
                    for root in manifest.read_only_roots
                )
            )
            != tuple(sorted(expected_read_only))
            or tuple(
                sorted(
                    root.resolve(strict=True)
                    for root in manifest.read_write_roots
                )
            )
            != tuple(sorted(expected_read_write))
            or manifest.environment_variables != expected_environment
            or manifest.network_targets != expected_network
            or manifest.timeout_ms != request.timeout_ms
            or manifest.max_memory_mb != request.max_memory_mb
            or manifest.max_output_bytes != request.max_output_bytes
            or manifest.policy_digest != digest
        ):
            raise ValueError
    except (FileNotFoundError, OSError, ValueError):
        raise ToolRuntimeError(
            "tool_sandbox_manifest_invalid",
            "Tool sandbox manifest is invalid",
        ) from None


def allowed_execution_levels(
    capabilities: tuple[str, ...],
) -> set[str]:
    if any(
        capability in capabilities
        for capability in (
            "credential.use",
            "computer.control",
            "clipboard.write",
        )
    ):
        return {"external_side_effect"}
    if any(
        capability in capabilities
        for capability in ("network.connect", "connector.use")
    ):
        return {"controlled_network", "external_side_effect"}
    if any(
        capability in capabilities
        for capability in (
            "process.discover",
            "process.execute",
            "process.manage",
        )
    ):
        return {
            "controlled_process",
            "controlled_network",
            "external_side_effect",
        }
    if any(
        capability.startswith(("filesystem.", "repository."))
        for capability in capabilities
    ):
        return {
            "controlled_file",
            "controlled_process",
            "controlled_network",
            "external_side_effect",
        }
    return {
        "pure_function",
        "controlled_file",
        "controlled_process",
        "controlled_network",
        "external_side_effect",
    }


def sandbox_manifest_payload(
    manifest: ToolSandboxManifest,
) -> dict[str, object]:
    return {
        "schemaVersion": manifest.schema_version,
        "executionId": manifest.execution_id,
        "executionLevel": manifest.execution_level,
        "enforcement": manifest.enforcement,
        "platformIsolation": manifest.platform_isolation,
        "packageRoot": str(manifest.package_root),
        "readOnlyRoots": [
            str(root) for root in manifest.read_only_roots
        ],
        "readWriteRoots": [
            str(root) for root in manifest.read_write_roots
        ],
        "environmentVariables": list(
            manifest.environment_variables
        ),
        "networkTargets": [
            {
                "service": target.service,
                "origin": target.origin,
                "pathPrefix": target.path_prefix,
            }
            for target in manifest.network_targets
        ],
        "resources": {
            "timeoutMs": manifest.timeout_ms,
            "maxMemoryMb": manifest.max_memory_mb,
            "maxOutputBytes": manifest.max_output_bytes,
        },
    }


def build_process_command(
    sandbox_executable: str,
    package_root: Path,
    entry_path: Path,
    request: ToolRuntimeRequest,
    platform_isolation: str = "sandbox-exec",
) -> list[str]:
    interpreter = read_shebang_interpreter(entry_path)
    if platform_isolation == "bwrap":
        has_read = any(
            capability in request.capabilities
            for capability in ("filesystem.read", "repository.read")
        )
        has_write = any(
            capability in request.capabilities
            for capability in (
                "filesystem.write",
                "filesystem.delete",
                "repository.modify",
            )
        )
        return build_linux_sandbox_command(
            sandbox_executable=sandbox_executable,
            executable=entry_path,
            arguments=request.arguments,
            package_root=package_root,
            read_only_roots=(
                *((interpreter.parent.parent,) if interpreter else ()),
                *(request.scope_roots if has_read and not has_write else ()),
            ),
            read_write_roots=request.scope_roots if has_write else (),
        )
    profile = sandbox_profile(
        python_executable=Path(sys.executable).resolve(),
        runner=entry_path,
        package_root=package_root,
        capabilities=request.capabilities,
        scope_roots=request.scope_roots,
        network=request.network,
        additional_executables=(
            entry_path,
            *((interpreter,) if interpreter else ()),
        ),
        additional_readable=(
            *((interpreter.parent.parent,) if interpreter else ()),
        ),
    )
    return [
        sandbox_executable,
        "-p",
        profile,
        str(entry_path),
        *request.arguments,
    ]


def read_shebang_interpreter(entry_path: Path) -> Path | None:
    try:
        with entry_path.open("rb") as entry:
            first_line = entry.readline(4_096)
    except OSError as error:
        raise ToolRuntimeError(
            "tool_entry_unavailable", "Tool entry is unavailable"
        ) from error
    if not first_line.startswith(b"#!"):
        return None
    try:
        shebang = first_line[2:].decode("utf-8").strip()
    except UnicodeDecodeError as error:
        raise ToolRuntimeError(
            "tool_entry_unavailable", "Tool entry is unavailable"
        ) from error
    parts = shebang.split()
    if len(parts) != 1 or not parts[0].startswith("/"):
        raise ToolRuntimeError(
            "tool_entry_unavailable",
            "Tool entry requires an absolute direct interpreter",
        )
    interpreter = Path(parts[0])
    try:
        if not interpreter.is_file() or not os.access(interpreter, os.X_OK):
            raise OSError
        return interpreter
    except OSError as error:
        raise ToolRuntimeError(
            "tool_entry_unavailable", "Tool entry is unavailable"
        ) from error


def parse_output(stdout: bytes) -> dict[str, object]:
    try:
        output = json.loads(stdout)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ToolRuntimeError(
            "tool_output_invalid", "Tool returned invalid JSON"
        ) from error
    if not isinstance(output, dict):
        raise ToolRuntimeError(
            "tool_output_invalid", "Tool returned invalid JSON"
        )
    return output


def map_skill_error(error: SkillRuntimeError) -> ToolRuntimeError:
    mappings = {
        "skill_sandbox_unavailable": "tool_sandbox_unavailable",
        "skill_timeout": "tool_timeout",
        "skill_memory_limit": "tool_memory_limit",
        "skill_output_limit": "tool_output_limit",
    }
    return ToolRuntimeError(
        mappings.get(error.code, "tool_execution_failed"),
        str(error).replace("Skill", "Tool"),
    )
