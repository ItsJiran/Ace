from __future__ import annotations

from .tool_types import AceToolDescriptor


def normalize_ace_tools(raw_tools: object) -> list[AceToolDescriptor]:
    if not isinstance(raw_tools, list):
        return []

    normalized: list[AceToolDescriptor] = []
    seen: set[tuple[str, str]] = set()
    for item in raw_tools:
        if not isinstance(item, dict):
            continue

        slug = item.get("slug")
        package_ref = item.get("package_ref") or item.get("packageRef")
        if not isinstance(slug, str) or not slug.strip():
            continue
        if not isinstance(package_ref, str) or not package_ref.strip():
            continue

        key = (package_ref, slug)
        if key in seen:
            continue

        parameters = item.get("parameters")
        normalized.append({
            "kind": "ace_tool",
            "slug": slug,
            "name": item.get("name") if isinstance(item.get("name"), str) else slug,
            "description": item.get("description") if isinstance(item.get("description"), str) else "",
            "package_ref": package_ref,
            "parameters": parameters if isinstance(parameters, dict) else {},
        })
        seen.add(key)

    normalized.sort(key=lambda tool_item: f"{tool_item['package_ref']}:{tool_item['slug']}")
    return normalized


def merge_ace_tool_catalog(*catalogs: list[AceToolDescriptor]) -> list[AceToolDescriptor]:
    merged: dict[tuple[str, str], AceToolDescriptor] = {}
    for catalog in catalogs:
        for item in catalog:
            package_ref = str(item.get("package_ref", "")).strip()
            slug = str(item.get("slug", "")).strip()
            if not package_ref or not slug:
                continue
            merged[(package_ref, slug)] = item
    return sorted(merged.values(), key=lambda tool_item: f"{tool_item['package_ref']}:{tool_item['slug']}")


def retain_known_ace_tools(
    known_ace_tools: list[AceToolDescriptor],
    mirrored_ace_tools: list[AceToolDescriptor],
) -> list[AceToolDescriptor]:
    mirrored_keys = {
        (str(item.get("package_ref", "")).strip(), str(item.get("slug", "")).strip())
        for item in mirrored_ace_tools
    }
    retained = [
        item
        for item in known_ace_tools
        if (str(item.get("package_ref", "")).strip(), str(item.get("slug", "")).strip()) in mirrored_keys
    ]
    return merge_ace_tool_catalog(retained)


def find_ace_tool(
    ace_tools: list[AceToolDescriptor],
    tool_slug: str,
    package_ref: str = "",
) -> AceToolDescriptor | None:
    normalized_query = normalize_tool_identity(tool_slug)
    normalized_package = package_ref.strip().lower()

    exact_package_matches: list[AceToolDescriptor] = []
    loose_matches: list[AceToolDescriptor] = []

    for item in ace_tools:
        item_package_ref = str(item.get("package_ref", "")).strip()
        item_slug = str(item.get("slug", "")).strip()
        item_name = str(item.get("name", "")).strip()
        candidate_keys = {
            item_slug,
            item_name,
            normalize_tool_identity(item_slug),
            normalize_tool_identity(item_name),
        }

        if tool_slug not in candidate_keys and normalized_query not in candidate_keys:
            continue

        if normalized_package:
            if item_package_ref.lower() == normalized_package:
                exact_package_matches.append(item)
            continue

        loose_matches.append(item)

    if exact_package_matches:
        return exact_package_matches[0]
    if loose_matches:
        return loose_matches[0]
    return None


def normalize_tool_identity(value: str) -> str:
    return value.strip().lower().replace("_", "-").replace(" ", "-")


__all__ = [
    "find_ace_tool",
    "merge_ace_tool_catalog",
    "normalize_ace_tools",
    "normalize_tool_identity",
    "retain_known_ace_tools",
]