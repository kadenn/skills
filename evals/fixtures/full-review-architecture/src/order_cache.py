from .cache_keys import cache_key


def read_order(cache, order_id: str):
    return cache.get(cache_key("order", order_id))
