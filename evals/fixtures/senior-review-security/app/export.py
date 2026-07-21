def build_export_params(overrides: dict) -> dict:
    params = dict(overrides)
    params.setdefault("redact_pii", True)
    return params


def export_customers(exporter, overrides: dict):
    return exporter.run(build_export_params(overrides))
