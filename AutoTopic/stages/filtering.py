def filter_texts(texts, cfg):
    out = []
    for t in texts:
        if cfg["filtering"]["drop_links"] and "http" in t:
            continue
        if len(t.split()) < cfg["filtering"]["min_length"]:
            continue
        out.append(t)
    return out
