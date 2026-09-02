export const overview = {
  banner: {
    eyebrow: 'Repository Overview & Architecture',
    title: 'Machine Learning Portfolio: AutoTopic, RL Autopilot, ECG Edge AI & Cassandra gRPC ML',
    description:
      "Four projects demonstrating machine learning, deep learning, signal processing, reinforcement learning, distributed systems, and backend/edge-AI engineering, consolidated into one dashboard backed by a FastAPI service that runs each project's real Python code.",
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
      description:
        'Automated topic discovery and interpretation in unstructured text logs. Built to accelerate incident resolution and product insights without manual dataset annotation.',
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
      description:
        'Autonomous driving policy trained with Reinforcement Learning on the KITTI Vision Benchmark dataset, combining camera streams, LiDAR point clouds, and OXTS IMU sensor fusion.',
      stack: {
        item1: 'OpenCV Camera Calibration & Lens Undistortion (K_00, D_00)',
        item2: 'Velodyne LiDAR 3D Point Cloud Projection (Tr_velo_to_cam)',
        item3Prefix: 'Custom OpenAI Gym Environment (',
        item3Suffix: ')',
        item4: 'Stable-Baselines3 (SAC & DDPG MultiInputPolicy)',
        item5: 'Tracklet 3D Bounding Boxes (tx, ty, tz) & Anomaly Detection',
      },
    },
    ecg: {
      title: 'Project 3: Raspberry Pi ECG / Edge AI',
      description:
        'Edge device (Raspberry Pi 5 + AD8232 + Arduino Nano) that reconstructs a 6-lead ECG from 2 physical channels and classifies 19 rhythm/conduction patterns locally, on-device.',
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
        'A distributed MLOps / ML serving system: a FastAPI gateway routes requests through a Coordinator pod that discovers and round-robin dispatches gRPC calls across real Kubernetes worker replicas, backed by Apache Cassandra for storage and cross-pod model persistence. The ML workload demonstrating the pipeline is a topic classifier distilled from AutoTopic\'s slower unsupervised BERTopic clustering -- the NLP methodology and model-quality work live on AutoTopic\'s own page.',
      stack: {
        item1: 'FastAPI gateway + Coordinator pod: real k8s pod discovery, round-robin routing, retry-on-failure',
        item2: 'gRPC + Protocol Buffers (Predict / Train / GetStatus)',
        item3: 'Apache Cassandra 5 (storage: requests, predictions, training_runs, cross-pod model persistence)',
        item4: 'Real Kubernetes Deployment scaling (1-5 worker replicas) via the Coordinator',
        item5: 'ML workload: TF-IDF + One-vs-Rest LogisticRegression, n_jobs=-1 (scikit-learn)',
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
        inApp:
          'Canvas sim by default; "Live Backend Demo" queries the real pretrained policy (falls back to a heuristic if it can\'t load)',
      },
      computerVisionSensors: {
        component: 'Computer Vision & Sensors',
        inApp:
          'Canvas sim by default; "Live Backend Demo" runs the real undistort/projection code on a sample frame',
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
        inApp: 'Real: Cassandra keyspace ingested and queried live (requests, predictions, training_runs)',
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
