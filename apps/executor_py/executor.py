import contextlib
import ctypes
import io
import json
import os
import runpy
import re
import shlex
import subprocess
import sys
import time
import traceback
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LEGACY_EXEC_ROOT = ROOT / "workspace" / "exec"
EXEC_ROOT_ENV = str(os.environ.get("REGION_AI_EXEC_ROOT") or "").strip()
if EXEC_ROOT_ENV:
    EXEC_ROOT = Path(EXEC_ROOT_ENV)
    if not EXEC_ROOT.is_absolute():
        EXEC_ROOT = (ROOT / EXEC_ROOT).resolve()
else:
    EXEC_ROOT = LEGACY_EXEC_ROOT
REQ_DIR = EXEC_ROOT / "requests"
RES_DIR = EXEC_ROOT / "results"
QUARANTINE_DIR = REQ_DIR / "_quarantine"
TRACEBACK_MAX_CHARS = 8000
MAX_PATCH_TEXT_CHARS = 262144
MAX_PATCH_FILES = 32
MAX_PATCH_FILE_BYTES = 262144
STDERR_SAMPLE_MAX = 512
MAX_FILE_WRITE_FILES = 20
MAX_FILE_WRITE_FILE_BYTES = 262144
MAX_FILE_WRITE_TOTAL_BYTES = 1048576
MAX_ARCHIVE_FILES_DEFAULT = 200
MAX_ARCHIVE_TOTAL_BYTES_DEFAULT = 10485760


def log(msg: str) -> None:
    print(f"[executor] {msg}", file=sys.stderr, flush=True)


def ensure_dirs() -> None:
    REQ_DIR.mkdir(parents=True, exist_ok=True)
    RES_DIR.mkdir(parents=True, exist_ok=True)
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)


def move_to_quarantine(path: Path, reason: str) -> bool:
    ts = time.strftime("%Y%m%d_%H%M%S")
    dst_dir = QUARANTINE_DIR / ts
    try:
        dst_dir.mkdir(parents=True, exist_ok=True)
        dst = dst_dir / path.name
        if dst.exists():
            dst = dst_dir / f"{path.stem}_{int(time.time() * 1000)}{path.suffix}"
        path.replace(dst)
        log(f"quarantine_moved src={path} dst={dst} reason={reason}")
        return True
    except Exception as e:
        log(f"quarantine_warn src={path} reason={reason} error={e}")
        return False


def _decode_request_file(path: Path) -> tuple[str | None, bool]:
    raw = path.read_bytes()
    if len(raw) == 0:
        move_to_quarantine(path, "empty_file")
        return None, False

    has_bom = raw.startswith(b"\xef\xbb\xbf")
    if has_bom:
        raw = raw[3:]

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        move_to_quarantine(path, "utf8_decode_error")
        return None, False

    if has_bom and not text.lstrip().startswith("{"):
        move_to_quarantine(path, "bom_and_unexpected_prefix")
        return None, False

    return text, has_bom


def load_request_with_guard(path: Path) -> dict | None:
    if path.suffix.lower() != ".json":
        move_to_quarantine(path, "unexpected_extension")
        return None

    first_text, has_bom = _decode_request_file(path)
    if first_text is None:
        return None

    for attempt in range(2):
        try:
            req = json.loads(first_text)
            if has_bom:
                # Rewrite without BOM once validated.
                path.write_text(first_text, encoding="utf-8")
            return req
        except Exception as e:
            if attempt == 0:
                time.sleep(0.1)
                second_text, _ = _decode_request_file(path)
                if second_text is None:
                    return None
                first_text = second_text
                continue
            move_to_quarantine(path, f"json_parse_error:{e}")
            return None
    return None


def write_result(run_id: str, payload: dict) -> None:
    out = dict(payload)
    files = out.get("files")
    if isinstance(files, list):
        normalized: list[str] = []
        for item in files:
            rel = str(item or "").replace("\\", "/").strip()
            if not rel:
                continue
            if rel.startswith("/") or rel.startswith("../") or "/../" in rel or ":" in rel:
                # absolute/traversal-like entry is rejected to keep artifact contract safe.
                continue
            normalized.append(rel)
        out["files"] = normalized
    out["run_id"] = run_id
    out["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    tmp = RES_DIR / f"{run_id}.json.tmp"
    dst = RES_DIR / f"{run_id}.json"
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, dst)


