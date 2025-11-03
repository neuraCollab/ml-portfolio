## TensorFlow Examples (ВНИМАНИЕ, тут tf 2 использовал)

Этот репозиторий — набор небольших примеров, демонстрирующих мои навыки работы с TensorFlow/Keras: от классической регрессии и свёрточных сетей до transfer learning, сохранения/загрузки моделей и подбора гиперпараметров.

### Что внутри
- **`imgConvolution.py`**: CNN для Fashion-MNIST с `tf.data`, нормализацией, кешированием и визуализацией входов.
- **`regression.py`**: полная регрессионная пайплайн на Keras: подготовка данных (UCI Auto MPG), нормализация, baseline/linear/DNN модели, метрики, графики ошибок, сохранение и последующая загрузка модели.
- **`transferLearning.py`**: transfer learning на `cats_vs_dogs` с `TensorFlow Hub` (MobileNetV2 feature extractor), батчинг, кэширование, тренировка, визуализация предсказаний, сохранение модели `.h5`.
- **`saveAndLoadModel.py`**: практики сохранения весов и всей модели (SavedModel/HDF5), чекпоинтинг, загрузка последних весов, повторная оценка.
- **`saveTransfLearning.py`**: демонстрация классификации с TF-Hub, инференс ImageNet-классификатора и transfer learning на cats_vs_dogs с графиками обучения.
- **`hyperParameters.py`**: подбор гиперпараметров c `keras_tuner.Hyperband` для Fashion-MNIST (тюнинг размера слоя и learning rate), ранняя остановка, дообучение лучшей модели и оценка на тесте.
- **`gettingStarted.py`**: базовый пример линейной регрессии на scikit-learn (для контраста с Keras-пайплайнами).
- **`reloadModal.py`**: фрагмент кода (закомментированная часть из загрузки модели) — кандидат на удаление или объединение.

### Основные навыки, отражённые в примерах
- Работа с `tf.data` и `tensorflow_datasets`: маппинг, нормализация, кеширование, батчинг, prefetch.
- Построение моделей в Keras: `Sequential`, слои `Conv2D`, `MaxPooling2D`, `Dense`, `Dropout`, `Normalization`.
- Регрессия и DNN: нормализация признаков, baseline и глубокие модели, метрики (MAE), визуализация learning curves и ошибок.
- Transfer Learning с `tensorflow_hub`: фиксированный feature extractor, дообучение «головы», оценка и визуализация.
- Сохранение/загрузка: чекпоинты весов, SavedModel, HDF5, восстановление и повторная оценка.
- Подбор гиперпараметров: `keras-tuner` (Hyperband), поиск лучших конфигураций, ранняя остановка.

### Требования
Рекомендуемые версии (подойдут близкие):
- Python 3.9+
- TensorFlow 2.10+
- tensorflow-datasets
- tensorflow-hub
- keras-tuner
- numpy, pandas, matplotlib, seaborn
- scikit-learn
- pillow

Быстрая установка на Windows (PowerShell):
```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install tensorflow tensorflow-datasets tensorflow-hub keras-tuner numpy pandas matplotlib seaborn scikit-learn pillow
```

При использовании GPU установите соответствующий билд TensorFlow и CUDA/CuDNN (смотрите официальную документацию TensorFlow).

### Как запустить
Каждый скрипт самодостаточен и запускается отдельно:
```bash
python imgConvolution.py        # CNN для Fashion-MNIST
python regression.py            # Регрессия (UCI Auto MPG) + сохранение/загрузка
python transferLearning.py      # Transfer learning (cats_vs_dogs) + сохранение .h5
python saveAndLoadModel.py      # Чекпоинты, SavedModel, HDF5
python saveTransfLearning.py    # TF-Hub классификатор + transfer learning графики
python hyperParameters.py       # Hyperband тюнинг для Fashion-MNIST
python gettingStarted.py        # (scikit-learn) линейная регрессия
```

Примечания:
- Скрипты с `tensorflow_datasets` автоматически скачают датасеты при первом запуске.
- Скрипты, рисующие графики, откроют окна Matplotlib; для headless-режима используйте backend `Agg` или сохраняйте фигуры в файлы.

### Что можно улучшить (рекомендации по структуре)
Чтобы сделать проект ещё понятнее для рекрутера/тимлида:
- Переименовать файлы для ясности:
  - `imgConvolution.py` → `cnn_fashion_mnist.py`
  - `saveTransfLearning.py` → `save_transfer_learning.py`
  - `gettingStarted.py` → `sklearn_linear_regression.py` (так честнее отражает содержимое)
  - `reloadModal.py` → удалить или объединить с `saveAndLoadModel.py` (опечатка в названии и дублирование темы)
- Вынести общие утилиты (например, подготовка данных или визуализации) в `utils/` при дальнейшем росте проекта.
- Добавить `requirements.txt` и (опционально) `Makefile`/`tasks.ps1` с командами запуска.
- Зафиксировать версии библиотек для воспроизводимости.

Предложенный `requirements.txt` (опционально добавьте в репозиторий):
```txt
tensorflow>=2.10
tensorflow-datasets
tensorflow-hub
keras-tuner
numpy
pandas
matplotlib
seaborn
scikit-learn
pillow
```

### Чем этот репозиторий полезен как портфолио
- Показывает владение ключевыми практиками TensorFlow 2/Keras на реальных датасетах.
- Демонстрирует умение строить и обучать CNN и DNN, применять transfer learning, а также сохранять и восстанавливать модели.
- Отражает опыт с `tf.data`, `tensorflow_hub`, `tensorflow_datasets`, и автоматическим тюнингом гиперпараметров.

Если нужно, я могу привести кодовую базу к единому стилю именования, добавить `requirements.txt` и оформить минимальные тесты воспроизводимости.


