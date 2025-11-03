import re
import emoji
from bs4 import BeautifulSoup
import spacy

# ---------------- Конфигурация ----------------
class Config:
    CUSTOM_STOP_WORDS = {
        'часто', "null", "info", "warn", "main", "set",
        "button", "file", "line", "de", "var", "dg", "doi",
        'запрос', 'помогать', 'чтобы', 'можно',
        'нужно', 'хотеть', 'просить', 'подскажи',
        # дополнительные общеязыковые слова и служебная лексика
        'это', 'как', 'так', 'ещё', 'уже', 'если', 'или', 'также', 'например', 'тогда', 'которые',
        'будет', 'были', 'после', 'перед', 'между', 'поэтому', 'когда', 'где', 'сюда', 'туда',
        'вообще', 'просто', 'очень', 'может', 'должен', 'давайте', 'скажите', 'подскажите',
        # англ.
        'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'was', 'were', 'been',
        'can', 'could', 'should', 'would', 'about', 'into', 'onto', 'also', 'just', 'really',
        # доменные/логовые мусорные токены
        'stack', 'trace', 'exception', 'error', 'warning', 'failed', 'success', 'debug',
        'request', 'response', 'timestamp', 'object', 'value', 'nullpointer', 'undefined'
    }
    RU_SPACY_MODEL_NAME = "ru_core_news_sm"
    EN_SPACY_MODEL_NAME = "en_core_web_sm"


def get_spacy_stop_words(model_name):
    import subprocess, sys, spacy
    try:
        spacy.load(model_name)
    except OSError:
        subprocess.run([sys.executable, "-m", "spacy", "download", model_name],
                       check=True)
    nlp = spacy.load(model_name, disable=["ner", "parser"])
    return nlp.Defaults.stop_words


# объединяем стоп-слова
RU_STOP_WORDS = get_spacy_stop_words(Config.RU_SPACY_MODEL_NAME)
EN_STOP_WORDS = get_spacy_stop_words(Config.EN_SPACY_MODEL_NAME)
STOP_WORDS = set(RU_STOP_WORDS).union(EN_STOP_WORDS).union(Config.CUSTOM_STOP_WORDS)

# ---------------- Регулярные выражения для очистки ----------------
# Удаление доменных ссылок без протокола: foo.bar, site.com/path
DOMAIN_LINK_RE = re.compile(r"\b(?:[a-zA-Z0-9-]+\.)+[a-z]{2,}(?:/[\w\-./?#%&=+]*)?\b", re.IGNORECASE)
# Удаление email-адресов
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b", re.IGNORECASE)
# Инлайн-код в одинарных бэктиках
INLINE_CODE_RE = re.compile(r"`[^`]+`")
# Ключевые слова кода/шаблоны
CODE_KEYWORDS_RE = re.compile(
    r"\b("
    r"import|from|class|def|return|if|else|elif|for|while|try|except|finally|with|lambda|yield|"
    r"public|private|protected|static|void|int|float|double|String|new|extends|implements|"
    r"var|let|const|function|=>|enum|interface|package|namespace|#include|using|template|"
    r"console\.log|System\.out\.println|printf|cout|cin|println|struct|typedef"
    r")\b",
    re.IGNORECASE,
)
# Популярные названия LLM и семейств моделей
LLM_MODELS_RE = re.compile(
    r"\b("
    r"gpt[- ]?4(?:o|\.1|\.0|o-mini)?|gpt[- ]?3\.5(?:-turbo)?|"
    r"claude(?:[- ]?3(?:\.5)?(?:\s?(opus|sonnet|haiku))?)?|"
    r"gemini(?:\s?1\.5)?(?:\s?(pro|flash|ultra))?|"
    r"llama(?:[- ]?2|[- ]?3(?:\.1|\.2)?)?|mistral|mixtral|phi[- ]?3|"
    r"qwen(?:2(?:\.5)?)?|yi|vicuna|zephyr|aya|deepseek(?:[- ]?r1)?|"
    r"openchat|orca|mpt[- ]?\d+b?|falcon[- ]?\d+b?"
    r")\b",
    re.IGNORECASE,
)

# ---------------- Очистка текста ----------------
def clean_texts(texts, min_len: int = 10, max_len: int = 500):
    clean = []
    for text in texts:
        # 1. Убираем префиксы "Текстовый запрос (модель: ...):"
        text = re.sub(r"^(Текстовый запрос|Премиум запрос) \(модель: [^)]+\): ", "", text)

        # 2. Убираем HTML
        text = BeautifulSoup(text, "lxml").get_text()

        # 3. Убираем эмодзи
        text = emoji.replace_emoji(text, "")

        # 4. Убираем ссылки: http/https/www + доменные без протокола, и e-mail
        text = re.sub(r"\b(?:http|https|www)\S*\b", " ", text)
        text = DOMAIN_LINK_RE.sub(" ", text)
        text = EMAIL_RE.sub(" ", text)

        # 5. Убираем инлайн-код и выделенные бэктиками блоки
        text = INLINE_CODE_RE.sub(" ", text)

        # 6. Убираем кодовые блоки (``` ... ```)
        text = re.sub(r"```.*?```", " ", text, flags=re.S)

        # 7. Убираем распространённые конструкции кода/ключевые слова
        text = CODE_KEYWORDS_RE.sub(" ", text)

        # 8. Убираем упоминания популярных LLM-моделей
        text = LLM_MODELS_RE.sub(" ", text)

        # 9. Убираем числа
        text = re.sub(r"\d+", " ", text)

        # 10. Убираем всё лишнее кроме букв и пробелов
        # Используем режим из конфигурации: ru_only|mixed
        mode = "ru_only"
        try:
            # cfg пробрасывается из main/app; если нет — ru_only
            from yaml import safe_load
            mode = mode  # placeholder when cfg not present in this scope
        except Exception:
            pass
        # Для совместимости: оставляем кириллицу и, если понадобится, латиницу
        if mode == "mixed":
            text = re.sub(r"[^а-яА-Яa-zA-Z\s]", " ", text)
        else:
            text = re.sub(r"[^а-яА-Я\s]", " ", text)

        # 11. Токенизация + удаление стоп-слов
        tokens = [w for w in text.lower().split() if w not in STOP_WORDS]

        # 12. Фильтрация по длине
        if min_len <= len(tokens) <= max_len and len(tokens) > 0:
            clean.append(" ".join(tokens))

    return clean