def merge_request(req: dict) -> dict:
    merged = dict(req or {})
    args = merged.get("args")
    if isinstance(args, dict):
        merged.update(args)
    return merged


def split_command(command: str) -> list[str]:
    def unquote_once(arg: str) -> str:
        if len(arg) >= 2 and arg[0] == arg[-1] and arg[0] in ('"', "'"):
            return arg[1:-1]
        return arg

    if os.name != "nt":
        return [unquote_once(a) for a in shlex.split(command)]

    argc = ctypes.c_int()
    command_line_to_argv_w = ctypes.windll.shell32.CommandLineToArgvW
    command_line_to_argv_w.argtypes = [ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_int)]
    command_line_to_argv_w.restype = ctypes.POINTER(ctypes.c_wchar_p)

    local_free = ctypes.windll.kernel32.LocalFree
    local_free.argtypes = [ctypes.c_void_p]
    local_free.restype = ctypes.c_void_p

    argv_ptr = command_line_to_argv_w(command, ctypes.byref(argc))
    if not argv_ptr:
        raise OSError("CommandLineToArgvW failed")
    try:
        return [unquote_once(argv_ptr[i]) for i in range(argc.value)]
    finally:
        local_free(argv_ptr)


def kill_process_tree(proc: subprocess.Popen) -> None:
    if os.name == "nt":
        with contextlib.suppress(Exception):
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
    else:
        with contextlib.suppress(Exception):
            proc.kill()


def run_command(req: dict) -> dict:
    cmd = str(req.get("command") or "").strip()
    if not cmd:
        return {"exitCode": 1, "timedOut": False, "stdout": "", "stderr": "missing command"}

    cwd = req.get("cwd") or str(ROOT)
    timeout_ms = int(req.get("timeout_ms") or 300000)
    timeout_s = max(1.0, min(timeout_ms / 1000.0, 1800.0))

    run_id = str(req.get("run_id") or "").strip()
    child_env = os.environ.copy()
    if run_id:
        child_env["REGION_AI_RUN_ID"] = run_id

    try:
        argv = split_command(cmd)
        p = subprocess.Popen(
            argv,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=child_env,
        )
        try:
            stdout, stderr = p.communicate(timeout=timeout_s)
            return {
                "exitCode": int(p.returncode or 0),
                "timedOut": False,
                "stdout": stdout or "",
                "stderr": stderr or "",
            }
        except subprocess.TimeoutExpired:
            kill_process_tree(p)
            stdout, stderr = p.communicate()
            return {
                "exitCode": 124,
                "timedOut": True,
                "stdout": stdout or "",
                "stderr": stderr or "",
            }
    except Exception:
        return {"exitCode": 1, "timedOut": False, "stdout": "", "stderr": traceback.format_exc()}


def run_python_inproc(req: dict) -> dict:
    module = str(req.get("module") or "").strip()
    code_src = req.get("code")
    if not module and not code_src:
        return {"exitCode": 1, "timedOut": False, "stdout": "", "stderr": "missing module or code"}

    module_args = req.get("module_args")
    if not isinstance(module_args, list):
        module_args = []
    cwd = req.get("cwd")

    out_buf = io.StringIO()
    err_buf = io.StringIO()
    exit_code = 0
    old_argv = sys.argv[:]
    old_cwd = os.getcwd()
    try:
        if cwd:
            os.chdir(str(cwd))
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            if module:
                sys.argv = [module, *[str(x) for x in module_args]]
                runpy.run_module(module, run_name="__main__")
            else:
                sys.argv = ["__main__"]
                g = {"__name__": "__main__"}
                compiled = compile(str(code_src), "<python_inproc>", "exec")
                exec(compiled, g, g)
    except SystemExit as e:
        try:
            exit_code = int(e.code) if e.code is not None else 0
        except Exception:
            exit_code = 1
    except Exception:
        exit_code = 1
        tb = traceback.format_exc()
        if len(tb) > TRACEBACK_MAX_CHARS:
            tb = tb[:TRACEBACK_MAX_CHARS] + "\n...[truncated]"
        err_buf.write(tb)
    finally:
        sys.argv = old_argv
        os.chdir(old_cwd)

    return {"exitCode": exit_code, "timedOut": False, "stdout": out_buf.getvalue(), "stderr": err_buf.getvalue()}


