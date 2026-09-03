export const overview = {
  banner: {
    eyebrow: 'Обзор репозитория и архитектура',
    title: 'Портфолио машинного обучения: AutoTopic, RL-автопилот, ЭКГ Edge AI и Cassandra gRPC ML',
    description:
      'Четыре проекта — NLP, обучение с подкреплением, edge AI и распределённые системы — ' +
      'объединённые в единой панели на основе сервиса FastAPI, который выполняет реальный Python-код каждого проекта.',
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
      description: 'Обнаружение тем в неструктурированных текстовых логах без учителя — без ручной разметки данных.',
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
      description: 'Политика вождения, обученная RL на данных KITTI — объединяет камеру, LiDAR и данные IMU.',
      stack: {
        item1: 'Коррекция дисторсии объектива и калибровка камеры OpenCV',
        item2: 'Проекция 3D-облака точек Velodyne LiDAR (Tr_velo_to_cam)',
        item3Prefix: 'Собственная среда OpenAI Gym (',
        item3Suffix: ')',
        item4: 'Stable-Baselines3 (SAC MultiInputPolicy)',
        item5: '3D-рамки объектов и формирование награды по близости препятствий',
      },
    },
    ecg: {
      title: 'Проект 3: ЭКГ на Raspberry Pi / Edge AI',
      description: 'Периферийное устройство на Raspberry Pi 5, которое восстанавливает 6-канальную ЭКГ из 2 физических каналов и классифицирует 19 паттернов ритма локально.',
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
        'Распределённая система обслуживания ML: шлюз FastAPI направляет запросы через координатор, ' +
        'который распределяет gRPC-вызовы по round-robin между реальными репликами воркеров в ' +
        'Kubernetes. Cassandra хранит состояние приложения и метаданные модели; MinIO — артефакты ' +
        'модели. Сама модель намеренно облегчённая — суть проекта в инфраструктуре обслуживания.',
      stack: {
        item1: 'Шлюз FastAPI + координатор: реальное обнаружение подов k8s, round-robin, повтор при сбое',
        item2: 'gRPC + Protocol Buffers (Predict / Train / GetStatus)',
        item3: 'Apache Cassandra 5 (состояние/метаданные) + MinIO (артефакты моделей)',
        item4: 'Реальное масштабирование Kubernetes Deployment (1-5 реплик) + инъекция отказа',
        item5: 'ML-нагрузка: TF-IDF + LogisticRegression по схеме One-vs-Rest (scikit-learn)',
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
        inApp: 'Реальная предобученная политика SAC, опрашиваемая вживую (при невозможности загрузки — эвристика)',
      },
      computerVisionSensors: {
        component: 'Компьютерное зрение и сенсоры',
        inApp: 'Реальный код коррекции дисторсии и проекции, выполняемый на реальных кадрах KITTI',
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
        inApp: 'Реально: keyspace Cassandra загружается и опрашивается вживую (requests, predictions, training_runs, метаданные моделей)',
      },
      distributedServing: {
        component: 'Распределённое обслуживание модели',
        inApp: 'Реально: HTTP-вызов к поду координатора, который распределяет gRPC-запросы по реальным worker-подам в кластере Kubernetes',
      },
      frontendInterface: {
        component: 'Frontend-интерфейс',
      },
    },
  },
};
