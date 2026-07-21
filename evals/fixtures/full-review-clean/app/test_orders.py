from app.orders import page_response


def test_page_response_includes_cursor():
    assert page_response([{"id": 10}, {"id": 11}], has_more=True) == {
        "items": [{"id": 10}, {"id": 11}],
        "next_cursor": "11",
    }


def test_empty_page_response_has_no_cursor():
    assert page_response([], has_more=False) == {"items": [], "next_cursor": None}


def test_final_page_response_has_no_cursor():
    assert page_response([{"id": 10}], has_more=False) == {
        "items": [{"id": 10}],
        "next_cursor": None,
    }


def test_page_response_rejects_inconsistent_pagination_state():
    try:
        page_response([], has_more=True)
    except ValueError as error:
        assert str(error) == "has_more requires at least one item"
    else:
        raise AssertionError("expected ValueError")
