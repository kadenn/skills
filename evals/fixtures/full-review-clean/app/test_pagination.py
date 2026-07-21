from app.pagination import next_cursor


def test_empty_page_has_no_cursor():
    assert next_cursor([], has_more=False) is None


def test_uses_last_item_id():
    assert next_cursor([{"id": 10}, {"id": 11}], has_more=True) == "11"


def test_non_empty_final_page_has_no_cursor():
    assert next_cursor([{"id": 10}], has_more=False) is None


def test_has_more_requires_an_item():
    try:
        next_cursor([], has_more=True)
    except ValueError as error:
        assert str(error) == "has_more requires at least one item"
    else:
        raise AssertionError("expected ValueError")
