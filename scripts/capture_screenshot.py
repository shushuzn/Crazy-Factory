"""Capture a gameplay screenshot with robust Playwright fallbacks.

Why this exists:
- Chromium can crash with SIGSEGV in constrained containers.
- Some environments do not preinstall Python Playwright bindings.

Strategy:
1) Prefer Python Playwright if available (fastest in dev environments).
2) If unavailable, fallback to `npx playwright` and still prefer Firefox/WebKit.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

URL = os.getenv("SCREENSHOT_URL", "http://127.0.0.1:4173/index.html")
OUT = Path(os.getenv("SCREENSHOT_OUT", "artifacts/factory-screenshot.png"))
VIEWPORT = {"width": 1280, "height": 960}


def _engine_order() -> list[str]:
    raw = os.getenv("SCREENSHOT_ENGINES", "firefox,webkit,chromium")
    order = [x.strip().lower() for x in raw.split(",") if x.strip()]
    valid = [x for x in order if x in {"firefox", "webkit", "chromium"}]
    return valid or ["firefox", "webkit", "chromium"]


def _launch_kwargs(engine: str) -> dict:
    if engine == "chromium":
        return {"args": ["--disable-dev-shm-usage", "--no-sandbox"]}
    return {}


def _bootstrap_python_playwright() -> bool:
    """Best-effort bootstrap for environments without preinstalled playwright.

    Why: CI/container images often omit playwright and npx.
    We keep this optional via env to avoid surprising local environments.
    """

    if os.getenv("SCREENSHOT_BOOTSTRAP", "1") not in {"1", "true", "TRUE", "yes", "YES"}:
        return False

    pip_cmd = [sys.executable, "-m", "pip", "install", "playwright"]
    if subprocess.run(pip_cmd, capture_output=True, text=True).returncode != 0:
        return False

    install_cmd = [sys.executable, "-m", "playwright", "install", "firefox", "webkit"]
    return subprocess.run(install_cmd, capture_output=True, text=True).returncode == 0


def _capture_with_python_playwright() -> tuple[str, list[str]]:
    from playwright.sync_api import Error, TimeoutError, sync_playwright

    errors: list[str] = []
    with sync_playwright() as p:
        engine_map = {
            "firefox": p.firefox,
            "webkit": p.webkit,
            "chromium": p.chromium,
        }
        for name in _engine_order():
            browser = None
            try:
                browser = engine_map[name].launch(**_launch_kwargs(name))
                page = browser.new_page(viewport=VIEWPORT)
                page.goto(URL, wait_until="load", timeout=15_000)
                page.click("#manualBtn", timeout=5_000)
                page.screenshot(path=str(OUT), full_page=True)
                return name, errors
            except (TimeoutError, Error, Exception) as exc:
                errors.append(f"{name}: {exc}")
            finally:
                if browser:
                    browser.close()
    raise RuntimeError("All Python Playwright engines failed: " + " | ".join(errors))


def _capture_with_npx() -> tuple[str, list[str]]:
    if not shutil.which("npx"):
        raise RuntimeError("Python Playwright unavailable and npx is not installed")

    errors: list[str] = []
    for name in _engine_order():
        cmd = [
            "npx",
            "-y",
            "playwright@1.55.0",
            "screenshot",
            "--browser",
            name,
            "--viewport-size",
            f"{VIEWPORT['width']},{VIEWPORT['height']}",
            URL,
            str(OUT),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0:
            return name, errors
        snippet = (proc.stderr or proc.stdout).strip().splitlines()[-1:] or ["unknown error"]
        errors.append(f"{name}: {snippet[0]}")
    raise RuntimeError("All npx Playwright engines failed: " + " | ".join(errors))


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)

    try:
        engine, failures = _capture_with_python_playwright()
        if failures:
            print("Fallback notes (python):")
            for item in failures:
                print(f"- {item}")
        print(f"Screenshot captured with python-playwright/{engine}: {OUT}")
        return 0
    except ModuleNotFoundError:
        print("Python Playwright not installed; attempting bootstrap...", file=sys.stderr)
        if _bootstrap_python_playwright():
            engine, failures = _capture_with_python_playwright()
            if failures:
                print("Fallback notes (python):")
                for item in failures:
                    print(f"- {item}")
            print(f"Screenshot captured with python-playwright/{engine}: {OUT}")
            return 0
        print("Bootstrap unavailable/failed; falling back to npx playwright...", file=sys.stderr)
    except Exception as exc:
        print(f"Python Playwright capture failed: {exc}", file=sys.stderr)
        print("Falling back to npx playwright...", file=sys.stderr)

    engine, failures = _capture_with_npx()
    if failures:
        print("Fallback notes (npx):")
        for item in failures:
            print(f"- {item}")
    print(f"Screenshot captured with npx-playwright/{engine}: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
