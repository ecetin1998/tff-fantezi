#!/usr/bin/env python3
"""Verify the user-visible server-rendered gameweek, not React Flight scripts.

React 19 emits <!-- --> between literal and dynamic text in SSR HTML:
  <h1>MH<!-- -->8<!-- --> Oyuncu Analizi</h1>
A raw fixed-string grep fails even though the browser correctly shows MH8.
"""
from __future__ import annotations

import pathlib
import sys
from html.parser import HTMLParser


class VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.fragments: list[str] = []
        self.in_hidden_script: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self.in_hidden_script.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self.in_hidden_script:
            self.in_hidden_script.pop()

    def handle_data(self, value: str) -> None:
        if not self.in_hidden_script:
            self.fragments.append(value)


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: check-rendered-week.py <html-file> <expected-visible-heading>")
    path, expected = sys.argv[1:]
    source = pathlib.Path(path).read_text(encoding="utf-8", errors="replace")
    parser = VisibleText()
    parser.feed(source)
    rendered = " ".join("".join(parser.fragments).split())
    if expected not in rendered:
        print(f"Wrong/missing visible heading {expected!r}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
