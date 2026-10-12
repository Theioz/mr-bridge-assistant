"""CI guard (#761): flag server files that import non-component VALUES from "use client" modules.

Next.js only rejects calling a client-module function from the server at request time, so
tsc / eslint / next build all pass. Heuristic: an imported name starting lowercase (a function
or constant), not `type`-only, from a file whose first statement is "use client", into a file
that is not itself "use client".
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "web", "src")


def is_client(path):
    try:
        with open(path) as f:
            head = f.read(200).lstrip()
    except OSError:
        return False
    return head.startswith('"use client"') or head.startswith("'use client'")


def resolve(spec, from_file):
    if spec.startswith("@/"):
        base = os.path.join(SRC, spec[2:])
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    else:
        return None
    for cand in (base, base + ".ts", base + ".tsx", os.path.join(base, "index.ts"), os.path.join(base, "index.tsx")):
        if os.path.isfile(cand):
            return cand
    return None


IMPORT = re.compile(r'import\s+(type\s+)?\{([^}]*)\}\s+from\s+["\']([^"\']+)["\']', re.S)
hits = []
for dirpath, _, files in os.walk(SRC):
    if "__tests__" in dirpath:
        continue
    for fn in files:
        if not fn.endswith((".ts", ".tsx")):
            continue
        path = os.path.join(dirpath, fn)
        if is_client(path):
            continue
        text = open(path).read()
        for m in IMPORT.finditer(text):
            if m.group(1):
                continue
            target = resolve(m.group(3), path)
            if not target or not is_client(target):
                continue
            for name in m.group(2).split(","):
                name = name.strip()
                if not name or name.startswith("type "):
                    continue
                local = name.split(" as ")[0].strip()
                if local[:1].islower():
                    hits.append(f"{os.path.relpath(path, ROOT)} imports `{local}` from client module {os.path.relpath(target, ROOT)}")
if hits:
    print("Server code imports functions from \"use client\" modules; Next.js rejects this only at")
    print("request time (it crashed every Settings tab after #766). Move the helper to a plain module:")
    print("\n".join("  " + h for h in hits))
    sys.exit(1)
print("client boundary: no server imports of client-module functions")
