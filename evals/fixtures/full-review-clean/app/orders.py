from app.pagination import next_cursor


def page_response(items: list[dict], has_more: bool) -> dict:
    return {"items": items, "next_cursor": next_cursor(items, has_more)}
