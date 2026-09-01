export const autotopic = {
  banner: {
    eyebrow: 'AutoTopic Pipeline Engine',
    title: 'Automatic Unstructured Text Log Topic Analysis',
    description:
      'Combines SentenceTransformers embeddings, UMAP dimensionality reduction, HDBSCAN clustering, and c-TF-IDF with Optuna hyperparameter optimization.',
    executeButtonLabel: 'Execute BERTopic Pipeline',
    analyzeFileLabel: 'Analyze {{fileName}}',
    processingLabel: 'Processing Pipeline...',
    exportJsonButton: 'Export JSON',
    pipelineFailedPrefix: 'Pipeline failed: ',
    datasetProvenance: {
      prefix: 'These results are from a real random sample of ',
      middle: ' of ',
      rowsLoadedFrom: ' rows loaded from ',
      suffix: ' -- not the bundled demo sample.',
    },
  },
  pipeline: {
    stage1: 'Stage 1: Text Cleaning (HTML, Emojis, LLM prefixes)',
    stage2: 'Stage 2: Lemmatization (pymorphy3 ru / spaCy en)',
    stage3: 'Stage 3: Embedding Computation (SentenceTransformers MiniLM-L12)',
    stage4: 'Stage 4: UMAP Dimensionality Reduction & HDBSCAN Clustering',
    stage5: 'Stage 5: c-TF-IDF Topic Representations & Metric Calculation',
  },
  errors: {
    backendUnreachable: 'Could not reach the backend.',
    staticResultsLoadFailed: 'Could not load the static full-dataset results snapshot.',
    fullPipelineStartFailed: 'Could not start the full pipeline.',
    pipelineRunFailed: 'Unexpected error running the pipeline.',
  },
  config: {
    cleaningHeading: 'Text Cleaning Stage',
    removeHtmlLabel: 'Remove HTML tags',
    removeEmojisLabel: 'Strip Emojis & Symbols',
    removeCodeLabel: 'Clean Code & SQL snippets',
    removeLlmPrefixLabel: 'Filter LLM model prefixes',
    bertopicHeading: 'BERTopic & Optuna Config',
    topNWordsLabel: 'Top-N Keywords per Topic',
    languageModeLabel: 'Language Mode',
    languageModeMixed: 'Mixed (Ru & En - Multilingual MiniLM)',
    languageModeRu: 'Russian Only (pymorphy3)',
    languageModeEn: 'English Only (spaCy)',
  },
  upload: {
    heading: 'Upload Your Own CSV',
    helpPrefix: 'Needs a ',
    helpSuffix: ' column. Leave empty to use the {{count}} bundled sample log lines below.',
    clearButton: 'Clear',
  },
  dataset: {
    heading: 'Real Dataset (parquet)',
    checkingLocation: 'Checking dataset location...',
    foundRows: 'Found -- {{count}} real rows.',
    notFound: 'Not found at the configured location.',
    envVarNote: {
      prefix: 'Location is set by the ',
      middle: ' env var (backend/.env.example) -- currently ',
      localPathSuffix: ', a local path. ',
      replaceHint: 'Replace it with your Google Drive link once uploaded',
      seeSuffix: ' -- see ',
    },
    sampleSizeLabel: 'Sample size (random, real rows)',
    runOnDatasetButton: 'Run BERTopic on real dataset sample',
  },
  customLog: {
    heading: 'Add Custom Log Document',
    placeholder:
      "Paste one or more log lines, one per line (e.g. 'Error 500: Database connection pool exhausted...')",
    addButton: '+ Add to Sample Set ({{count}} docs, re-run to re-cluster)',
  },
  demo: {
    runningHeading: 'Running the real pipeline...',
    noResultsHeading: 'No results yet',
    noResultsPrefix: 'Click ',
    noResultsSuffix:
      ' to run the real cleaning → embedding → UMAP/HDBSCAN → c-TF-IDF pipeline on the {{count}} bundled sample log lines (or your uploaded CSV).',
  },
  fullPipeline: {
    eyebrow: 'Full Dataset Pipeline',
    title: 'Run the Real Pipeline on the Whole Dataset',
    descriptionPrefix:
      'Same real cleaning → lemmatization → filtering → embedding → UMAP/HDBSCAN → c-TF-IDF pipeline as above, but over every real row in ',
    configuredDatasetFallback: 'the configured dataset',
    descriptionMiddle: ' instead of a capped sample -- matching how ',
    descriptionSuffix:
      ' trains on the full corpus. This is a genuinely long CPU job (embeddings alone take roughly 45-75 minutes on ~370k rows, plus clustering time on top), so it runs as a background job you can leave running and check back on.',
    runningButton: 'Running...',
    runButton: 'Run Full Pipeline (Whole Dataset)',
    workingFallback: 'Working...',
    completedStatus: 'Completed',
    failedStatus: 'Failed',
    totalRows: 'Total rows: {{count}}',
    surviving: 'Surviving: {{count}}',
    elapsed: 'Elapsed: {{minutes}} min',
  },
  staticResults: {
    eyebrow: 'Results',
    title: 'Real Full-Dataset Pipeline Results',
    liveResultsPrefix: 'Results from the job you just ran above, over every real row in ',
    snapshotResultsPrefix: 'A saved snapshot of a real run of the full pipeline above, over every real row in ',
    documentsClusteredSuffix: ' -- {{docCount}} real documents clustered into {{topicCount}} real topics.',
    visibleImmediatelyNote: ' Visible immediately, no need to run the (~45-70 minute) job yourself.',
    noResultsDescription:
      'A saved snapshot of a real full-dataset pipeline run -- visible immediately, no need to run the (~45-70 minute) job yourself.',
    loadingSnapshot: 'Loading saved results...',
    documentsHeadingPreview: 'Classified Log Documents (random preview of {{count}})',
  },
  resultsPanel: {
    metrics: {
      documentsAnalyzedLabel: 'Documents Analyzed',
      documentsAnalyzedTooltip:
        'Number of input documents that survived cleaning/normalization/filtering and were actually fed into BERTopic.',
      discoveredTopicsLabel: 'Discovered Topics',
      discoveredTopicsDetail: 'Excludes noise (-1)',
      discoveredTopicsTooltip:
        "Number of distinct topic clusters HDBSCAN found, not counting the -1 'noise' bucket.",
      outliersLabel: 'Outliers',
      outliersTooltip:
        'Documents HDBSCAN could not confidently assign to any topic (topic id -1). A high outlier rate usually means the corpus is small, noisy, or too varied for the current min_topic_size/umap_n_neighbors settings.',
      coherenceLabel: 'Coherence (c_uci)',
      coherenceTooltip:
        'Gensim c_uci coherence: how semantically related the top words within each topic are, based on how often they co-occur in the corpus. Higher is better; can be negative on small corpora.',
      diversityLabel: 'Diversity',
      diversityTooltip:
        "Fraction of unique words across all topics' top keywords. 1.0 means no word is reused between topics (maximally distinct topics).",
      compositeScoreLabel: 'Composite Score',
      compositeScoreTooltip:
        "coherence_uci + 0.2 x diversity -- the same objective AutoTopic's own Optuna tuning (pipeline/optuna_tune.py) optimizes for.",
    },
    topicSizeChart: {
      heading: 'Topic Size Distribution (HDBSCAN Clusters)',
      subheading: 'Number of unstructured log documents assigned per topic',
    },
    keywords: {
      heading: 'Topic Keyword Representations (c-TF-IDF)',
      topicButtonTitle: "Show this topic's documents in the table below",
      topicLabel: 'Topic {{id}}: {{name}}',
      selectedTopicSummary: 'Selected Topic #{{id}} ({{percentage}}% of corpus)',
      keyTermsCount: '{{count}} Key Terms',
      representativeDocsHeading: 'Representative documents (closest to topic centroid, via BERTopic)',
    },
    optuna: {
      heading: 'Optuna Hyperparameter Tuning History',
      subheading: 'Tracking Composite Score = Coherence (c_uci) + 0.2 × Diversity',
      compositeScoreSeriesName: 'Composite Score',
      coherenceSeriesName: 'Coherence (c_uci)',
      emptyStatePrefix:
        "Optuna tuning isn't run inline in this live demo (20+ BERTopic trials would be too slow for a request/response cycle) -- it's run offline via ",
      emptyStateSuffix: '.',
    },
    documentsTable: {
      headingDefault: 'Classified Log Documents ({{count}} items)',
      searchPlaceholder: 'Search logs...',
      allTopicsOption: 'All Topics',
      topicOption: 'Topic #{{id}}: {{name}}',
      colDocId: 'Doc ID',
      colRawLogText: 'Raw Log Text',
      colCleanedOutput: 'Cleaned Output',
      colTopic: 'Topic',
      colConfidence: 'Confidence',
      noiseFallback: 'Noise',
    },
  },
};
