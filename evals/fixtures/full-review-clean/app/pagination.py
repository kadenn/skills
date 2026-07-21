def next_cursor(items: list[dict], has_more: bool) -> str | None:
    if not has_more:
        return None
    if not items:
        raise ValueError("has_more requires at least one item")
    return str(items[-1]["id"])
