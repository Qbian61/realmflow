import asyncio
import json
import os
import re
import selectors
import shutil
import signal
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from time import monotonic
from typing import Literal
from urllib.parse import urlsplit

from app.services.skill_runner import (
    EXECUTION_EXIT_CODE,
    MEMORY_EXIT_CODE,
    OUTPUT_EXIT_CODE,
    PROTOCOL_EXIT_CODE,
)


SkillEntryType = Literal["prompt", "python"]
SkillCapability = Literal[
    "filesystem.read",
    "filesystem.write",
    "process.execute",
    "repository.modify",
]

PROMPT_VARIABLE = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")
SCALAR_TYPES = (str, int, float, bool, type(None))


class SkillRuntimeError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class OutputLimitExceededError(Exception):
    pass


class MemoryLimitExceededError(Exception):
    pass


@dataclass(frozen=True)
class SkillNetworkGrant:
    service: str
    url: str
    token: str


@dataclass(frozen=True)
class SkillRuntimeRequest:
    execution_id: str
    entry_type: SkillEntryType
    package_root: Path
    entry_path: Path
    input: dict[str, object]
    capabilities: tuple[str, ...]
    scope_roots: tuple[Path, ...]
    network: tuple[SkillNetworkGrant, ...]
    timeout_ms: int
    max_memory_mb: int
    max_output_bytes: int
    arguments: tuple[str, ...] = ()


@dataclass(frozen=True)
class SkillRuntimeMetrics:
    duration_ms: int
    output_bytes: int
    peak_memory_bytes: int | None = None


@dataclass(frozen=True)
class SkillRuntimeResult:
    output: dict[str, object]
    metrics: SkillRuntimeMetrics


