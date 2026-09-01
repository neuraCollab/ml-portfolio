export const autotopic = {
  banner: {
    eyebrow: 'Конвейер AutoTopic',
    title: 'Автоматический тематический анализ неструктурированных текстовых логов',
    description:
      'Объединяет эмбеддинги SentenceTransformers, снижение размерности UMAP, кластеризацию HDBSCAN и c-TF-IDF с оптимизацией гиперпараметров Optuna.',
    executeButtonLabel: 'Запустить конвейер BERTopic',
    analyzeFileLabel: 'Анализировать {{fileName}}',
    processingLabel: 'Выполняется конвейер...',
    exportJsonButton: 'Экспорт JSON',
    pipelineFailedPrefix: 'Ошибка конвейера: ',
    datasetProvenance: {
      prefix: 'Эти результаты получены на реальной случайной выборке из ',
      middle: ' из ',
      rowsLoadedFrom: ' строк, загруженных из ',
      suffix: ' -- а не встроенного демонстрационного набора.',
    },
  },
  pipeline: {
    stage1: 'Этап 1: очистка текста (HTML, эмодзи, префиксы LLM)',
    stage2: 'Этап 2: лемматизация (pymorphy3 для ru / spaCy для en)',
    stage3: 'Этап 3: вычисление эмбеддингов (SentenceTransformers MiniLM-L12)',
    stage4: 'Этап 4: снижение размерности UMAP и кластеризация HDBSCAN',
    stage5: 'Этап 5: представление тем c-TF-IDF и расчёт метрик',
  },
  errors: {
    backendUnreachable: 'Не удалось связаться с бэкендом.',
    staticResultsLoadFailed: 'Не удалось загрузить сохранённый снимок результатов по полному набору данных.',
    fullPipelineStartFailed: 'Не удалось запустить полный конвейер.',
    pipelineRunFailed: 'Непредвиденная ошибка при выполнении конвейера.',
  },
  config: {
    cleaningHeading: 'Этап очистки текста',
    removeHtmlLabel: 'Удалять HTML-теги',
    removeEmojisLabel: 'Убирать эмодзи и символы',
    removeCodeLabel: 'Очищать фрагменты кода и SQL',
    removeLlmPrefixLabel: 'Фильтровать префиксы моделей LLM',
    bertopicHeading: 'Настройки BERTopic и Optuna',
    topNWordsLabel: 'Топ-N ключевых слов на тему',
    languageModeLabel: 'Языковой режим',
    languageModeMixed: 'Смешанный (Ru и En — многоязычная MiniLM)',
    languageModeRu: 'Только русский (pymorphy3)',
    languageModeEn: 'Только английский (spaCy)',
  },
  upload: {
    heading: 'Загрузите собственный CSV',
    helpPrefix: 'Требуется столбец ',
    helpSuffix: '. Оставьте это поле пустым, чтобы использовать {{count}} встроенных примеров логов ниже.',
    clearButton: 'Очистить',
  },
  dataset: {
    heading: 'Реальный набор данных (parquet)',
    checkingLocation: 'Проверка расположения набора данных...',
    foundRows: 'Найдено -- {{count}} реальных строк.',
    notFound: 'Не найден по указанному расположению.',
    envVarNote: {
      prefix: 'Расположение задаётся переменной окружения ',
      middle: ' (файл backend/.env.example) -- сейчас это ',
      localPathSuffix: ', локальный путь. ',
      replaceHint: 'Замените его ссылкой на Google Drive после загрузки',
      seeSuffix: ' -- см. ',
    },
    sampleSizeLabel: 'Размер выборки (случайная, реальные строки)',
    runOnDatasetButton: 'Запустить BERTopic на выборке реального набора данных',
  },
  customLog: {
    heading: 'Добавить собственный лог-документ',
    placeholder:
      'Вставьте одну или несколько строк лога, по одной на строку (например, «Error 500: Database connection pool exhausted...»)',
    addButton: '+ Добавить в набор образцов ({{count}} документов, перезапустите для повторной кластеризации)',
  },
  demo: {
    runningHeading: 'Выполняется реальный конвейер...',
    noResultsHeading: 'Пока нет результатов',
    noResultsPrefix: 'Нажмите ',
    noResultsSuffix:
      ', чтобы запустить реальный конвейер очистка → эмбеддинги → UMAP/HDBSCAN → c-TF-IDF на {{count}} встроенных примерах логов (или на вашем загруженном CSV).',
  },
  fullPipeline: {
    eyebrow: 'Конвейер по полному набору данных',
    title: 'Запустить реальный конвейер на всём наборе данных',
    descriptionPrefix:
      'Тот же реальный конвейер очистка → лемматизация → фильтрация → эмбеддинги → UMAP/HDBSCAN → c-TF-IDF, что и выше, но по каждой реальной строке в ',
    configuredDatasetFallback: 'настроенном наборе данных',
    descriptionMiddle: ', а не по ограниченной выборке -- так же, как ',
    descriptionSuffix:
      ' обучается на полном корпусе. Это действительно долгая CPU-задача (только вычисление эмбеддингов занимает примерно 45-75 минут на ~370 тыс. строк, плюс время на кластеризацию сверху), поэтому она выполняется как фоновая задача, которую можно оставить работать и проверить позже.',
    runningButton: 'Выполняется...',
    runButton: 'Запустить полный конвейер (весь набор данных)',
    workingFallback: 'Выполняется...',
    completedStatus: 'Завершено',
    failedStatus: 'Ошибка',
    totalRows: 'Всего строк: {{count}}',
    surviving: 'Осталось после фильтрации: {{count}}',
    elapsed: 'Прошло: {{minutes}} мин',
  },
  staticResults: {
    eyebrow: 'Результаты',
    title: 'Результаты реального конвейера на полном наборе данных',
    liveResultsPrefix: 'Результаты задачи, которую вы только что запустили выше, по каждой реальной строке в ',
    snapshotResultsPrefix: 'Сохранённый снимок реального запуска полного конвейера выше, по каждой реальной строке в ',
    documentsClusteredSuffix: ' -- {{docCount}} реальных документов, объединённых в {{topicCount}} реальных тем.',
    visibleImmediatelyNote: ' Видно сразу, без необходимости самостоятельно запускать задачу (~45-70 минут).',
    noResultsDescription:
      'Сохранённый снимок реального запуска конвейера на полном наборе данных -- виден сразу, без необходимости самостоятельно запускать задачу (~45-70 минут).',
    loadingSnapshot: 'Загрузка сохранённых результатов...',
    documentsHeadingPreview: 'Классифицированные лог-документы (случайный предпросмотр {{count}})',
  },
  resultsPanel: {
    metrics: {
      documentsAnalyzedLabel: 'Проанализировано документов',
      documentsAnalyzedTooltip:
        'Количество входных документов, которые прошли очистку/нормализацию/фильтрацию и были переданы в BERTopic.',
      discoveredTopicsLabel: 'Обнаружено тем',
      discoveredTopicsDetail: 'Без учёта шума (-1)',
      discoveredTopicsTooltip:
        'Количество отдельных тематических кластеров, найденных HDBSCAN, без учёта категории «шум» (-1).',
      outliersLabel: 'Выбросы',
      outliersTooltip:
        'Документы, которые HDBSCAN не смог уверенно отнести ни к одной теме (id темы -1). Высокая доля выбросов обычно означает, что корпус слишком мал, зашумлён или слишком разнороден для текущих настроек min_topic_size/umap_n_neighbors.',
      coherenceLabel: 'Связность (c_uci)',
      coherenceTooltip:
        'Связность Gensim c_uci: насколько семантически связаны топ-слова внутри каждой темы, на основе частоты их совместной встречаемости в корпусе. Чем выше, тем лучше; на небольших корпусах может быть отрицательной.',
      diversityLabel: 'Разнообразие',
      diversityTooltip:
        'Доля уникальных слов среди топ-ключевых слов всех тем. 1.0 означает, что ни одно слово не повторяется между темами (максимально различимые темы).',
      compositeScoreLabel: 'Составная оценка',
      compositeScoreTooltip:
        'coherence_uci + 0.2 x diversity -- та же целевая функция, которую оптимизирует собственная настройка Optuna в AutoTopic (pipeline/optuna_tune.py).',
    },
    topicSizeChart: {
      heading: 'Распределение размеров тем (кластеры HDBSCAN)',
      subheading: 'Количество неструктурированных лог-документов, отнесённых к каждой теме',
    },
    keywords: {
      heading: 'Представление тем ключевыми словами (c-TF-IDF)',
      topicButtonTitle: 'Показать документы этой темы в таблице ниже',
      topicLabel: 'Тема {{id}}: {{name}}',
      selectedTopicSummary: 'Выбранная тема №{{id}} ({{percentage}}% корпуса)',
      keyTermsCount: '{{count}} ключевых слов',
      representativeDocsHeading: 'Репрезентативные документы (ближайшие к центроиду темы, по данным BERTopic)',
    },
    optuna: {
      heading: 'История подбора гиперпараметров Optuna',
      subheading: 'Отслеживание составной оценки = связность (c_uci) + 0.2 × разнообразие',
      compositeScoreSeriesName: 'Составная оценка',
      coherenceSeriesName: 'Связность (c_uci)',
      emptyStatePrefix:
        'Настройка Optuna не выполняется прямо в этой живой демонстрации (20+ прогонов BERTopic были бы слишком медленными для цикла запрос/ответ) -- она выполняется офлайн через ',
      emptyStateSuffix: '.',
    },
    documentsTable: {
      headingDefault: 'Классифицированные лог-документы ({{count}} шт.)',
      searchPlaceholder: 'Поиск по логам...',
      allTopicsOption: 'Все темы',
      topicOption: 'Тема №{{id}}: {{name}}',
      colDocId: 'ID документа',
      colRawLogText: 'Исходный текст лога',
      colCleanedOutput: 'Очищенный текст',
      colTopic: 'Тема',
      colConfidence: 'Уверенность',
      noiseFallback: 'Шум',
    },
  },
};
