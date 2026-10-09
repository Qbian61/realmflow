import asyncio
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.services.skill_runtime import (
    SkillNetworkGrant,
    SkillRuntime,
    SkillRuntimeError,
    SkillRuntimeRequest,
    build_linux_sandbox_command,
    python_process_executables,
)


def write_entry(package_root: Path, name: str, content: str) -> Path:
    entry = package_root / name
    entry.write_text(content, encoding="utf-8")
    return entry


def request_for(
    package_root: Path,
    entry: Path,
    *,
    execution_id: str = "execution-1",
    entry_type: str = "python",
    input_value: dict[str, object] | None = None,
    capabilities: tuple[str, ...] = ("process.execute",),
    scope_roots: tuple[Path, ...] = (),
    network: tuple[SkillNetworkGrant, ...] = (),
    timeout_ms: int = 2_000,
    max_memory_mb: int = 128,
    max_output_bytes: int = 16_384,
) -> SkillRuntimeRequest:
    return SkillRuntimeRequest(
        execution_id=execution_id,
        entry_type=entry_type,
        package_root=package_root,
        entry_path=entry,
        input=input_value or {},
        capabilities=capabilities,
        scope_roots=scope_roots,
        network=network,
        timeout_ms=timeout_ms,
        max_memory_mb=max_memory_mb,
        max_output_bytes=max_output_bytes,
    )


def run(runtime: SkillRuntime, request: SkillRuntimeRequest):
    return asyncio.run(runtime.execute(request))


def assert_error(
    runtime: SkillRuntime,
    request: SkillRuntimeRequest,
    code: str,
) -> SkillRuntimeError:
    with pytest.raises(SkillRuntimeError) as captured:
        run(runtime, request)
    assert captured.value.code == code
    return captured.value


def test_prompt_renders_top_level_scalar_variables(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "prompt.md",
        "Issue {{title}} has priority {{priority}} and enabled={{enabled}}.",
    )

    result = run(
        SkillRuntime(),
        request_for(
            package_root,
            entry,
            entry_type="prompt",
            input_value={
                "title": "Checkout",
                "priority": 3,
                "enabled": True,
            },
            capabilities=(),
        ),
    )

    assert result.output == {
        "text": "Issue Checkout has priority 3 and enabled=true."
    }
    assert result.metrics.output_bytes == len(
        json.dumps(result.output, separators=(",", ":")).encode()
    )
    assert result.metrics.duration_ms >= 0