class SkillRuntime:
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
        self._processes: dict[str, subprocess.Popen[bytes]] = {}
        self._cancelled: set[str] = set()

    def capabilities(self) -> dict[str, str]:
        return {
            "platform": self._platform,
            "processIsolation": self._process_isolation,
        }

    async def execute(
        self, request: SkillRuntimeRequest
    ) -> SkillRuntimeResult:
        started_at = monotonic()
        package_root, entry_path = validate_entry_path(request)
        validate_network_grants(request.network)
        if request.entry_type == "prompt":
            output = render_prompt(entry_path, request.input)
            output_bytes = encoded_size(output)
            if output_bytes > request.max_output_bytes:
                raise SkillRuntimeError(
                    "skill_output_limit", "Skill output limit exceeded"
                )
            return SkillRuntimeResult(
                output=output,
                metrics=SkillRuntimeMetrics(
                    duration_ms=elapsed_ms(started_at),
                    output_bytes=output_bytes,
                ),
            )
        if request.entry_type != "python":
            raise SkillRuntimeError(
                "skill_execution_failed", "Unsupported Skill entry type"
            )
        if "process.execute" not in request.capabilities:
            raise SkillRuntimeError(
                "skill_execution_failed",
                "Python Skill requires process.execute",
            )
        if (
            self._process_isolation == "unavailable"
            or self._sandbox_executable is None
        ):
            raise SkillRuntimeError(
                "skill_sandbox_unavailable",
                "Python Skill sandbox is unavailable",
            )
        if request.execution_id in self._processes:
            raise SkillRuntimeError(
                "skill_execution_failed", "Skill execution is already running"
            )

        command = build_sandbox_command(
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
                "PYTHONHASHSEED": "0",
                "REALMFLOW_SKILL_CONNECTORS": serialize_network_grants(
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
            ).encode("utf-8")
            try:
                stdout, _stderr, peak_rss_bytes = await asyncio.to_thread(
                    communicate_bounded,
                    process,
                    payload,
                    request.max_output_bytes + 1_024,
                    request.max_memory_mb * 1024 * 1024,
                    request.timeout_ms / 1000,
                )
            except OutputLimitExceededError as error:
                raise SkillRuntimeError(
                    "skill_output_limit", "Skill output limit exceeded"
                ) from error
            except TimeoutError as error:
                raise SkillRuntimeError(
                    "skill_timeout", "Skill execution timed out"
                ) from error
            except MemoryLimitExceededError as error:
                raise SkillRuntimeError(
                    "skill_memory_limit", "Skill memory limit exceeded"
                ) from error

            if request.execution_id in self._cancelled:
                raise SkillRuntimeError(
                    "skill_execution_failed", "Skill execution cancelled"
                )
            if len(stdout) > request.max_output_bytes + 1_024:
                raise SkillRuntimeError(
                    "skill_output_limit", "Skill output limit exceeded"
                )
            classify_exit(process.returncode)
            try:
                envelope = json.loads(stdout)
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise SkillRuntimeError(
                    "skill_execution_failed",
                    "Skill returned invalid JSON",
                ) from error
            if (
                not isinstance(envelope, dict)
                or set(envelope) != {"output", "peakMemoryBytes"}
                or not isinstance(envelope["output"], dict)
                or not isinstance(envelope["peakMemoryBytes"], int)
                or isinstance(envelope["peakMemoryBytes"], bool)
                or envelope["peakMemoryBytes"] < 0
            ):
                raise SkillRuntimeError(
                    "skill_execution_failed",
                    "Skill returned an invalid result",
                )
            output = envelope["output"]
            output_bytes = encoded_size(output)
            if output_bytes > request.max_output_bytes:
                raise SkillRuntimeError(
                    "skill_output_limit", "Skill output limit exceeded"
                )
            return SkillRuntimeResult(
                output=output,
                metrics=SkillRuntimeMetrics(
                    duration_ms=elapsed_ms(started_at),
                    output_bytes=output_bytes,
                    peak_memory_bytes=(
                        max(envelope["peakMemoryBytes"], peak_rss_bytes)
                        if max(envelope["peakMemoryBytes"], peak_rss_bytes) > 0
                        else None
                    ),
                ),
            )
        finally:
            self._processes.pop(request.execution_id, None)
            self._cancelled.discard(request.execution_id)

    def is_running(self, execution_id: str) -> bool:
        process = self._processes.get(execution_id)
        return process is not None and process.returncode is None

    async def cancel(self, execution_id: str) -> bool:
        process = self._processes.get(execution_id)
        if process is None or process.returncode is not None:
            return False
        self._cancelled.add(execution_id)
        await asyncio.to_thread(terminate_process, process)
        return True


def validate_entry_path(
    request: SkillRuntimeRequest,
) -> tuple[Path, Path]:
    try:
        package_root = request.package_root.resolve(strict=True)
        entry_path = request.entry_path.resolve(strict=True)
        entry_path.relative_to(package_root)
    except (FileNotFoundError, OSError, ValueError) as error:
        raise SkillRuntimeError(
            "skill_execution_failed", "Skill entry is unavailable"
        ) from error
    if not package_root.is_dir() or not entry_path.is_file():
        raise SkillRuntimeError(
            "skill_execution_failed", "Skill entry is unavailable"
        )
    return package_root, entry_path


def render_prompt(
    entry_path: Path, input_value: dict[str, object]
) -> dict[str, object]:
    try:
        template = entry_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise SkillRuntimeError(
            "skill_execution_failed", "Skill prompt cannot be read"
        ) from error

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in input_value:
            raise SkillRuntimeError(
                "skill_execution_failed",
                f"Missing prompt variable: {name}",
            )
        value = input_value[name]
        if not isinstance(value, SCALAR_TYPES):
            raise SkillRuntimeError(
                "skill_execution_failed",
                f"Prompt variable must be scalar: {name}",
            )
        if value is True:
            return "true"
        if value is False:
            return "false"
        if value is None:
            return "null"
        return str(value)

    return {"text": PROMPT_VARIABLE.sub(replace, template)}


def build_sandbox_command(
    sandbox_executable: str,
    package_root: Path,
    entry_path: Path,
    request: SkillRuntimeRequest,
    platform_isolation: str = "sandbox-exec",
) -> list[str]:
    python_executable = Path(sys.executable).resolve()
    runner = Path(__file__).with_name("skill_runner.py").resolve()
    if platform_isolation == "bwrap":
        can_read = (
            "filesystem.read" in request.capabilities
            or "filesystem.write" in request.capabilities
        )
        can_write = "filesystem.write" in request.capabilities
        return build_linux_sandbox_command(
            sandbox_executable=sandbox_executable,
            executable=python_executable,
            arguments=(
                "-I",
                str(runner),
                str(entry_path),
                str(request.max_memory_mb),
                str(request.max_output_bytes),
                *request.arguments,
            ),
            package_root=package_root,
            read_only_roots=(
                runner.parent,
                python_executable.parent.parent,
                *(request.scope_roots if can_read and not can_write else ()),
            ),
            read_write_roots=request.scope_roots if can_write else (),
        )
    profile = sandbox_profile(
        python_executable=python_executable,
        runner=runner,
        package_root=package_root,
        capabilities=request.capabilities,
        scope_roots=request.scope_roots,
        network=request.network,
    )
    return [
        sandbox_executable,
        "-p",
        profile,
        str(python_executable),
        "-I",
        str(runner),
        str(entry_path),
        str(request.max_memory_mb),
        str(request.max_output_bytes),
        *request.arguments,
    ]


def build_linux_sandbox_command(
    *,
    sandbox_executable: str,
    executable: Path,
    arguments: tuple[str, ...],
    package_root: Path,
    read_only_roots: tuple[Path, ...],
    read_write_roots: tuple[Path, ...],
) -> list[str]:
    canonical_package = package_root.resolve(strict=True)
    read_only = unique_paths(
        (
            canonical_package,
            *(root.resolve(strict=True) for root in read_only_roots),
        )
    )
    read_write = unique_paths(
        root.resolve(strict=True) for root in read_write_roots
    )
    mounts = [
        root
        for root in (
            Path("/usr"),
            Path("/bin"),
            Path("/sbin"),
            Path("/lib"),
            Path("/lib64"),
            Path("/etc"),
        )
        if root.exists()
    ]
    command = [
        sandbox_executable,
        "--die-with-parent",
        "--new-session",
        "--unshare-pid",
        "--unshare-net",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
    ]
    custom_roots = unique_paths((*read_only, *read_write))
    for directory in parent_directories(custom_roots):
        command.extend(("--dir", str(directory)))
    for root in mounts:
        command.extend(("--ro-bind", str(root), str(root)))
    for root in read_only:
        command.extend(("--ro-bind", str(root), str(root)))
    for root in read_write:
        command.extend(("--bind", str(root), str(root)))
    command.extend(
        (
            "--chdir",
            str(canonical_package),
            "--",
            str(executable.resolve()),
            *arguments,
        )
    )
    return command


def process_isolation(
    platform: str,
    sandbox_executable: str | None,
) -> str:
    if sandbox_executable is None:
        return "unavailable"
    if platform == "darwin":
        return "sandbox-exec"
    if platform.startswith("linux"):
        return "bwrap"
    return "unavailable"


def unique_paths(paths) -> tuple[Path, ...]:
    return tuple(dict.fromkeys(paths))


def parent_directories(paths: tuple[Path, ...]) -> tuple[Path, ...]:
    parents: set[Path] = set()
    for path in paths:
        current = path.parent
        while current != current.parent:
            parents.add(current)
            current = current.parent
    return tuple(sorted(parents, key=lambda path: (len(path.parts), str(path))))


def sandbox_profile(
    *,
    python_executable: Path,
    runner: Path,
    package_root: Path,
    capabilities: tuple[str, ...],
    scope_roots: tuple[Path, ...],
    network: tuple[SkillNetworkGrant, ...],
    additional_executables: tuple[Path, ...] = (),
    additional_readable: tuple[Path, ...] = (),
) -> str:
    python_root = python_executable.parent.parent
    process_executables = (
        *python_process_executables(python_executable),
        *(path.resolve() for path in additional_executables),
    )
    readable = [
        python_root,
        Path("/System"),
        Path("/usr/lib"),
        Path("/private/etc"),
        package_root,
        runner,
        *additional_readable,
    ]
    if (
        "filesystem.read" in capabilities
        or "filesystem.write" in capabilities
    ):
        readable.extend(root.resolve(strict=True) for root in scope_roots)
    clauses = [
        "(version 1)",
        "(allow default)",
        "(deny network*)",
        "(deny process-fork)",
        "(deny process-exec)",
        "(deny file-read*)",
        "(deny file-write*)",
        '(allow file-read-data (literal "/"))',
        "(allow file-read-metadata)",
    ]
    for executable in process_executables:
        clauses.append(
            "(allow process-exec (literal "
            f"{sandbox_string(str(executable))}))"
        )
    for grant in network:
        port = urlsplit(grant.url).port
        clauses.append(
            "(allow network-outbound "
            f'(remote ip "localhost:{port}"))'
        )
    for path in readable:
        operation = "literal" if path.is_file() else "subpath"
        clauses.append(
            f"(allow file-read* ({operation} {sandbox_string(str(path))}))"
        )
    if "filesystem.write" in capabilities:
        for root_value in scope_roots:
            root = root_value.resolve(strict=True)
            git_root = root / ".git"
            clauses.append(
                "(allow file-write* (require-all "
                f"(subpath {sandbox_string(str(root))}) "
                "(require-not "
                f"(subpath {sandbox_string(str(git_root))}))))"
            )
    return "\n".join(clauses)


def python_process_executables(
    python_executable: Path,
) -> tuple[Path, ...]:
    executable = python_executable.resolve()
    framework_child = (
        executable.parent.parent
        / "Resources"
        / "Python.app"
        / "Contents"
        / "MacOS"
        / "Python"
    )
    if framework_child.is_file() and os.access(framework_child, os.X_OK):
        return executable, framework_child.resolve()
    return (executable,)


def sandbox_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def validate_network_grants(
    grants: tuple[SkillNetworkGrant, ...],
) -> None:
    services: set[str] = set()
    for grant in grants:
        parsed = urlsplit(grant.url)
        if (
            not re.fullmatch(
                r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}",
                grant.service,
            )
            or grant.service in services
            or not grant.token
            or parsed.scheme != "http"
            or parsed.hostname != "127.0.0.1"
            or parsed.port is None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or parsed.path
            != f"/v1/skills/connectors/{grant.service}"
        ):
            raise SkillRuntimeError(
                "skill_execution_failed",
                "Skill Connector grant is invalid",
            )
        services.add(grant.service)


