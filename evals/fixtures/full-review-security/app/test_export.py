from app.export import build_export_params


def test_redacts_by_default():
    assert build_export_params({})["redact_pii"] is True
