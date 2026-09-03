export const overview = {
  banner: {
    eyebrow: 'Repository Overview & Architecture',
    title: 'Machine Learning Portfolio: AutoTopic, RL Autopilot, ECG Edge AI & Cassandra gRPC ML',
    description:
      "Four projects spanning NLP, reinforcement learning, edge AI, and distributed systems, " +
      "consolidated into one dashboard backed by a FastAPI service that runs each project's real Python code.",
    tags: {
      nlpTopicModeling: 'NLP / Topic Modeling',
      reinforcementLearning: 'Reinforcement Learning',
      computerVision: 'Computer Vision',
      signalProcessing: 'Signal Processing',
      edgeAi: 'Edge AI',
      distributedSystems: 'Distributed Systems',
      backendEngineering: 'Backend Engineering',
    },
  },
  techStackHeading: 'Core Architecture & Tech Stack:',
  projects: {
    autotopic: {
      title: 'Project 1: AutoTopic NLP Pipeline',
      description: 'Unsupervised topic discovery in unstructured text logs -- no manual annotation required.',
      stack: {
        item1: 'BERTopic + SentenceTransformers (MiniLM-L12)',
        item2: 'UMAP (cosine) + HDBSCAN density clustering',
        item3: 'Optuna (TPE Sampler) hyperparameter tuning',
        item4: 'Coherence UCI (c_uci) & Diversity metrics evaluation',
        item5: 'MLflow experiment tracking & Streamlit frontend',
      },
    },
    autopilot: {
      title: 'Project 2: RL & CV Autonomous Driving',
      description: 'A driving policy trained with reinforcement learning on KITTI, fusing camera, LiDAR, and IMU sensor data.',
      stack: {
        item1: 'OpenCV lens undistortion & camera calibration',
        item2: 'Velodyne LiDAR 3D point cloud projection (Tr_velo_to_cam)',
        item3Prefix: 'Custom OpenAI Gym environment (',
        item3Suffix: ')',
        item4: 'Stable-Baselines3 (SAC MultiInputPolicy)',
        item5: 'Tracklet 3D bounding boxes & obstacle-proximity reward shaping',
      },
    },
    ecg: {
      title: 'Project 3: Raspberry Pi ECG / Edge AI',
      description: 'A Raspberry Pi 5 edge device that reconstructs a 6-lead ECG from 2 physical channels and classifies 19 rhythm patterns locally.',
      stack: {
        item1: 'AD8232 + Arduino Nano x2 → serial → Raspberry Pi 5',
        item2: 'Butterworth bandpass (0.5-40Hz) + Einthoven/Goldberger reconstruction',
        item3: 'ECGNet (Conv1d x4) TorchScript, trained on PTB-XL',
        item4: 'FastAPI + WebSocket, CPU-only edge inference',
        item5: 'Research prototype -- not a certified medical device',
      },
    },
    cassandraGrpc: {
      title: 'Project 4: Cassandra + gRPC ML',
      description:
        'A distributed ML serving system: a FastAPI gateway routes requests through a Coordinator ' +
        'that round-robins gRPC calls across real Kubernetes worker replicas. Cassandra holds ' +
        'application state and model metadata; MinIO holds the model artifacts. The model itself is ' +
        'intentionally lightweight -- the point is the serving infrastructure.',
      stack: {
        item1: 'FastAPI gateway + Coordinator: real k8s pod discovery, round-robin routing, retry-on-failure',
        item2: 'gRPC + Protocol Buffers (Predict / Train / GetStatus)',
        item3: 'Apache Cassandra 5 (state/metadata) + MinIO (model artifacts)',
        item4: 'Real Kubernetes Deployment scaling (1-5 worker replicas) + failure injection',
        item5: 'ML workload: TF-IDF + One-vs-Rest LogisticRegression (scikit-learn)',
      },
    },
  },
  techMatrix: {
    heading: 'Complete Technology Stack Matrix',
    headers: {
      component: 'Component',
      originalLibrary: 'Original Library / Framework',
      inThisWebApp: 'In This Web App',
    },
    rows: {
      topicModeling: {
        component: 'Topic Modeling',
        inApp: 'Real: runs via FastAPI on the sample or uploaded corpus',
      },
      embeddings: {
        component: 'Embeddings',
        inApp: 'Real: model loaded once in the backend',
      },
      hyperparameterOptimization: {
        component: 'Hyperparameter Optimization',
        inApp: 'Offline only (main.py) -- too slow for a live request',
      },
      reinforcementLearning: {
        component: 'Reinforcement Learning',
        inApp: 'Real pretrained SAC policy, queried live (falls back to a heuristic if it can\'t load)',
      },
      computerVisionSensors: {
        component: 'Computer Vision & Sensors',
        inApp: 'Real undistort/projection code, run on real KITTI frames',
      },
      ecgSignalProcessing: {
        component: 'ECG Signal Processing',
        inApp: 'Real: runs on a bundled sample, synthetic signal, or your .npy upload',
      },
      ecgClassification: {
        component: 'ECG Classification',
        inApp: 'Real: same trained weights, corrected preprocessing (see project README)',
      },
      distributedStorage: {
        component: 'Distributed Storage',
        inApp: 'Real: Cassandra keyspace ingested and queried live (requests, predictions, training_runs, model metadata)',
      },
      distributedServing: {
        component: 'Distributed Model Serving',
        inApp: 'Real: HTTP call to a Coordinator pod, which round-robin dispatches gRPC to one of N real worker pods in a Kubernetes cluster',
      },
      frontendInterface: {
        component: 'Frontend Interface',
      },
    },
  },
};
