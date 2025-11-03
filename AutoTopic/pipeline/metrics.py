from bertopic import BERTopic
from gensim.models.coherencemodel import CoherenceModel
from gensim.corpora import Dictionary


def evaluate_topics(model: BERTopic, texts: list[str], embeddings=None) -> dict:
    topics = {
        topic_id: words
        for topic_id, words in model.get_topics().items()
        if topic_id != -1 and words
    }

    topic_words = [[word for word, _ in words] for words in topics.values()]
    tokenized_texts = [text.split() for text in texts]

    dictionary = Dictionary(tokenized_texts)
    corpus = [dictionary.doc2bow(text) for text in tokenized_texts]

    results = {
        "n_topics": len(topics),
        "coherence_uci": 0.0,
        "coherence_umass": 0.0,
        "diversity": 0.0,
    }

    try:
        cm_uci = CoherenceModel(
            topics=topic_words,
            texts=tokenized_texts,
            dictionary=dictionary,
            coherence="c_uci",
        )
        results["coherence_uci"] = cm_uci.get_coherence()
    except Exception:
        pass

    try:
        cm_umass = CoherenceModel(
            topics=topic_words,
            corpus=corpus,
            dictionary=dictionary,
            coherence="u_mass",
        )
        results["coherence_umass"] = cm_umass.get_coherence()
    except Exception:
        pass

    all_words = [w for topic in topic_words for w in topic]
    if all_words:
        results["diversity"] = len(set(all_words)) / len(all_words)

    return results