def serialize_network_grants(
    grants: tuple[SkillNetworkGrant, ...],
) -> str:
    return json.dumps(
        [
            {
                "service": grant.service,
                "url": grant.url,
                "token": grant.token,
            }
            for grant in grants
        ],
        ensure_ascii=True,
        separators=(",", ":"),
    )


def classify_exit(return_code: int | None) -> None:
    if return_code == 0:
        return
    if return_code == MEMORY_EXIT_CODE or return_code == -signal.SIGKILL:
        raise SkillRuntimeError(
            "skill_memory_limit", "Skill memory limit exceeded"
        )
    if return_code == OUTPUT_EXIT_CODE:
        raise SkillRuntimeError(
            "skill_output_limit", "Skill output limit exceeded"
        )
    if return_code in {
        PROTOCOL_EXIT_CODE,
        EXECUTION_EXIT_CODE,
    }:
        raise SkillRuntimeError(
            "skill_execution_failed", "Skill execution failed"
        )
    raise SkillRuntimeError(
        "skill_execution_failed", "Skill sandbox rejected execution"
    )


def terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.returncode is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    except PermissionError:
        try:
            process.kill()
        except ProcessLookupError:
            return
    process.wait()


def communicate_bounded(
    process: subprocess.Popen[bytes],
    payload: bytes,
    max_bytes: int,
    max_memory_bytes: int,
    timeout_seconds: float,
) -> tuple[bytes, bytes, int]:
    if process.stdin is None or process.stdout is None or process.stderr is None:
        terminate_process(process)
        raise SkillRuntimeError(
            "skill_execution_failed", "Skill process channel is unavailable"
        )
    stdout_chunks: list[bytes] = []
    stderr_chunks: list[bytes] = []
    total_bytes = 0
    peak_rss_bytes = 0
    deadline = monotonic() + timeout_seconds
    selector = selectors.DefaultSelector()
    try:
        process.stdin.write(payload)
        process.stdin.close()
        selector.register(process.stdout, selectors.EVENT_READ, stdout_chunks)
        selector.register(process.stderr, selectors.EVENT_READ, stderr_chunks)
        while selector.get_map():
            rss_bytes = process_rss_bytes(process.pid)
            peak_rss_bytes = max(peak_rss_bytes, rss_bytes)
            if rss_bytes > max_memory_bytes:
                raise MemoryLimitExceededError
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise TimeoutError
            for key, _ in selector.select(min(remaining, 0.02)):
                chunk = os.read(key.fd, 4_096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise OutputLimitExceededError
                key.data.append(chunk)
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise TimeoutError
        process.wait(timeout=remaining)
        return (
            b"".join(stdout_chunks),
            b"".join(stderr_chunks),
            peak_rss_bytes,
        )
    except (
        MemoryLimitExceededError,
        OutputLimitExceededError,
        TimeoutError,
        subprocess.TimeoutExpired,
    ):
        terminate_process(process)
        if monotonic() >= deadline:
            raise TimeoutError
        raise
    finally:
        selector.close()


def process_rss_bytes(pid: int) -> int:
    result = subprocess.run(
        ["/bin/ps", "-o", "rss=", "-p", str(pid)],
        capture_output=True,
        check=False,
        timeout=0.2,
        env={"LANG": "C", "LC_ALL": "C"},
    )
    if result.returncode != 0:
        return 0
    try:
        return int(result.stdout.strip() or b"0") * 1024
    except ValueError:
        return 0


def encoded_size(value: dict[str, object]) -> int:
    return len(
        json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode(
            "utf-8"
        )
    )


def elapsed_ms(started_at: float) -> int:
    return max(0, round((monotonic() - started_at) * 1000))
