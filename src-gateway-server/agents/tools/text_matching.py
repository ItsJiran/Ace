from __future__ import annotations


def tokenize_text(value: str) -> list[str]:
    tokens = [part.strip().lower() for part in value.replace("-", " ").replace("_", " ").split()]
    return [token for token in tokens if len(token) >= 3]


__all__ = ["tokenize_text"]