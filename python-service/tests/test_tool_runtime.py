import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.services.tool_runtime import (
    ToolRuntime,
    ToolRuntimeError,
    ToolRuntimeRequest,
    ToolSandboxManifest,
)


def request_for(
    package_root: Path,
    entry_path: Path,
    *,
    runtime: str = "process",
    arguments: tuple[str, ...] = (),
    capabilities: tuple[str, ...] = ("process.execute",),
    timeout_ms: int = 2_000,
    max_output_bytes: int = 16_384,
) -> ToolRuntimeRequest:
    return ToolRuntimeRequest(
        execution_id="execution-1",
        manifest=ToolSandboxManifest(
            schema_version=1,
            execution_id="execution-1",
            execution_level="controlled_process",
            enforcement="enforced",
            platform_isolation="sandbox-exec",
            package_root=package_root,
            read_only_roots=(package_root,),
            read_write_roots=(),
            environment_variables=("LANG", "LC_ALL"),
            network_targets=(),
            timeout_ms=timeout_ms,
            max_memory_mb=128,
            max_output_bytes=max_output_bytes,
            policy_digest=sandbox_manifest(
                package_root,
                execution_id="execution-1",
                timeout_ms=timeout_ms,
                max_output_bytes=max_output_bytes,
            )["policyDigest"],
        ),
        runtime=runtime,
        package_root=package_root,
        entry_path=entry_path,
        arguments=arguments,
        input={"value": 7},
        capabilities=capabilities,
        scope_roots=(),
        network=(),
        timeout_ms=timeout_ms,
        max_memory_mb=128,
        max_output_bytes=max_output_bytes,
    )


def run(runtime: ToolRuntime, request: ToolRuntimeRequest):
    return asyncio.run(runtime.execute(request))


def write_process_entry(package_root: Path, source: str) -> Path:
    entry = package_root / "main"
    entry.write_text(f"#!{sys.executable}\n{source}", encoding="utf-8")
    entry.chmod(0o700)
    return entry


