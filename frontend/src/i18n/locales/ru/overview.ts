export const overview = {
  banner: {
    eyebrow: 'Обзор репозитория и архитектура',
    title: 'Портфолио машинного обучения: AutoTopic, RL-автопилот, ЭКГ Edge AI и Cassandra gRPC ML',
    description:
      'Четыре проекта, демонстрирующие машинное обучение, глубокое обучение, обработку сигналов, обучение с подкреплением, распределённые системы и backend/edge-AI-разработку, объединённые в единой панели на основе сервиса FastAPI, который выполняет реальный Python-код каждого проекта.',
    tags: {
      nlpTopicModeling: 'NLP / тематическое моделирование',
      reinforcementLearning: 'Обучение с подкреплением',
      computerVision: 'Компьютерное зрение',
      signalProcessing: 'Обработка сигналов',
      edgeAi: 'Edge AI',
      distributedSystems: 'Распределённые системы',
      backendEngineering: 'Разработка бэкенда',
    },
  },
  techStackHeading: 'Ключевая архитектура и стек технологий:',
  projects: {
    autotopic: {
      title: 'Проект 1: NLP-конвейер AutoTopic',
      description:
        'Автоматическое обнаружение и интерпретация тем в неструктурированных текстовых логах. Создано для ускорения разбора инцидентов и получения продуктовых инсайтов без ручной разметки данных.',
      stack: {
        item1: 'BERTopic + SentenceTransformers (MiniLM-L12)',
        item2: 'UMAP (cosine) + HDBSCAN — кластеризация по плотности',
        item3: 'Optuna (TPE Sampler) — настройка гиперпараметров',
        item4: 'Оценка по Coherence UCI (c_uci) и метрикам Diversity',
        item5: 'Отслеживание экспериментов в MLflow и фронтенд на Streamlit',
      },
    },
    autopilot: {
      title: 'Проект 2: Автономное вождение на RL и CV',
      description:
        'Политика автономного вождения, обученная с помощью обучения с подкреплением на наборе данных KITTI Vision Benchmark, объединяющая видеопоток камеры, облака точек LiDAR и данные IMU-сенсора OXTS.',
      stack: {
        item1: 'Калибровка камеры и коррекция дисторсии объектива OpenCV (K_00, D_00)',
        item2: 'Проекция 3D-облака точек Velodyne LiDAR (Tr_velo_to_cam)',
        item3Prefix: 'Собственная среда OpenAI Gym (',
        item3Suffix: ')',
        item4: 'Stable-Baselines3 (SAC и DDPG MultiInputPolicy)',
        item5: '3D-ограничивающие рамки объектов (tx, ty, tz) и обнаружение аномалий',
      },
    },
    ecg: {
      title: 'Проект 3: ЭКГ на Raspberry Pi / Edge AI',
      description:
        'Периферийное устройство (Raspberry Pi 5 + AD8232 + Arduino Nano), которое восстанавливает 6-канальную ЭКГ из 2 физических каналов и классифицирует 19 видов нарушений ритма и проводимости локально, прямо на устройстве.',
      stack: {
        item1: 'AD8232 + Arduino Nano x2 → последовательный порт → Raspberry Pi 5',
        item2: 'Полосовой фильтр Баттерворта (0.5–40 Гц) + реконструкция по Эйнтховену/Гольдбергеру',
        item3: 'ECGNet (Conv1d x4) в TorchScript, обучена на PTB-XL',
        item4: 'FastAPI + WebSocket, инференс на edge-устройстве только на CPU',
        item5: 'Исследовательский прототип — не сертифицированное медицинское устройство',
      },
    },
    cassandraGrpc: {
      title: 'Проект 4: Cassandra + gRPC ML',
      description:
        'Дистиллирует медленную неконтролируемую кластеризацию BERTopic из AutoTopic в быстрый контролируемый классификатор: размеченная выборка хранится в Apache Cassandra, а предсказания обслуживаются за миллисекунды через реальный Coordinator-под, который распределяет gRPC-вызовы по реальным worker-подам в кластере Kubernetes.',
      stack: {
        item1: 'Apache Cassandra 5 (хранение: requests, predictions, training_runs)',
        item2: 'gRPC + Protocol Buffers (Predict / Train / GetStatus)',
        item3: 'TF-IDF + LogisticRegression по схеме One-vs-Rest, n_jobs=-1 (scikit-learn)',
        item4: 'Бэкенд FastAPI в роли координатора и шлюза к воркеру',
        item5: 'Реальный самоотчётный статус системы (psutil) — масштабирование пула воркеров меняет число реплик реального Deployment в Kubernetes',
      },
    },
  },
  techMatrix: {
    heading: 'Полная матрица технологического стека',
    headers: {
      component: 'Компонент',
      originalLibrary: 'Исходная библиотека / фреймворк',
      inThisWebApp: 'В этом веб-приложении',
    },
    rows: {
      topicModeling: {
        component: 'Тематическое моделирование',
        inApp: 'Реально: выполняется через FastAPI на примере данных или загруженном корпусе',
      },
      embeddings: {
        component: 'Эмбеддинги',
        inApp: 'Реально: модель загружается в бэкенде один раз',
      },
      hyperparameterOptimization: {
        component: 'Оптимизация гиперпараметров',
        inApp: 'Только офлайн (main.py) — слишком медленно для запроса в реальном времени',
      },
      reinforcementLearning: {
        component: 'Обучение с подкреплением',
        inApp:
          'По умолчанию — симуляция на Canvas; «Живая демонстрация с бэкендом» обращается к реальной предобученной политике (при невозможности загрузки используется эвристика)',
      },
      computerVisionSensors: {
        component: 'Компьютерное зрение и сенсоры',
        inApp:
          'По умолчанию — симуляция на Canvas; «Живая демонстрация с бэкендом» выполняет реальный код коррекции дисторсии и проекции на примере кадра',
      },
      ecgSignalProcessing: {
        component: 'Обработка сигнала ЭКГ',
        inApp: 'Реально: выполняется на встроенном примере, синтетическом сигнале или вашем .npy-файле',
      },
      ecgClassification: {
        component: 'Классификация ЭКГ',
        inApp: 'Реально: те же обученные веса, исправленная предобработка (см. README проекта)',
      },
      distributedStorage: {
        component: 'Распределённое хранение',
        inApp: 'Реально: keyspace Cassandra загружается и опрашивается вживую (requests, predictions, training_runs)',
      },
      distributedServing: {
        component: 'Распределённое обслуживание модели',
        inApp: 'Реально: HTTP-вызов к Coordinator-поду, который распределяет gRPC-запросы по реальным worker-подам в кластере Kubernetes',
      },
      frontendInterface: {
        component: 'Frontend-интерфейс',
      },
    },
  },
};
