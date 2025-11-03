import spacy
import pymorphy3

morph = pymorphy3.MorphAnalyzer()
nlp_en = spacy.load("en_core_web_sm", disable=["parser", "ner"])

def normalize_texts(texts, cfg):
    lang = cfg["normalization"]["language"]
    normed = []
    for t in texts:
        if lang == "ru":
            tokens = [morph.parse(w)[0].normal_form for w in t.split()]
            normed.append(" ".join(tokens))
        elif lang == "en":
            doc = nlp_en(t)
            normed.append(" ".join([token.lemma_ for token in doc]))
        else:
            normed.append(t)  # мультиязычные — без нормализации
    return normed
