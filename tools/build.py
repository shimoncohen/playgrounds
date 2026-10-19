#!/usr/bin/env python3
"""Bundle each <name>-quest/ folder into dist/<name>-quest.html.

The bundle is the body-only fragment the claude.ai Artifact tool expects: local
stylesheets and scripts (style.css, app.js, ../shared/*) are inlined and <title>
moves into the body, because the Artifact service wraps the page in its own
document skeleton at publish time.

    python3 tools/build.py            # build every playground
    python3 tools/build.py shell      # build one
    python3 tools/build.py --check    # build and verify, no files written
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Local (non-http) stylesheet links and script tags get inlined; CDN ones stay as they are.
LINK_RE = re.compile(r'<link rel="stylesheet" href="(?!https?:|//)([^"]+)">')
SCRIPT_RE = re.compile(r'<script src="(?!https?:|//)([^"]+)"></script>')


def bundle(folder: Path) -> str:
    html = (folder / "index.html").read_text(encoding="utf8")

    def inline(tag, open_, close):
        def sub(m):
            text = (folder / m.group(1)).read_text(encoding="utf8")
            if f"</{tag}" in text.lower():
                sys.exit(f"{folder.name}/{m.group(1)}: contains </{tag}, cannot be inlined")
            return f"{open_}{text}{close}"
        return sub

    html = LINK_RE.sub(inline("style", "<style>", "</style>"), html)
    html = SCRIPT_RE.sub(inline("script", "<script>", "</script>"), html)
    title = re.search(r"<title>(.*?)</title>", html).group(1)
    body = html[html.index("<body>") + len("<body>"):html.rindex("</body>")]
    return f"\n<title>{title}</title>{body}"


def main(argv):
    check = "--check" in argv
    names = [a for a in argv if not a.startswith("--")]
    folders = sorted(p for p in ROOT.glob("*-quest") if p.is_dir())
    if names:
        folders = [p for p in folders if p.name in names or p.name.removesuffix("-quest") in names]
    if not folders:
        sys.exit("no playground folders matched")
    out = ROOT / "dist"
    for f in folders:
        text = bundle(f)
        if check:
            print(f"ok  {f.name}  {len(text):,} bytes")
        else:
            out.mkdir(exist_ok=True)
            (out / f"{f.name}.html").write_text(text, encoding="utf8")
            print(f"built dist/{f.name}.html  {len(text):,} bytes")


if __name__ == "__main__":
    main(sys.argv[1:])