@pytest.mark.parametrize(
    ("input_value", "message"),
    [
        ({}, "Missing prompt variable: title"),
        ({"title": ["nested"]}, "Prompt variable must be scalar: title"),
    ],
)
def test_prompt_rejects_missing_or_non_scalar_variables(
    tmp_path: Path,
    input_value: dict[str, object],
    message: str,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(package_root, "prompt.md", "{{title}}")

    error = assert_error(
        SkillRuntime(),
        request_for(
            package_root,
            entry,
            entry_type="prompt",
            input_value=input_value,
            capabilities=(),
        ),
        "skill_execution_failed",
    )

    assert str(error) == message


def test_entry_must_be_a_canonical_file_inside_the_package(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    outside = write_entry(tmp_path, "outside.md", "secret")

    error = assert_error(
        SkillRuntime(),
        request_for(
            package_root,
            outside,
            entry_type="prompt",
            capabilities=(),
        ),
        "skill_execution_failed",
    )

    assert str(outside) not in str(error)


def test_python_entry_returns_one_json_object(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "def main(payload):\n"
        "    return {'answer': payload['left'] + payload['right']}\n",
    )

    result = run(
        SkillRuntime(),
        request_for(
            package_root,
            entry,
            input_value={"left": 2, "right": 3},
        ),
    )

    assert result.output == {"answer": 5}
    assert result.metrics.peak_memory_bytes is None or (
        result.metrics.peak_memory_bytes > 0
    )


@pytest.mark.parametrize(
    ("source", "expected_code"),
    [
        ("def main(payload):\n    return ['not-an-object']\n", "skill_execution_failed"),
        ("raise RuntimeError('private detail')\n", "skill_execution_failed"),
    ],
)
def test_python_rejects_invalid_protocol_and_entry_failure(
    tmp_path: Path,
    source: str,
    expected_code: str,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(package_root, "main.py", source)

    error = assert_error(
        SkillRuntime(),
        request_for(package_root, entry),
        expected_code,
    )

    assert str(entry) not in str(error)


def test_python_timeout_is_classified_and_process_is_terminated(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "def main(payload):\n"
        "    while True:\n"
        "        pass\n",
    )

    assert_error(
        SkillRuntime(),
        request_for(package_root, entry, timeout_ms=100),
        "skill_timeout",
    )


def test_python_output_limit_is_classified(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "def main(payload):\n"
        "    return {'value': 'x' * 10000}\n",
    )

    assert_error(
        SkillRuntime(),
        request_for(package_root, entry, max_output_bytes=128),
        "skill_output_limit",
    )


def test_python_stream_output_is_stopped_at_the_byte_limit(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "import os\n"
        "def main(payload):\n"
        "    while True:\n"
        "        os.write(1, b'x' * 4096)\n",
    )

    assert_error(
        SkillRuntime(),
        request_for(
            package_root,
            entry,
            timeout_ms=500,
            max_output_bytes=128,
        ),
        "skill_output_limit",
    )


def test_python_memory_limit_is_classified(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "def main(payload):\n"
        "    value = bytearray(256 * 1024 * 1024)\n"
        "    return {'size': len(value)}\n",
    )

    assert_error(
        SkillRuntime(),
        request_for(package_root, entry, max_memory_mb=64),
        "skill_memory_limit",
    )


def test_python_native_memory_is_stopped_at_the_rss_limit(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "import mmap\n"
        "def main(payload):\n"
        "    size = 64 * 1024 * 1024\n"
        "    value = mmap.mmap(-1, size)\n"
        "    for offset in range(0, size, 4096):\n"
        "        value[offset:offset + 1] = b'x'\n"
        "    while True:\n"
        "        pass\n",
    )

    assert_error(
        SkillRuntime(),
        request_for(
            package_root,
            entry,
            timeout_ms=1_000,
            max_memory_mb=32,
        ),
        "skill_memory_limit",
    )


def test_python_environment_is_scrubbed(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("REALMFLOW_TEST_SECRET", "must-not-leak")
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "import os\n"
        "def main(payload):\n"
        "    return {'secret': os.environ.get('REALMFLOW_TEST_SECRET')}\n",
    )

    result = run(SkillRuntime(), request_for(package_root, entry))

    assert result.output == {"secret": None}


def test_python_framework_launcher_allows_only_its_fixed_child_executable(
    tmp_path: Path,
) -> None:
    version_root = tmp_path / "Python.framework" / "Versions" / "3.11"
    wrapper = version_root / "bin" / "python3.11"
    child = (
        version_root
        / "Resources"
        / "Python.app"
        / "Contents"
        / "MacOS"
        / "Python"
    )
    wrapper.parent.mkdir(parents=True)
    child.parent.mkdir(parents=True)
    wrapper.write_text("", encoding="utf-8")
    child.write_text("", encoding="utf-8")
    wrapper.chmod(0o755)
    child.chmod(0o755)

    assert python_process_executables(wrapper) == (
        wrapper.resolve(),
        child.resolve(),
    )
    child.unlink()
    assert python_process_executables(wrapper) == (wrapper.resolve(),)


@pytest.mark.skipif(sys.platform != "darwin", reason="macOS sandbox contract")
def test_python_can_read_and_write_only_inside_authorized_scope(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    scope_root = tmp_path / "scope"
    package_root.mkdir()
    scope_root.mkdir()
    source = write_entry(scope_root, "input.txt", "approved")
    target = scope_root / "output.txt"
    entry = write_entry(
        package_root,
        "main.py",
        "from pathlib import Path\n"
        "def main(payload):\n"
        "    value = Path(payload['source']).read_text()\n"
        "    Path(payload['target']).write_text(value.upper())\n"
        "    return {'value': value}\n",
    )

    result = run(
        SkillRuntime(),
        request_for(
            package_root,
            entry,
            input_value={"source": str(source), "target": str(target)},
            capabilities=(
                "process.execute",
                "filesystem.read",
                "filesystem.write",
            ),
            scope_roots=(scope_root,),
        ),
    )

    assert result.output == {"value": "approved"}
    assert target.read_text(encoding="utf-8") == "APPROVED"


@pytest.mark.skipif(sys.platform != "darwin", reason="macOS sandbox contract")
@pytest.mark.parametrize(
    "source",
    [
        (
            "from pathlib import Path\n"
            "def main(payload):\n"
            "    return {'value': Path(payload['outside']).read_text()}\n"
        ),
        (
            "from pathlib import Path\n"
            "def main(payload):\n"
            "    Path(payload['gitFile']).write_text('changed')\n"
            "    return {}\n"
        ),
        (
            "import socket\n"
            "def main(payload):\n"
            "    socket.create_connection(('example.com', 80), timeout=1)\n"
            "    return {}\n"
        ),
        (
            "import subprocess\n"
            "def main(payload):\n"
            "    subprocess.run(['/usr/bin/true'], check=True)\n"
            "    return {}\n"
        ),
    ],
)
def test_python_sandbox_denies_scope_escape_git_network_and_children(
    tmp_path: Path,
    source: str,
) -> None:
    package_root = tmp_path / "package"
    scope_root = tmp_path / "scope"
    git_root = scope_root / ".git"
    package_root.mkdir()
    git_root.mkdir(parents=True)
    outside = write_entry(tmp_path, "outside.txt", "secret")
    git_file = write_entry(git_root, "config", "original")
    entry = write_entry(package_root, "main.py", source)

    assert_error(
        SkillRuntime(),
        request_for(
            package_root,
            entry,
            input_value={
                "outside": str(outside),
                "gitFile": str(git_file),
            },
            capabilities=(
                "process.execute",
                "filesystem.read",
                "filesystem.write",
            ),
            scope_roots=(scope_root,),
        ),
        "skill_execution_failed",
    )
    assert git_file.read_text(encoding="utf-8") == "original"


@pytest.mark.skipif(sys.platform != "darwin", reason="macOS sandbox contract")
def test_python_sandbox_allows_only_supplied_loopback_connector_grant(
    tmp_path: Path,
) -> None:
    requests: list[tuple[str, str | None]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            requests.append((self.path, self.headers.get("Authorization")))
            body = b'{"value":"proxied"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format: str, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "import json\n"
        "import os\n"
        "from urllib.request import Request, urlopen\n"
        "def main(payload):\n"
        "    grants = json.loads(os.environ['REALMFLOW_SKILL_CONNECTORS'])\n"
        "    grant = grants[0]\n"
        "    request = Request(grant['url'] + '/status')\n"
        "    request.add_header('Authorization', 'Bearer ' + grant['token'])\n"
        "    with urlopen(request, timeout=2) as response:\n"
        "        return json.load(response)\n",
    )
    port = server.server_address[1]

    try:
        result = run(
            SkillRuntime(),
            request_for(
                package_root,
                entry,
                network=(
                    SkillNetworkGrant(
                        service="docs",
                        url=(
                            f"http://127.0.0.1:{port}/"
                            "v1/skills/connectors/docs"
                        ),
                        token="one-run-grant",
                    ),
                ),
            ),
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

    assert result.output == {"value": "proxied"}
    assert requests == [
        (
            "/v1/skills/connectors/docs/status",
            "Bearer one-run-grant",
        )
    ]


def test_python_refuses_to_run_without_a_supported_sandbox(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "def main(payload):\n    return {}\n",
    )

    assert_error(
        SkillRuntime(sandbox_executable=None),
        request_for(package_root, entry),
        "skill_sandbox_unavailable",
    )


def test_runtime_reports_linux_bwrap_and_fails_closed_on_windows() -> None:
    assert SkillRuntime(
        sandbox_executable="/usr/bin/bwrap",
        platform="linux",
    ).capabilities() == {
        "platform": "linux",
        "processIsolation": "bwrap",
    }
    assert SkillRuntime(
        sandbox_executable="C:\\sandbox.exe",
        platform="win32",
    ).capabilities() == {
        "platform": "win32",
        "processIsolation": "unavailable",
    }


def test_linux_bwrap_command_isolates_network_and_mounts_only_declared_roots(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    readable = tmp_path / "readable"
    writable = tmp_path / "writable"
    package_root.mkdir()
    readable.mkdir()
    writable.mkdir()

    command = build_linux_sandbox_command(
        sandbox_executable="/usr/bin/bwrap",
        executable=Path("/usr/bin/python3"),
        arguments=("-I", "/runtime/runner.py"),
        package_root=package_root,
        read_only_roots=(readable,),
        read_write_roots=(writable,),
    )

    assert command[0] == "/usr/bin/bwrap"
    assert "--die-with-parent" in command
    assert "--new-session" in command
    assert "--unshare-net" in command
    assert ["--ro-bind", str(readable), str(readable)] == command[
        command.index(str(readable)) - 1 : command.index(str(readable)) + 2
    ]
    assert ["--bind", str(writable), str(writable)] == command[
        command.index(str(writable)) - 1 : command.index(str(writable)) + 2
    ]
    assert command[-4:] == [
        "--",
        "/usr/bin/python3",
        "-I",
        "/runtime/runner.py",
    ]


def test_python_execution_can_be_cancelled(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(
        package_root,
        "main.py",
        "def main(payload):\n"
        "    while True:\n"
        "        pass\n",
    )

    async def execute() -> None:
        runtime = SkillRuntime()
        task = asyncio.create_task(
            runtime.execute(
                request_for(
                    package_root,
                    entry,
                    execution_id="cancel-me",
                    timeout_ms=10_000,
                )
            )
        )
        for _ in range(100):
            if runtime.is_running("cancel-me"):
                break
            await asyncio.sleep(0.01)
        assert await runtime.cancel("cancel-me") is True
        with pytest.raises(SkillRuntimeError) as captured:
            await task
        assert captured.value.code == "skill_execution_failed"
        assert str(captured.value) == "Skill execution cancelled"

    asyncio.run(execute())


def test_skill_endpoint_is_authenticated_and_strict(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_entry(package_root, "prompt.md", "Hello {{name}}")
    payload = {
        "executionId": "execution-api",
        "entryType": "prompt",
        "packageRoot": str(package_root),
        "entryPath": str(entry),
        "input": {"name": "RealmFlow"},
        "capabilities": [],
        "scopeRoots": [],
        "network": [
            {
                "service": "docs",
                "url": (
                    "http://127.0.0.1:43210/"
                    "v1/skills/connectors/docs"
                ),
                "token": "one-run-grant",
            }
        ],
        "timeoutMs": 1000,
        "maxMemoryMb": 64,
        "maxOutputBytes": 1024,
    }
    app = create_app(auth_token="session-secret")

    unauthorized = TestClient(app).post(
        "/api/v1/skills/execute",
        json=payload,
    )
    with TestClient(
        app,
        headers={"Authorization": "Bearer session-secret"},
    ) as client:
        response = client.post("/api/v1/skills/execute", json=payload)
        invalid = client.post(
            "/api/v1/skills/execute",
            json={**payload, "unknown": True},
        )
        invalid_network = client.post(
            "/api/v1/skills/execute",
            json={
                **payload,
                "network": [
                    {
                        "service": "docs",
                        "url": (
                            "https://docs.example.com/"
                            "v1/skills/connectors/docs"
                        ),
                        "token": "must-not-leave-main",
                    }
                ],
            },
        )

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    assert response.json()["output"] == {"text": "Hello RealmFlow"}
    assert set(response.json()) == {"output", "metrics"}
    assert invalid.status_code == 422
    assert invalid_network.status_code == 422
