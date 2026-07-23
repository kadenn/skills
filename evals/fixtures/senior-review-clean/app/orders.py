from app.pagination import PageItem, next_cursor


def page_response(items: list[PageItem], has_more: bool) -> dict:
    return {"items": items, "next_cursor": next_cursor(items, has_more)}
