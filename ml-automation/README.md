## ML-Automation: гибкий AutoML-хаб с текстовой предобработкой и визуализацией

Этот репозиторий демонстрирует мои навыки в построении прикладочного ML‑пайплайна: от генерации синтетических данных и конфигурируемого AutoML до сохранения модели и построения метрик/важностей признаков. Центральный класс `AutoMLHub` объединяет несколько AutoML‑бэкендов (FLAML, H2O, TPOT, Auto‑Sklearn, PyCaret) с единым интерфейсом и поддержкой текстовых признаков (эмбеддинги Sentence‑Transformers или fallback на TF‑IDF).

Проект ориентирован на «быстрый старт»: из коробки можно сгенерировать датасет, обучить модель, построить ROC и важности признаков, сохранить артефакты и получить итоговый скор. Обычно использую его на олимпидах на первых минутах чтобы получить "работающее" решение задачи.

### Ключевые возможности
- **Единый интерфейс AutoML**: `fit/predict/predict_proba/score/save_model/load_model` для разных бэкендов.
- **Поддержка текста**: авто‑обнаружение текстовых колонок; попытка построить эмбеддинги (`sentence-transformers`/`transformers`+`torch`) либо fallback на **TF‑IDF**.
- **Конфигурирование через YAML**: `config/config.yaml` + возможность переопределения параметров при инициализации класса.
- **Визуализации**: ROC‑кривая (бинарная и мультиклассовая микросредняя), barplot важностей признаков.
- **Стабильный predict**: автоматическое выравнивание колонок под обучающую схему.
- **Сохранение/загрузка**: через `joblib` (для sklearn‑совместимых) и `h2o.save_model` для H2O.

### Структура проекта
```
config/
  config.yaml          # настройки бэкенда/метрик/бюджетов
data/
  sample.csv           # синтетический датасет (генерируется)
models/
  best_automl.pkl      # сохранённая модель (после обучения)
src/
  automl_hub.py        # ядро: класс AutoMLHub
  utils.py             # метрики/препроцессинг текста/эмбеддинги
generate_sample.py     # генерация синтетических данных
main.py                # минимальный пример запуска AutoML
requirements.txt       # зависимости для быстрого старта через pip
pyproject.toml         # декларативные зависимости (Poetry)
```

## Быстрый старт

Ниже команды для Windows PowerShell; для macOS/Linux замените активацию виртуального окружения на `source .venv/bin/activate`.

```powershell
# 1) Создайте и активируйте виртуальное окружение
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2) Установите зависимости (минимальный набор для примера)
pip install -r requirements.txt

# 3) Сгенерируйте примерные данные
python generate_sample.py

# 4) Запустите обучение и оценку (по умолчанию backend=flaml)
python main.py
```

После завершения вы увидите итоговый скор, название лучшей модели, а в директории `models/` появятся:
- `best_automl.pkl` — сохранённая модель,
- `roc.png` — ROC‑кривая (если задача классификации и поддерживается `predict_proba`),
- `feature_importance.png` — важности признаков (если доступны для модели).

## Конфигурация
Основные параметры задаются в `config/config.yaml`:
- `backend`: `flaml` | `h2o` | `tpot` | `autosklearn` | `pycaret`
- `task_type`: `classification` | `regression`
- `metric`: ключевая метрика (напр. `f1`, `accuracy`, `roc_auc`, `mse`, `r2`)
- `time_budget`: бюджет времени в секундах
- `random_state`, `n_jobs` и специфичные настройки бэкендов (`flaml`, `h2o`, `tpot`).

Параметры можно переопределять прямо в коде при создании `AutoMLHub`:

```python
from src.automl_hub import AutoMLHub
automl = AutoMLHub(backend="flaml", task_type="classification", metric="f1", time_budget=30)
```

## Пример использования (минимальный)
```python
import pandas as pd
from sklearn.model_selection import train_test_split
from src.automl_hub import AutoMLHub

df = pd.read_csv("data/sample.csv")
X = df.drop("target", axis=1)
y = df["target"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

automl = AutoMLHub(backend="flaml", task_type="classification", metric="f1", time_budget=10)
automl.fit(X_train, y_train)
print("Score:", automl.score(X_test, y_test))
automl.save_model("models/best_automl.pkl")
```

## Смена бэкенда
Достаточно изменить `backend` в `config/config.yaml` или при инициализации класса:
- `flaml` — быстрый AutoML с хорошим качеством и скоростью.
- `h2o` — мощный AutoML со стеком моделей (потребуется Java и библиотека `h2o`).
- `tpot` — генетический поиск по пайплайнам sklearn.
- `autosklearn` — ансамбли, автоматический выбор пайплайнов.
- `pycaret` — унифицированный high‑level интерфейс к множеству алгоритмов.

Учтите, что наличие некоторых бэкендов требует дополнительных системных зависимостей (например, Java/H2O). Для текста `sentence-transformers`/`transformers`/`torch` подтянутся из `requirements.txt`.

## Текстовые признаки
- Колонки типа `object/string` автоматически распознаются как текстовые.
- Сначала выполняется базовая предобработка (lowercase, trim), далее попытка получить эмбеддинги через `SentenceTransformer`. Если не удалось — fallback на `TF‑IDF`.
- При `predict`/`predict_proba` колонки выравниваются под обучающую схему, что обеспечивает стабильность инференса.

## Оценка и визуализации
- `score(X, y)` — использует метрику из конфигурации.
- `plot_roc_auc(X, y, savepath=...)` — поддерживает бинарную и мультиклассовую классификацию (микро‑усреднение).
- `plot_feature_importance(top_n=20, ...)` — barplot важностей (когда доступны атрибуты важностей у модели/энсембля).

## Сохранение и загрузка модели
- Сохранение: `automl.save_model("models/best_automl.pkl")`
- Загрузка:
```python
from src.automl_hub import AutoMLHub
loaded = AutoMLHub.load_model("models/best_automl.pkl", backend="flaml", task_type="classification")
preds = loaded.predict(X)
```

## Требования
- Python 3.10+ (для стабильной работы библиотек из `requirements.txt`).
- При работе с H2O — установленная Java (JRE/JDK).
- Для эмбеддингов — `sentence-transformers` или стек `transformers` + `torch` (установлены в `requirements.txt`).

## Что демонстрирует этот проект 
- Проектирование удобного и расширяемого API поверх нескольких AutoML‑бэкендов.
- Работа с конфигурацией (YAML), воспроизводимость (random_state), контроль времени обучения.
- Продуманная обработка текстовых признаков и унификация пайплайна между train/infer.
- Визуализация метрик и интерпретируемость (ROC, важности признаков).
- Организация артефактов (модели, графики) и быстрый запуск.

---
Если хотите быстро «прожать» демо на своём ПК: выполните блок «Быстрый старт» — все артефакты появятся в папке `models/`, а скор и лучшая модель выведутся в консоль.