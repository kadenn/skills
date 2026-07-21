"""Shared cache-key construction for service caches."""


def cache_key(namespace: str, entity_id: str) -> str:
    if not namespace or not entity_id:
        raise ValueError("namespace and entity_id are required")
    return f"{namespace}:{entity_id}"