def sandbox_manifest(
    package_root: Path,
    *,
    execution_id: str = "tool-execution-1",
    timeout_ms: int = 2_000,
    max_memory_mb: int = 128,
    max_output_bytes: int = 4_096,
) -> dict[str, object]:
    manifest: dict[str, object] = {
        "schemaVersion": 1,
        "executionId": execution_id,
        "executionLevel": "controlled_process",
        "enforcement": "enforced",
        "platformIsolation": "sandbox-exec",
        "packageRoot": str(package_root),
        "readOnlyRoots": [str(package_root)],
        "readWriteRoots": [],
        "environmentVariables": ["LANG", "LC_ALL"],
        "networkTargets": [],
        "resources": {
            "timeoutMs": timeout_ms,
            "maxMemoryMb": max_memory_mb,
            "maxOutputBytes": max_output_bytes,
        },
    }
    manifest["policyDigest"] = hashlib.sha256(
        json.dumps(
            manifest,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
    ).hexdigest()
    return manifest


def test_process_runtime_uses_argv_and_json_protocol(tmp_path: Path) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    marker = tmp_path / "must-not-exist"
    entry = write_process_entry(
        package_root,
        "import json, sys\n"
        "payload = json.load(sys.stdin)\n"
        "print(json.dumps({'value': payload['value'], 'arg': sys.argv[1]}))\n",
    )

    result = run(
        ToolRuntime(),
        request_for(
            package_root,
            entry,
            arguments=(f"$(touch {marker})",),
        ),
    )

    assert result.output == {
        "value": 7,
        "arg": f"$(touch {marker})",
    }
    assert not marker.exists()
    assert result.metrics.output_bytes == len(
        json.dumps(result.output, separators=(",", ":")).encode()
    )


def test_runtime_reports_when_os_process_isolation_is_unavailable() -> None:
    assert ToolRuntime(sandbox_executable=None).capabilities() == {
        "platform": sys.platform,
        "processIsolation": "unavailable",
    }


def test_runtime_reports_linux_bwrap_and_fails_closed_on_windows() -> None:
    assert ToolRuntime(
        sandbox_executable="/usr/bin/bwrap",
        platform="linux",
    ).capabilities() == {
        "platform": "linux",
        "processIsolation": "bwrap",
    }
    assert ToolRuntime(
        sandbox_executable="C:\\sandbox.exe",
        platform="win32",
    ).capabilities() == {
        "platform": "win32",
        "processIsolation": "unavailable",
    }


def test_process_runtime_requires_capability_and_contained_entry(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_process_entry(package_root, "print('{}')\n")

    with pytest.raises(ToolRuntimeError) as missing_capability:
        run(
            ToolRuntime(),
            request_for(package_root, entry, capabilities=()),
        )
    assert missing_capability.value.code == "tool_permission_denied"

    outside = write_process_entry(tmp_path, "print('{}')\n")
    with pytest.raises(ToolRuntimeError) as escaped:
        run(ToolRuntime(), request_for(package_root, outside))
    assert escaped.value.code == "tool_entry_unavailable"


def test_process_runtime_classifies_timeout_and_output_limit(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    slow = write_process_entry(
        package_root,
        "while True:\n"
        "    pass\n",
    )
    with pytest.raises(ToolRuntimeError) as timeout:
        run(
            ToolRuntime(),
            request_for(package_root, slow, timeout_ms=20),
        )
    assert timeout.value.code == "tool_timeout"

    noisy = write_process_entry(
        package_root,
        "import json\n"
        "print(json.dumps({'value': 'x' * 10000}))\n",
    )
    with pytest.raises(ToolRuntimeError) as output_limit:
        run(
            ToolRuntime(),
            request_for(package_root, noisy, max_output_bytes=100),
        )
    assert output_limit.value.code == "tool_output_limit"


def test_tool_http_contract_executes_and_cancels(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    entry = write_process_entry(
        package_root,
        "import json, sys\n"
        "payload = json.load(sys.stdin)\n"
        "print(json.dumps({'value': payload['value'], 'arg': sys.argv[1]}))\n",
    )
    client = TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    )

    response = client.post(
        "/api/v1/tools/execute",
        json={
            "executionId": "tool-execution-1",
            "manifest": sandbox_manifest(package_root),
            "runtime": "process",
            "packageRoot": str(package_root),
            "entryPath": str(entry),
            "arguments": ["literal"],
            "input": {"value": 7},
            "capabilities": ["process.execute"],
            "scopeRoots": [],
            "network": [],
            "timeoutMs": 2000,
            "maxMemoryMb": 128,
            "maxOutputBytes": 4096,
        },
    )
    cancellation = client.post(
        "/api/v1/tools/tool-execution-1/cancel"
    )

    assert response.status_code == 200
    assert response.json()["output"] == {"value": 7, "arg": "literal"}
    assert response.json()["metrics"]["outputBytes"] > 0
    assert cancellation.status_code == 200
    assert cancellation.json() == {
        "executionId": "tool-execution-1",
        "cancelled": False,
    }


def test_tool_http_contract_rejects_a_tampered_manifest_before_execution(
    tmp_path: Path,
) -> None:
    package_root = tmp_path / "package"
    package_root.mkdir()
    marker = tmp_path / "must-not-exist"
    entry = write_process_entry(
        package_root,
        f"from pathlib import Path\n"
        f"Path({str(marker)!r}).write_text('escaped')\n"
        "print('{}')\n",
    )
    manifest = sandbox_manifest(package_root)
    manifest["resources"] = {
        **manifest["resources"],
        "timeoutMs": 3_000,
    }
    client = TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    )

    response = client.post(
        "/api/v1/tools/execute",
        json={
            "executionId": "tool-execution-1",
            "manifest": manifest,
            "runtime": "process",
            "packageRoot": str(package_root),
            "entryPath": str(entry),
            "arguments": [],
            "input": {},
            "capabilities": ["process.execute"],
            "scopeRoots": [],
            "network": [],
            "timeoutMs": 2_000,
            "maxMemoryMb": 128,
            "maxOutputBytes": 4_096,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == (
        "tool_sandbox_manifest_invalid"
    )
    assert not marker.exists()