def _normalize_patch_target(raw: str) -> str:
    p = str(raw or "").strip()
    if p.startswith("a/") or p.startswith("b/"):
        p = p[2:]
    p = p.replace("\\", "/").strip()
    if not p:
        raise ValueError("empty patch target path")
    if p.startswith("/") or p.startswith("\\"):
        raise ValueError(f"absolute path rejected: {p}")
    if p.startswith("//") or p.startswith("\\\\"):
        raise ValueError(f"UNC path rejected: {p}")
    if len(p) >= 2 and p[1] == ":":
        raise ValueError(f"absolute drive path rejected: {p}")
    parts = [x for x in p.split("/") if x not in ("", ".")]
    if any(x == ".." for x in parts):
        raise ValueError(f"traversal path rejected: {p}")
    return "/".join(parts)


def _resolve_workspace_root(req: dict) -> Path:
    raw = str(req.get("workspace_root") or os.environ.get("REGION_AI_WORKSPACE") or (ROOT / "workspace")).strip()
    ws = Path(raw)
    if not ws.is_absolute():
        ws = (ROOT / ws).resolve()
    return ws.resolve()


def _parse_unified_patch(text: str) -> list[dict]:
    lines = text.splitlines()
    files: list[dict] = []
    i = 0
    while i < len(lines):
        if not lines[i].startswith("--- "):
            i += 1
            continue
        old_path = lines[i][4:].strip().split("\t", 1)[0].strip()
        i += 1
        if i >= len(lines) or not lines[i].startswith("+++ "):
            raise ValueError("invalid unified patch: missing +++ header")
        new_path = lines[i][4:].strip().split("\t", 1)[0].strip()
        i += 1
        hunks: list[dict] = []
        while i < len(lines):
            line = lines[i]
            if line.startswith("--- "):
                break
            if not line.startswith("@@ "):
                i += 1
                continue
            m = re.match(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            if not m:
                raise ValueError(f"invalid hunk header: {line}")
            old_start = int(m.group(1))
            old_count = int(m.group(2) or "1")
            new_start = int(m.group(3))
            new_count = int(m.group(4) or "1")
            i += 1
            h_lines: list[str] = []
            while i < len(lines):
                s = lines[i]
                if s.startswith("@@ ") or s.startswith("--- "):
                    break
                if s.startswith("\\ No newline at end of file"):
                    i += 1
                    continue
                if s and s[0] in (" ", "+", "-"):
                    h_lines.append(s)
                    i += 1
                    continue
                break
            hunks.append(
                {
                    "old_start": old_start,
                    "old_count": old_count,
                    "new_start": new_start,
                    "new_count": new_count,
                    "lines": h_lines,
                }
            )
        if not hunks:
            raise ValueError("invalid unified patch: no hunks")
        files.append({"old_path": old_path, "new_path": new_path, "hunks": hunks})
    if not files:
        raise ValueError("invalid unified patch: no file section")
    if len(files) > MAX_PATCH_FILES:
        raise ValueError(f"too many patched files: {len(files)} > {MAX_PATCH_FILES}")
    return files


def _apply_file_patch(original: str, hunks: list[dict]) -> str:
    src = original.splitlines()
    out: list[str] = []
    pos = 0
    for h in hunks:
        start = int(h["old_start"]) - 1
        if start < 0:
            start = 0
        if start < pos or start > len(src):
            raise ValueError(f"hunk position out of range: {start + 1}")
        out.extend(src[pos:start])
        pos = start
        for row in h["lines"]:
            op = row[0]
            val = row[1:]
            if op == " ":
                if pos >= len(src) or src[pos] != val:
                    raise ValueError("patch context mismatch")
                out.append(src[pos])
                pos += 1
            elif op == "-":
                if pos >= len(src) or src[pos] != val:
                    raise ValueError("patch remove mismatch")
                pos += 1
            elif op == "+":
                out.append(val)
            else:
                raise ValueError(f"unsupported patch row: {row}")
    out.extend(src[pos:])
    if not out:
        return ""
    return "\n".join(out) + "\n"


def run_patch_apply(req: dict) -> dict:
    def make_error(
        *,
        reason_key: str,
        message: str,
        error_code: str,
        tool_exit_code: int = 1,
    ) -> dict:
        sample = str(message or "")
        note = ""
        if len(sample) > STDERR_SAMPLE_MAX:
            sample = sample[:STDERR_SAMPLE_MAX]
            note = "stderr_truncated"
        return {
            "exitCode": int(tool_exit_code),
            "timedOut": False,
            "stdout": "",
            "stderr": str(message or ""),
            "files": [],
            "error_code": error_code,
            "reason_key": reason_key,
            "stderr_sample": sample,
            "tool_exit_code": int(tool_exit_code),
            "note": note,
        }

    patch_format = str(req.get("patch_format") or "").strip().lower()
    patch_text = str(req.get("patch_text") or "")
    run_id = str(req.get("run_id") or "").strip()
    if patch_format != "unified":
        return make_error(reason_key="PATCH_FORMAT_INVALID", message="patch_apply requires patch_format=unified", error_code="ERR_TASK")
    if not patch_text.strip():
        return make_error(reason_key="PATCH_TEXT_MISSING", message="patch_apply requires patch_text", error_code="ERR_TASK")
    if len(patch_text) > MAX_PATCH_TEXT_CHARS:
        return make_error(reason_key="PATCH_TEXT_TOO_LARGE", message="patch_apply text exceeds limit", error_code="ERR_TASK")

    workspace_root = _resolve_workspace_root(req)
    workspace_root.mkdir(parents=True, exist_ok=True)
    normalized_text = patch_text.replace("__RUN_ID__", run_id)

    try:
        file_patches = _parse_unified_patch(normalized_text)
    except Exception as e:
        return make_error(reason_key="PATCH_PARSE_INVALID", message=f"patch_apply parse error: {e}", error_code="ERR_TASK")

    applied_files: list[str] = []
    try:
        for fp in file_patches:
            old_path = str(fp["old_path"])
            new_path = str(fp["new_path"])
            if old_path == "/dev/null":
                target_rel = _normalize_patch_target(new_path)
            elif new_path == "/dev/null":
                target_rel = _normalize_patch_target(old_path)
            else:
                old_rel = _normalize_patch_target(old_path)
                new_rel = _normalize_patch_target(new_path)
                if old_rel != new_rel:
                    raise ValueError(f"rename is not supported: {old_rel} -> {new_rel}")
                target_rel = new_rel

            target_abs = (workspace_root / Path(target_rel)).resolve()
            try:
                target_abs.relative_to(workspace_root)
            except Exception:
                raise ValueError(f"outside workspace rejected: {target_rel}")

            before = ""
            if old_path != "/dev/null":
                if not target_abs.exists():
                    raise ValueError(f"target file not found for patch: {target_rel}")
                before = target_abs.read_text(encoding="utf-8")
            updated = _apply_file_patch(before, list(fp["hunks"]))
            if new_path == "/dev/null":
                if target_abs.exists():
                    target_abs.unlink()
                if target_rel not in applied_files:
                    applied_files.append(target_rel)
                continue

            encoded = updated.encode("utf-8")
            if len(encoded) > MAX_PATCH_FILE_BYTES:
                raise ValueError(f"patched file too large: {target_rel}")
            target_abs.parent.mkdir(parents=True, exist_ok=True)
            target_abs.write_text(updated, encoding="utf-8")
            if target_rel not in applied_files:
                applied_files.append(target_rel)
    except Exception as e:
        msg = str(e or "")
        error_code = "ERR_EXEC"
        reason_key = "PATCH_APPLY_FAILED"
        if "path rejected" in msg or "outside workspace rejected" in msg:
            error_code = "ERR_TASK"
            reason_key = "PATCH_PATH_POLICY_VIOLATION"
        return make_error(reason_key=reason_key, message=f"patch_apply failed: {msg}", error_code=error_code)

    return {
        "exitCode": 0,
        "timedOut": False,
        "stdout": f"PATCH_APPLIED files={len(applied_files)}",
        "stderr": "",
        "files": applied_files,
    }


def run_file_write(req: dict) -> dict:
    def make_error(
        *,
        reason_key: str,
        message: str,
        error_code: str,
        failed_path: str = "",
        tool_exit_code: int = 1,
    ) -> dict:
        sample = str(message or "")
        note = ""
        if len(sample) > STDERR_SAMPLE_MAX:
            sample = sample[:STDERR_SAMPLE_MAX]
            note = "stderr_truncated"
        return {
            "exitCode": int(tool_exit_code),
            "timedOut": False,
            "stdout": "",
            "stderr": str(message or ""),
            "files": [],
            "error_code": error_code,
            "reason_key": reason_key,
            "failed_path": str(failed_path or ""),
            "stderr_sample": sample,
            "tool_exit_code": int(tool_exit_code),
            "note": note,
        }

    files_in = req.get("files")
    if not isinstance(files_in, list):
        return make_error(reason_key="FILE_WRITE_FILES_MISSING", message="file_write requires files[]", error_code="ERR_TASK")
    if len(files_in) < 1:
        return make_error(reason_key="FILE_WRITE_FILES_EMPTY", message="file_write files must not be empty", error_code="ERR_TASK")
    if len(files_in) > MAX_FILE_WRITE_FILES:
        return make_error(reason_key="FILE_WRITE_FILES_TOO_MANY", message="file_write files exceed limit", error_code="ERR_TASK")

    workspace_root = _resolve_workspace_root(req)
    workspace_root.mkdir(parents=True, exist_ok=True)
    run_id = str(req.get("run_id") or "").strip()
    run_files_raw = req.get("run_files_dir") or (workspace_root / "runs" / run_id / "files")
    run_files_root = Path(run_files_raw)
    if not run_files_root.is_absolute():
        run_files_root = (workspace_root / run_files_root).resolve()
    run_files_root = run_files_root.resolve()
    try:
        run_files_root.relative_to(workspace_root)
    except Exception:
        return make_error(reason_key="FILE_WRITE_ARTIFACT_PATH_INVALID", message="run_files_dir must be under workspace_root", error_code="ERR_TASK")
    run_files_root.mkdir(parents=True, exist_ok=True)

    normalized_items: list[dict] = []
    total_bytes = 0
    for i, row in enumerate(files_in):
        if not isinstance(row, dict):
            return make_error(reason_key="FILE_WRITE_ITEM_INVALID", message=f"files[{i}] must be object", error_code="ERR_TASK")
        rel_raw = str(row.get("path") or "")
        try:
            rel_path = _normalize_patch_target(rel_raw)
        except Exception as e:
            return make_error(reason_key="FILE_WRITE_PATH_INVALID", message=f"invalid path at files[{i}]: {e}", error_code="ERR_TASK", failed_path=rel_raw)

        text = row.get("text")
        if not isinstance(text, str):
            return make_error(reason_key="FILE_WRITE_TEXT_INVALID", message=f"files[{i}].text must be string", error_code="ERR_TASK", failed_path=rel_path)
        if "\x00" in text:
            return make_error(reason_key="FILE_WRITE_TEXT_INVALID", message=f"files[{i}].text includes NUL", error_code="ERR_TASK", failed_path=rel_path)

        mode = str(row.get("mode") or "overwrite").strip().lower()
        if mode not in ("overwrite", "append"):
            return make_error(reason_key="FILE_WRITE_MODE_INVALID", message=f"files[{i}].mode must be overwrite|append", error_code="ERR_TASK", failed_path=rel_path)

        encoded = text.encode("utf-8")
        if len(encoded) > MAX_FILE_WRITE_FILE_BYTES:
            return make_error(reason_key="FILE_WRITE_LIMIT_EXCEEDED", message=f"files[{i}] exceeds max file bytes", error_code="ERR_TASK", failed_path=rel_path)
        total_bytes += len(encoded)
        if total_bytes > MAX_FILE_WRITE_TOTAL_BYTES:
            return make_error(reason_key="FILE_WRITE_LIMIT_EXCEEDED", message="file_write total bytes exceed limit", error_code="ERR_TASK")

        normalized_items.append({"path": rel_path, "text": text, "mode": mode})

    artifacts_list: list[str] = []
    written_manifest: list[dict] = []
    try:
        for item in normalized_items:
            rel_path = str(item["path"])
            text = str(item["text"])
            mode = str(item["mode"])

            target_abs = (workspace_root / Path(rel_path)).resolve()
            try:
                target_abs.relative_to(workspace_root)
            except Exception:
                return make_error(reason_key="FILE_WRITE_PATH_INVALID", message=f"path escaped workspace: {rel_path}", error_code="ERR_TASK", failed_path=rel_path)
            target_abs.parent.mkdir(parents=True, exist_ok=True)
            if mode == "append":
                with target_abs.open("a", encoding="utf-8", newline="") as f:
                    f.write(text)
            else:
                target_abs.write_text(text, encoding="utf-8")

            artifact_rel = f"written/{rel_path}".replace("\\", "/")
            artifact_abs = (run_files_root / Path(artifact_rel)).resolve()
            artifact_abs.parent.mkdir(parents=True, exist_ok=True)
            artifact_abs.write_text(target_abs.read_text(encoding="utf-8"), encoding="utf-8")
            if artifact_rel not in artifacts_list:
                artifacts_list.append(artifact_rel)
            written_manifest.append(
                {
                    "path": rel_path,
                    "mode": mode,
                    "bytes": len(text.encode("utf-8")),
                    "artifact_path": artifact_rel,
                }
            )

        manifest_obj = {
            "kind": "file_write",
            "run_id": run_id,
            "files": written_manifest,
        }
        manifest_rel = "written_manifest.json"
        manifest_abs = (run_files_root / manifest_rel).resolve()
        manifest_abs.write_text(json.dumps(manifest_obj, ensure_ascii=False, indent=2), encoding="utf-8")
        artifacts_list.append(manifest_rel)
    except OSError as e:
        return make_error(reason_key="FILE_WRITE_IO_ERROR", message=f"file_write io error: {e}", error_code="ERR_EXEC")
    except Exception as e:
        return make_error(reason_key="FILE_WRITE_FAILED", message=f"file_write failed: {e}", error_code="ERR_EXEC")

    artifacts_list = sorted(set(artifacts_list))
    return {
        "exitCode": 0,
        "timedOut": False,
        "stdout": f"FILE_WRITE_OK files={len(normalized_items)}",
        "stderr": "",
        "files": artifacts_list,
    }


def _normalize_archive_pattern(raw: str) -> str:
    p = str(raw or "").strip().replace("\\", "/")
    if not p:
        raise ValueError("empty input pattern")
    if p.startswith("/") or p.startswith("\\"):
        raise ValueError(f"absolute path rejected: {p}")
    if p.startswith("//") or p.startswith("\\\\"):
        raise ValueError(f"UNC path rejected: {p}")
    if len(p) >= 2 and p[1] == ":":
        raise ValueError(f"absolute drive path rejected: {p}")
    parts = [x for x in p.split("/") if x not in ("", ".")]
    if any(x == ".." for x in parts):
        raise ValueError(f"traversal path rejected: {p}")
    return "/".join(parts)


def run_archive_zip(req: dict) -> dict:
    def make_error(
        *,
        reason_key: str,
        message: str,
        error_code: str,
        failed_path: str = "",
        tool_exit_code: int = 1,
    ) -> dict:
        sample = str(message or "")
        note = ""
        if len(sample) > STDERR_SAMPLE_MAX:
            sample = sample[:STDERR_SAMPLE_MAX]
            note = "stderr_truncated"
        return {
            "exitCode": int(tool_exit_code),
            "timedOut": False,
            "stdout": "",
            "stderr": str(message or ""),
            "files": [],
            "error_code": error_code,
            "reason_key": reason_key,
            "failed_path": str(failed_path or ""),
            "stderr_sample": sample,
            "tool_exit_code": int(tool_exit_code),
            "note": note,
        }

    inputs = req.get("inputs")
    if not isinstance(inputs, list):
        return make_error(reason_key="ARCHIVE_ZIP_INPUTS_MISSING", message="archive_zip requires inputs[]", error_code="ERR_TASK")
    if len(inputs) < 1:
        return make_error(reason_key="ARCHIVE_ZIP_INPUTS_EMPTY", message="archive_zip inputs must not be empty", error_code="ERR_TASK")

    output = req.get("output")
    if not isinstance(output, dict):
        return make_error(reason_key="ARCHIVE_ZIP_OUTPUT_MISSING", message="archive_zip requires output", error_code="ERR_TASK")

    zip_path_raw = str(output.get("zip_path") or "")
    manifest_path_raw = str(output.get("manifest_path") or "")
    try:
        zip_path = _normalize_archive_pattern(zip_path_raw)
        manifest_path = _normalize_archive_pattern(manifest_path_raw)
    except Exception as e:
        return make_error(reason_key="ARCHIVE_ZIP_OUTPUT_PATH_INVALID", message=f"archive_zip invalid output path: {e}", error_code="ERR_TASK")

    workspace_root = _resolve_workspace_root(req)
    workspace_root.mkdir(parents=True, exist_ok=True)
    run_id = str(req.get("run_id") or "").strip()
    run_files_raw = req.get("run_files_dir") or (workspace_root / "runs" / run_id / "files")
    run_files_root = Path(run_files_raw)
    if not run_files_root.is_absolute():
        run_files_root = (workspace_root / run_files_root).resolve()
    run_files_root = run_files_root.resolve()
    try:
        run_files_root.relative_to(workspace_root)
    except Exception:
        return make_error(reason_key="ARCHIVE_ZIP_ARTIFACT_PATH_INVALID", message="run_files_dir must be under workspace_root", error_code="ERR_TASK")
    run_files_root.mkdir(parents=True, exist_ok=True)

    options = req.get("options") if isinstance(req.get("options"), dict) else {}
    follow_symlinks = bool(options.get("follow_symlinks", False))
    limits = req.get("limits") if isinstance(req.get("limits"), dict) else {}
    try:
        max_files = int(limits.get("max_files", MAX_ARCHIVE_FILES_DEFAULT))
        max_total_bytes = int(limits.get("max_total_bytes", MAX_ARCHIVE_TOTAL_BYTES_DEFAULT))
    except Exception:
        return make_error(reason_key="ARCHIVE_ZIP_LIMITS_INVALID", message="archive_zip limits must be integers", error_code="ERR_TASK")
    if max_files < 1 or max_total_bytes < 1:
        return make_error(reason_key="ARCHIVE_ZIP_LIMITS_INVALID", message="archive_zip limits must be >= 1", error_code="ERR_TASK")

    normalized_inputs: list[str] = []
    for i, p in enumerate(inputs):
        try:
            normalized_inputs.append(_normalize_archive_pattern(str(p or "")))
        except Exception as e:
            return make_error(reason_key="ARCHIVE_ZIP_INPUT_PATH_INVALID", message=f"invalid inputs[{i}]: {e}", error_code="ERR_TASK", failed_path=str(p or ""))

    gathered: dict[str, int] = {}
    symlink_skipped = 0
    try:
        for pat in normalized_inputs:
            has_glob = any(ch in pat for ch in "*?[")
            candidates: list[Path] = []
            if has_glob:
                candidates = list(workspace_root.glob(pat))
            else:
                exact = (workspace_root / Path(pat)).resolve()
                candidates = [exact] if exact.exists() else []

            for c in candidates:
                abs_c = c.resolve()
                try:
                    abs_c.relative_to(workspace_root)
                except Exception:
                    return make_error(reason_key="ARCHIVE_ZIP_INPUT_RESOLVE_FAILED", message=f"input escaped workspace: {pat}", error_code="ERR_EXEC", failed_path=pat)

                if abs_c.is_symlink() and not follow_symlinks:
                    symlink_skipped += 1
                    continue

                if abs_c.is_dir():
                    for root, dirs, files in os.walk(abs_c, topdown=True, followlinks=follow_symlinks):
                        root_path = Path(root).resolve()
                        try:
                            root_path.relative_to(workspace_root)
                        except Exception:
                            return make_error(reason_key="ARCHIVE_ZIP_INPUT_RESOLVE_FAILED", message=f"walk escaped workspace: {root}", error_code="ERR_EXEC", failed_path=pat)

                        if not follow_symlinks:
                            safe_dirs: list[str] = []
                            for d in dirs:
                                d_path = (root_path / d)
                                if d_path.is_symlink():
                                    symlink_skipped += 1
                                    continue
                                safe_dirs.append(d)
                            dirs[:] = safe_dirs

                        for f in files:
                            f_abs = (root_path / f).resolve()
                            try:
                                rel = f_abs.relative_to(workspace_root).as_posix()
                            except Exception:
                                return make_error(reason_key="ARCHIVE_ZIP_INPUT_RESOLVE_FAILED", message=f"file escaped workspace: {f_abs}", error_code="ERR_EXEC", failed_path=pat)
                            src_file = Path(root_path / f)
                            if src_file.is_symlink() and not follow_symlinks:
                                symlink_skipped += 1
                                continue
                            gathered[rel] = int(f_abs.stat().st_size)
                elif abs_c.is_file():
                    rel = abs_c.relative_to(workspace_root).as_posix()
                    gathered[rel] = int(abs_c.stat().st_size)
    except OSError as e:
        return make_error(reason_key="ARCHIVE_ZIP_INPUT_RESOLVE_FAILED", message=f"archive_zip input read error: {e}", error_code="ERR_EXEC")
    except Exception as e:
        return make_error(reason_key="ARCHIVE_ZIP_INPUT_RESOLVE_FAILED", message=f"archive_zip input resolve failed: {e}", error_code="ERR_EXEC")

    if not gathered:
        return make_error(reason_key="ARCHIVE_ZIP_NO_FILES", message="archive_zip matched no files", error_code="ERR_EXEC")

    selected: list[tuple[str, int]] = []
    total_bytes = 0
    for rel in sorted(gathered.keys()):
        size = int(gathered[rel])
        if len(selected) + 1 > max_files:
            return make_error(reason_key="ARCHIVE_ZIP_LIMIT_EXCEEDED", message=f"archive_zip max_files exceeded: {max_files}", error_code="ERR_EXEC", failed_path=rel)
        if total_bytes + size > max_total_bytes:
            return make_error(reason_key="ARCHIVE_ZIP_LIMIT_EXCEEDED", message=f"archive_zip max_total_bytes exceeded: {max_total_bytes}", error_code="ERR_EXEC", failed_path=rel)
        selected.append((rel, size))
        total_bytes += size

    zip_abs = (run_files_root / Path(zip_path)).resolve()
    manifest_abs = (run_files_root / Path(manifest_path)).resolve()
    try:
        zip_abs.relative_to(run_files_root)
        manifest_abs.relative_to(run_files_root)
    except Exception:
        return make_error(reason_key="ARCHIVE_ZIP_OUTPUT_PATH_INVALID", message="output path escaped run_files_dir", error_code="ERR_TASK")

    try:
        zip_abs.parent.mkdir(parents=True, exist_ok=True)
        manifest_abs.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_abs, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for rel, _size in selected:
                src = (workspace_root / Path(rel)).resolve()
                zf.write(src, arcname=rel)
    except OSError as e:
        return make_error(reason_key="ZIP_CREATE_FAILED", message=f"archive_zip write error: {e}", error_code="ERR_EXEC", failed_path=zip_path)
    except Exception as e:
        return make_error(reason_key="ZIP_CREATE_FAILED", message=f"archive_zip failed: {e}", error_code="ERR_EXEC", failed_path=zip_path)

    manifest_obj = {
        "kind": "archive_zip",
        "run_id": run_id,
        "inputs": normalized_inputs,
        "files": [{"rel_path": rel, "size_bytes": size} for rel, size in selected],
        "total_files": len(selected),
        "total_bytes": total_bytes,
        "truncated": False,
        "note": "symlink_skipped" if symlink_skipped > 0 else "",
    }
    try:
        manifest_abs.write_text(json.dumps(manifest_obj, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        return make_error(reason_key="MANIFEST_WRITE_FAILED", message=f"archive_zip manifest write failed: {e}", error_code="ERR_EXEC", failed_path=manifest_path)

    return {
        "exitCode": 0,
        "timedOut": False,
        "stdout": f"ARCHIVE_ZIP_OK files={len(selected)}",
        "stderr": "",
        "files": sorted(set([zip_path.replace("\\", "/"), manifest_path.replace("\\", "/")])),
    }


def process_request(path: Path) -> None:
    req = load_request_with_guard(path)
    if req is None:
        return
    req = merge_request(req)

    run_id = str(req.get("run_id") or path.stem)
    mode = str(req.get("mode") or "command")
    log(f"processing run_id={run_id} mode={mode}")

    if mode == "python_inproc":
        res = run_python_inproc(req)
    elif mode == "patch_apply":
        res = run_patch_apply(req)
    elif mode == "file_write":
        res = run_file_write(req)
    elif mode == "archive_zip":
        res = run_archive_zip(req)
    else:
        res = run_command(req)

    write_result(run_id, res)
    log(f"result_written run_id={run_id} exit={res.get('exitCode')} timeout={res.get('timedOut')}")
    try:
        path.unlink()
    except Exception:
        log(f"request_delete_failed run_id={run_id} path={path}")


def main() -> None:
    ensure_dirs()
    log(f"start exec_root={EXEC_ROOT} req_dir={REQ_DIR} res_dir={RES_DIR}")
    while True:
        reqs = sorted(REQ_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime)
        if reqs:
            process_request(reqs[0])
            continue
        time.sleep(0.5)


if __name__ == "__main__":
    main()
