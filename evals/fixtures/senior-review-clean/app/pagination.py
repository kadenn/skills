from typing import TypedDict


class PageItem(TypedDict):
    id: int


def next_cursor(items: list[PageItem], has_more: bool) -> str | None:
    if not has_more:
        return None
    if not items:
        raise ValueError("has_more requires at least one item")
    return str(items[-1]["id"])
