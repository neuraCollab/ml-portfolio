## ML Portfolio — практические pet‑проекты по машинному обучению

Этот репозиторий собрал мои небольшие, но показательные проекты по ML/DL. Цель — быстро показать работодателю/тимлиду мои практические навыки: от классического ML до нейросетей, AutoML, RL и NLP. В каждом подпроекте есть свой `README.md` с инструкциями запуска и примерами.

— Если вы HR: достаточно раздела «Навигация по проектам» и «Навигация по проектам: навыки» в списке ниже.
— Если вы инженер/тимлид: загляните в соответствующие подпроекты — там краткие инструкции и код.

---

## Навигация по проектам

- **AutoTopic** — автоматическое тематическое моделирование текстовых логов на основе BERTopic, с трекингом экспериментов в MLflow и Streamlit‑интерфейсом.
  - Навыки: NLP предобработка (ru/en), эмбеддинги Sentence‑Transformers, UMAP+HDBSCAN, c‑TF‑IDF, Optuna, MLflow, Streamlit.
  - Подробнее: `./AutoTopic/README.md`

- **ML‑Automation** — гибкий AutoML‑хаб (`AutoMLHub`) c поддержкой текстовых признаков (эмбеддинги или TF‑IDF), единого интерфейса и визуализаций (ROC, важности).
  - Навыки: FLAML/H2O/TPOT/Auto‑Sklearn/PyCaret, конфигурирование через YAML, сохранение/загрузка моделей, метрики.
  - Подробнее: `./ml-automation/README.md`

- **PyTorch Learning Sandbox** — учебные мини‑примеры по PyTorch: тензоры/автоград, RNN, transfer learning ResNet50, сегментация U‑Net, VAE.
  - Навыки: PyTorch core, DataLoader/Dataset, тренировочные циклы, CV‑архитектуры, метрики/лоссы.
  - Подробнее: `./pytorch/README.md`

- **RL CV Car Autopilot (KITTI)** — обработка многомодальных данных (камера+LiDAR+IMU), проекция 3D→2D, среда Gym и обучение агента (SAC) со Stable‑Baselines3.
  - Навыки: компьютерное зрение, сенсорный фьюжн, калибровки, собственная среда Gym, SAC/DDPG, рендер/BEV.
  - Подробнее: `./rl_cv_car-autopilot/README.md`

- **scikit‑learn Supervised Learning** — коллекция практик по классическому ML: линейные модели, регуляризация, LDA, SVM, OMP, PA, байесовские регрессии.
  - Навыки: sklearn, визуализации, метрики, сравнение методов, воспроизводимые скрипты.
  - Подробнее: `./scikit-learn/README.md`

- **TensorFlow Examples** — набор примеров на TF 2/Keras: CNN для Fashion‑MNIST, регрессия (UCI Auto MPG), transfer learning (TF‑Hub), сохранение/загрузка, гипертюнинг.
  - Навыки: tf.data, Keras Sequential/слои, transfer learning, keras‑tuner, чекпоинты.
  - Подробнее: `./tensorFlow/README.md`

- **Kaggle** — заметки и решения соревнований (пример: Titanic — TF‑DF GBT и RandomForest).
  - Профиль Kaggle: `https://www.kaggle.com/name00smth`
  - Подробнее: `./kaggle/Readme.md` и `./kaggle/titanic/Readme.md`

---

## Что демонстрируют проекты (скиллы)

- **Классический ML**: sklearn, регуляризация, сравнение алгоритмов, визуализация и метрики.
- **NLP**: очистка/нормализация, эмбеддинги, тематическое моделирование, оценка coherence/diversity.
- **Deep Learning**: PyTorch и TensorFlow 2 — модели, тренировочные циклы, transfer learning, сегментация, VAE.
- **RL**: проектирование среды Gym, Stable‑Baselines3 (SAC/DDPG), мультимодальные наблюдения.
- **AutoML**: интеграция нескольких бэкендов, единый API, конфиги YAML, сохранение артефактов.
- **Инфраструктура экспериментов**: MLflow, Optuna, reproducibility, структурированная организация проекта.
- **Веб‑демо**: Streamlit для быстрой интерактивной проверки идей.

---

## Как связаться

- Email: mihailpersonalemail@gmail.com
- Kaggle: `https://www.kaggle.com/name00smth`
- Telegram: `@vbjgfc`

Если вам интересны детали реализации — переходите в подпроекты по ссылкам выше. Буду рад фидбеку и вопросам.


