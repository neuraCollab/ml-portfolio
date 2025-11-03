import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from wordcloud import WordCloud
from pathlib import Path
from bertopic import BERTopic
from loguru import logger

WORD_TOPIC = Path("word_topic")
WORD_TOPIC.mkdir(exist_ok=True)

def plot_topic_sizes(topics, name="topic_sizes.png"):
    counts = pd.Series(topics).value_counts().sort_index()
    plt.figure(figsize=(10,5))
    sns.barplot(x=counts.index, y=counts.values)
    plt.title("Topic Sizes")
    plt.xlabel("Topic")
    plt.ylabel("Count")
    path = WORD_TOPIC / name
    plt.savefig(path, bbox_inches="tight")
    plt.close()
    return path

def plot_wordcloud(model: BERTopic, topic_id: int, name="wordcloud"):
    words = dict(model.get_topic(topic_id) or [])
    if not words:
        logger.warning(f"No words for topic {topic_id}, skipping wordcloud.")
        return None

    wc = WordCloud(width=800, height=400, background_color="white").generate_from_frequencies(words)

    plt.figure(figsize=(10, 5))
    plt.imshow(wc, interpolation="bilinear")
    plt.axis("off")

    path = WORD_TOPIC / f"{name}_{topic_id}.png"
    plt.savefig(path, bbox_inches="tight")
    plt.close()

    logger.info(f"Wordcloud saved: {path}")
    return path

