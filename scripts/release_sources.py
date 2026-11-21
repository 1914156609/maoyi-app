"""Canonical fingerprints for the three sibling projects and build context."""
from pathlib import Path
import hashlib

SOURCE_SCOPE = "runtime-build-v2-three-projects"
APP_DIRS = ("src", "deploy", "scripts", "server", "cloud")
APP_ROOT_FILES = (
    "package.json", "package-lock.json", "index.html", "vite.config.js",
    "shims-uni.d.ts", ".env.example", ".gitignore", ".dockerignore", "drizzle.config.mjs",
)
EXCLUDED = {"node_modules", ".git", "target", "dist", ".data", ".secrets", "logs", "__pycache__"}


def project_roots(app_root):
    app_root = Path(app_root).resolve()
    roots = (app_root, app_root.parent / "maoyi-admin", app_root.parent / "maoyi-backend")
    for project in roots:
        if not project.is_dir():
            raise ValueError("Missing sibling project: " + str(project))
    return roots


def source_hashes(root):
    """Fingerprint runtime/build inputs with workspace-relative project names.

    QA evidence, tests and documentation can change independently of runtime inputs.
    """
    app, admin, backend = project_roots(root)
    workspace = app.parent
    files = set()
    for directory in [*(app / name for name in APP_DIRS), admin, backend]:
        for file in directory.rglob("*"):
            relative = file.relative_to(workspace)
            if any(part in EXCLUDED for part in relative.parts):
                continue
            if file.is_symlink():
                raise ValueError("Runtime/build sources cannot contain symbolic links: " + str(relative))
            if file.is_file() and not file.name.endswith(".log") and file.name != ".DS_Store":
                files.add(file)
    for file in [*(app / name for name in APP_ROOT_FILES), workspace / ".dockerignore"]:
        if file.is_symlink():
            raise ValueError("Runtime/build sources cannot contain symbolic links: " + str(file))
        if file.is_file():
            files.add(file)
    return {str(file.relative_to(workspace)): hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(files)}
