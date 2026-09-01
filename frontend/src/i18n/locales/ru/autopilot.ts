export const autopilot = {
  banner: {
    eyebrow: 'Автопилот автомобиля: RL и компьютерное зрение',
    title: 'Слияние сенсорных данных KITTI и политика автопилота SAC/DDPG',
    descriptionPrefix:
      'Обрабатывает видеопоток камеры с частотой 60 кадров/с, 3D-облака точек Velodyne LiDAR, телеметрию GPS/IMU OXTS и треклеты в собственной среде Gym (',
    descriptionSuffix: ').',
    illustrativeNote:
      'Последовательность движения, телеметрия и график вознаграждения ниже — иллюстративные примерные данные (исходный набор данных KITTI не включён в этот репозиторий) — реальный код проекта, работающий с встроенным примером кадра и настоящей предобученной политикой, см. в разделе «Живая демонстрация с бэкендом».',
    pauseStreamButton: 'Остановить поток KITTI',
    streamDriveButton: 'Запустить поток KITTI',
    lensUndistorted: 'Объектив: без искажений',
    lensRaw: 'Объектив: с искажением',
  },
  timeline: {
    sequenceLabel: 'Последовательность:',
    frameCounter: 'Кадр №{{frameId}} / {{total}}',
  },
  cameraView: {
    heading: 'Передняя камера 00 (RGB)',
    subheading: 'Проекция P_rect_00',
    hudCamLabel: 'KITTI CAM 00 | КАДР №{{frameId}}',
    hudSpeedLabel: 'СКОРОСТЬ (vf): {{value}} м/с',
    hudYawRateLabel: 'РЫСКАНИЕ: {{value}} рад/с',
    hudLensLabel: 'ОБЪЕКТИВ: {{state}}',
    hudLensUndistorted: 'БЕЗ ИСКАЖЕНИЙ',
    hudLensDistorted: 'С ИСКАЖЕНИЕМ (RAW)',
  },
  lidarView: {
    heading: 'Velodyne LiDAR — вид сверху (3D-облако)',
    pointsCount: '{{count}} точек',
  },
  telemetry: {
    vehicleSpeedLabel: 'Скорость автомобиля (vf)',
    vehicleSpeedCaption: '{{value}} м/с (OXTS)',
    yawRateLabel: 'Скорость рыскания (ω)',
    yawRateCaption: 'Угловая скорость',
    nearestObstacleLabel: 'Ближайшее препятствие',
    nearestObstacleCaption: 'Дистанция до впереди идущего автомобиля',
    gymStepRewardLabel: 'Вознаграждение за шаг Gym',
    cumulativeCaption: 'Накопленное: {{value}}',
  },
  rewardChart: {
    heading: 'Вознаграждение агента RL за шаг и дистанция до препятствия',
    subheading: 'Рассчитывается функцией KITTICarEnv.calculate_reward() в реальном времени',
    rewardSeriesName: 'Вознаграждение',
    obstacleHeadwaySeriesName: 'Дистанция до препятствия (м)',
  },
  policyPanel: {
    heading: 'Политика и пространство действий',
    sacPretrainedButton: 'Предобученная SAC',
    manualOverrideButton: 'Ручное управление',
    steeringRangeLabel: 'Руль (-1..1):',
    throttleRangeLabel: 'Газ (0..1):',
    brakeRangeLabel: 'Тормоз (0..1):',
    manualSteeringLabel: 'Ручное управление рулём: {{value}}',
    manualThrottleLabel: 'Ручное управление газом: {{value}}',
  },
  calibration: {
    heading: 'Калибровка камеры (K_00, D_00)',
    instructions:
      'Измените эти значения, а затем используйте живую демонстрацию с бэкендом ниже, чтобы запустить с ними реальный код проекта для коррекции дисторсии/проекции.',
    resetButton: 'Сбросить к значениям KITTI по умолчанию',
  },
  safetyLog: {
    heading: 'Журнал штрафов и событий безопасности',
    eventsCount: '{{count}} событий',
    noticeDescription:
      'Реальное евклидово расстояние от координат сенсорной системы синтетического облака точек LiDAR до ближайшей точки, проецируемой в видимый кадр камеры (порог предупреждения: {{threshold}} м, из раздела «Живая демонстрация с бэкендом» ниже).',
    emptyState: 'Штрафы за безопасность не зафиксированы. Плавная поездка!',
    feedEntry: '[Кадр №{{frameId}}] {{message}}',
  },
  warnings: {
    objectDetected: 'ПРЕДУПРЕЖДЕНИЕ: обнаружен объект на расстоянии {{distance}} м',
    clear: 'Чисто: ближайший объект на расстоянии {{distance}} м',
  },
  liveDemo: {
    heading: 'Живая демонстрация с бэкендом',
    descriptionPrefix:
      'Два дисплея выше — это визуализация на стороне клиента (исходный набор данных KITTI не включён в этот репозиторий). Всё, что ниже, обращается к реальному бэкенду, который выполняет настоящий код OpenCV / предобученной политики проекта из ',
    descriptionSuffix: ' на встроенном примере кадра.',
  },
  cvColumn: {
    heading: 'Компьютерное зрение',
    runUndistortButton: 'Запустить коррекцию дисторсии',
    runLidarButton: 'Запустить LiDAR',
    undistortErrorFallback: 'Запрос коррекции дисторсии не выполнен.',
    lidarErrorFallback: 'Запрос наложения LiDAR не выполнен.',
    emptyState: 'Нажмите «Запустить коррекцию дисторсии», чтобы загрузить пример кадра с бэкенда.',
    originalFrameAlt: 'Исходный пример кадра',
    undistortedFrameAlt: 'Пример кадра после коррекции дисторсии',
    badgeUndistortedLidar: 'без искажений + LiDAR',
    badgeUndistorted: 'без искажений',
    badgeOriginal: 'исходный',
    compareLabel: 'Сравнение: исходный ↔ без искажений',
    zoomLabel: 'Масштаб',
    showLidarOverlayLabel: 'Показать наложение LiDAR',
    lidarPointsLabel: 'Точки LiDAR',
    pointSizeLabel: 'Размер точки',
  },
  policyColumn: {
    heading: 'Автономная политика',
    queryButton: 'Запросить политику (текущий кадр)',
    policyErrorFallback: 'Запрос предсказания политики не выполнен.',
    emptyState: 'Нажмите «Запросить политику», чтобы выполнить реальный прямой проход через веса предобученной SAC.',
    sourceLabel: 'Источник',
    atBoundTitle: 'Значение находится на границе (или в пределах эпсилон от границы) пространства действий',
    atBoundBadge: 'на границе',
    observationLabel: 'наблюдение: {{shape}}',
    modelHeuristic: 'Эвристика',
  },
  actionLabels: {
    steering: 'Руль',
    throttle: 'Газ',
    brake: 'Тормоз',
  },
  metrics: {
    frameSizeLabel: 'Размер кадра',
    frameSizeTooltip: 'Фактические размеры в пикселях встроенного примера кадра.',
    undistortTimeLabel: 'Время коррекции дисторсии',
    undistortTimeTooltipLive:
      'Фактическое время выполнения cv2.getOptimalNewCameraMatrix + cv2.undistort для этого кадра, измеренное на сервере.',
    undistortTimeTooltipStatic:
      'Фактическое время выполнения cv2.getOptimalNewCameraMatrix + cv2.undistort, измеренное на сервере.',
    pointsGeneratedLabel: 'Сгенерировано точек',
    pointsGeneratedTooltip:
      'Размер синтетического облака точек LiDAR, сгенерированного для этого запроса (реальные данные облака точек не включены).',
    pointsInFrameLabel: 'Точек в кадре',
    pointsInFrameTooltip:
      'Сколько из сгенерированных точек спроецировалось в допустимые координаты пикселей внутри изображения после velo_to_cam() + project_to_image().',
    nearestDistanceLabel: 'Ближайшее расстояние',
    nearestDistanceTooltipLive:
      'Реальное евклидово расстояние до ближайшей точки LiDAR в кадре, от координат сенсорной системы синтетического облака точек.',
    nearestDistanceTooltipStatic:
      'Реальное евклидово расстояние от сенсорной системы LiDAR до ближайшей точки в кадре.',
    lidarTimeLabel: 'Время LiDAR',
    lidarTimeTooltip: 'Фактическое время проекции и отрисовки наложения, измеренное на сервере.',
    inferenceTimeLabel: 'Время инференса',
    inferenceTimeTooltip:
      'Фактическое время прямого прохода модели (или эвристического расчёта), измеренное на сервере.',
    modelLabel: 'Модель',
    lidarPointsLabel: 'Точки LiDAR',
    lidarPointsDetail: '{{count}} в кадре',
    lidarPointsTooltip:
      'Размер синтетического облака точек, спроецированного через реальный конвейер velo_to_cam()/project_to_image(), и сколько из них попало в видимое изображение.',
    policyInferenceLabel: 'Инференс политики',
    policyInferenceTooltip:
      'Реальная задержка прямого прохода через модель, которая непосредственно сформировала действие ниже.',
    policyInferenceDetailPretrained: 'Предобученная SAC',
    policyInferenceDetailHeuristic: 'Резервная эвристика',
  },
  staticResults: {
    eyebrow: 'Результаты',
    title: 'Реальные результаты конвейера',
    description:
      'Сохранённый реальный запуск конвейера бэкенда (тот же код, что и в живой демонстрации выше) — сгенерирован один раз на основе настоящей коррекции дисторсии OpenCV, проекции LiDAR и предобученной политики SAC, поэтому результаты ниже видны сразу, без необходимости что-либо запускать.',
    originalFrameLabel: 'Исходный кадр KITTI',
    originalFrameCaption: 'Встроенный пример кадра камеры до какой-либо обработки.',
    undistortedLabel: 'Без искажений',
    undistortedCaption: 'cv2.undistort() с калибровкой ниже ({{ms}} мс).',
    lidarOverlayLabel: 'Наложение LiDAR',
    lidarOverlayCaption: 'velo_to_cam() + project_to_image(), {{inFrame}} из {{generated}} точек в кадре.',
    warningDescription:
      'Реальное евклидово расстояние до ближайшей точки LiDAR, спроецированной в кадр (seed={{seed}}, порог {{threshold}} м).',
    policyActionHeading: 'Действие политики ({{modelName}})',
    inputStateCaption:
      'Пример входного состояния: speed={{speed}} м/с, yaw_rate={{yawRate}} рад/с, nearest_obstacle_dist={{dist}} м, lane_offset={{offset}} м — {{note}}',
    demonstratesLabel: 'Что это демонстрирует:',
    demonstratesBodyPrefix:
      ' весь стек компьютерного зрения и управления работает от начала до конца на реальном коде — коррекция дисторсии объектива OpenCV с реальной калибровкой в стиле KITTI, реальное синтетическое облако точек LiDAR, спроецированное через настоящую математику проекции камеры проекта (с работающим предупреждением о приближении на <10 м), и реальный прямой проход через предобученную сеть политики SAC. Каждое число выше получено из одного реального запуска',
    demonstratesBodyMiddle: ', и',
    demonstratesBodySuffix: ' — попробуйте интерактивную демонстрацию выше, чтобы запустить её снова с вашими собственными параметрами.',
  },
};
