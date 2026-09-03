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
      realDatasetSuffix: ' real rows from the configured dataset -- not the bundled demo sample.',
    },
  },
  hero: {
    metricRowsLabel: 'Rows in dataset',
    metricDocsLabel: 'Documents analyzed',
    metricTopicsLabel: 'Topics discovered',
    launchDemoButton: 'Launch Demo',
    viewPipelineButton: 'View Pipeline',
    githubButton: 'GitHub',
    whatIBuiltHeading: 'What I built',
    whatIBuiltBody:
      "Designed and implemented an end-to-end unsupervised NLP pipeline (text cleaning, lemmatization/filtering, sentence-embedding computation, UMAP dimensionality reduction, HDBSCAN density clustering, c-TF-IDF topic labeling, and Optuna hyperparameter tuning) that turns 373k+ real, unlabeled chatbot log messages into interpretable topics -- without hand-labeling a single one. Built an earlier classical LDA baseline to validate the approach before adopting BERTopic, added a real 2D UMAP projection of the existing sentence embeddings for the topic-map visualization, and implemented the FastAPI backend and React/TypeScript frontend, including the interactive demo, which runs the exact same code path as the full-dataset run on a smaller sample so it fits in a request/response cycle.",
  },
  demoSection: {
    navLabel: 'Demo',
    title: 'Interactive Demo',
    intro: 'Runs the real cleaning -> embedding -> UMAP/HDBSCAN -> c-TF-IDF pipeline on the bundled sample, an uploaded CSV, or a real random sample of the full dataset below.',
  },
  technical: {
    detailsToggle: 'Show full technical details (dataset methodology, classical baseline study, error analysis, regression tests)',
  },
  mlflow: {
    heading: 'Experiment Tracking (MLflow)',
    body:
      "AutoTopic/main.py's offline full-corpus run logs to a real local MLflow tracking server -- not just to this dashboard. This isn't wired into the live backend demo above (that's a request/response API, not an experiment run), so there's nothing to link to here unless you run main.py yourself with an MLflow server up.",
    experimentLabel: 'Experiment',
    trackingUriLabel: 'Tracking URI',
    loggedLabel: 'Logs',
    loggedValue: 'Optuna params, coherence/diversity metrics, topic-size plot, per-topic wordclouds, embeddings + model artifacts',
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
    originHeading: 'Where this data comes from',
    originBody:
      'The log_text rows were collected independently, from real conversations between real users and a DeepSeek-backed chatbot. They are not synthetic or scraped -- each row is one real user message sent to the assistant.',
    privacyHeading: 'Privacy',
    privacyBody:
      'No usernames, account identifiers, or other personal information are exposed anywhere in this pipeline or dashboard -- only the message text itself, after the cleaning stage strips HTML, links, and other identifying fragments.',
    sharedWithCassandraNote:
      'This is the same underlying raw dataset (labeled_requests.parquet, 373k+ rows) that the Cassandra + gRPC ML project ingests -- see that project for a distributed-systems view of the same data.',
    textLengthFigureCaption:
      'Real text-length distribution of the dataset (word count per document, clipped at 150 for readability). Median length is 10 words -- this is a short-query corpus, mostly single questions or requests rather than long passages.',
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
    liveResultsPrefix: 'Results from the job you just ran above, over every real row in the configured dataset',
    snapshotResultsPrefix: 'A saved snapshot of a real run of the full pipeline above, over every real row in the configured dataset',
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
    topicMap: {
      heading: 'Topic Map',
      subheading: 'Real 2D UMAP projection of each document\'s sentence embedding, colored by assigned topic',
      caption: 'A second, cheap UMAP(n_components=2) fit on the same embeddings BERTopic already computed -- purely for this plot, not used for topic assignment. Documents that sit close together here have genuinely similar embeddings.',
      unavailableNote: 'This result set has no 2D coordinates (an older saved snapshot, generated before this projection was added). Run the live demo above for an interactive topic map.',
    },
    topicSizeChart: {
      heading: 'Topic Size Distribution (HDBSCAN Clusters)',
      subheading: 'Number of unstructured log documents assigned per topic',
    },
    keywords: {
      heading: 'Topic Keyword Representations (c-TF-IDF)',
      explorerHeading: 'Topic Explorer',
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
      pageLabel: 'Page {{current}} of {{total}}',
    },
  },
  architecture: {
    eyebrow: 'System Architecture',
    title: 'The Real BERTopic Pipeline',
    description:
      "This is the actual pipeline implemented in AutoTopic/ (see AutoTopic/README.md's own architecture diagram) -- not a simplified stand-in.",
    steps: {
      input: { title: 'Input', detail: 'A CSV (data.csv) or the real labeled_requests.parquet dataset -- one log_text column per document.' },
      cleaning: { title: 'Cleaning', detail: 'stages/cleaning.py -- strips HTML, emoji, links, code blocks, and LLM model-name mentions; filters characters and stop words.' },
      normalization: { title: 'Normalization', detail: 'stages/normalization.py -- pymorphy3 lemmatization for Russian text, spaCy for English.' },
      filtering: { title: 'Filtering', detail: 'stages/filtering.py -- drops documents containing links (if configured) and documents shorter than min_length words.' },
      embeddings: { title: 'Embeddings', detail: 'stages/embedding.py -- sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2, batch size 32, CPU or CUDA.' },
      umap: { title: 'UMAP', detail: 'n_components=5, metric=cosine (topic_modeling.py) -- reduces embedding dimensionality before clustering.' },
      hdbscan: { title: 'HDBSCAN', detail: 'metric=euclidean, min_cluster_size synced to min_topic_size -- density-based clustering with no fixed topic count.' },
      ctfidf: { title: 'c-TF-IDF', detail: 'CountVectorizer-based keyword extraction per discovered cluster (pipeline/viz.py, topic_modeling.py).' },
      outputs: { title: 'Outputs', detail: 'Topics + keywords logged to MLflow (localhost:5000) and served through the Streamlit app / this dashboard.' },
    },
  },
  baseline: {
    eyebrow: 'Baseline',
    title: 'Classical Topic Model vs. the Deployed BERTopic Model',
    intro:
      'Before BERTopic, the same general problem (topic modeling on this kind of short Russian-language chatbot query) was explored with classical, non-neural methods in a separate study on the same underlying raw dataset, filtered differently. NMF was tried first and abandoned -- it collapsed into a single dominant topic because the TF-IDF matrix was extremely sparse (99.93% zeros), which NMF cannot handle robustly. LDA, a Bayesian probabilistic model, proved far more stable on this sparse, short-text corpus and became the classical baseline shown below.',
    caveatHeading: 'Why coherence is not directly compared',
    caveatBody:
      "The classical study measured coherence with gensim's c_v formula; the deployed BERTopic pipeline measures coherence_uci and coherence_umass (see Metrics below). These are different formulas on different scales, so a side-by-side coherence number would be misleading. Diversity uses the same formula (unique words / total words) in both, so it is compared directly.",
    ldaCard: {
      title: 'Baseline: LDA-10 (classical, non-neural)',
      whyChosen:
        'Chosen after NMF failed on this sparse corpus. 10 topics selected for interpretability and coherence rather than minimum held-out perplexity (perplexity keeps decreasing as topic count grows -- see the model-selection figure below).',
      coherenceLabel: 'Coherence (c_v)',
      diversityLabel: 'Diversity',
      diversityApprox: '~0.91 (read from the chart)',
      validationLabel: 'Statistical validation',
      validationValue: '+4.9σ above a random permutation baseline -- topic structure confirmed non-random',
      stabilityLabel: 'Topic stability (5 reruns)',
      stabilityValue: 'mean 0.376, pass threshold 0.3 -- passes on aggregate, but 4 of 10 individual topics fall below threshold (see Error Analysis)',
    },
    modelCard: {
      title: 'Model: BERTopic (deployed, neural embeddings)',
      diversityLabel: 'Diversity',
      coherenceUciLabel: 'Coherence (c_uci)',
      coherenceUmassLabel: 'Coherence (u_mass)',
      sourceNote: 'Numbers from the real full-dataset run in Results below.',
    },
    improvementLabel: 'Diversity comparison',
    improvementValue: 'BERTopic 0.966 vs. LDA-10 ~0.91 -- both near the top of the 0-1 range; BERTopic is marginally higher.',
    figures: {
      coherenceCaption:
        'LDA-10 coherence (0.4551) vs. a random-baseline distribution built from top-2000 unigrams. The real model sits well above the random range -- statistically real topic structure, not noise.',
      modelComparisonCaption: 'LDA-10 vs. LDA-15 on the two primary metrics used to pick the final topic count.',
      topWordsCaption: 'Top words for each of the 10 discovered topics -- concrete, human-readable examples (tarot readings, birthday greetings, fitness/health, recipes, Telegram channel content, and others).',
      topicSizeCaption: 'Document count per topic. Two topics (0 and 1) each cover more than 15% of the corpus -- a real class-imbalance the classical model was not tuned to correct.',
    },
  },
  metrics: {
    eyebrow: 'Metrics',
    title: 'How Topic Quality Is Measured',
    intro:
      'AutoTopic reports the same metrics used to tune it (pipeline/optuna_tune.py) -- there is no separate, prettier metric shown only on this page. These are computed by pipeline/metrics.py / evaluate_topics() every time a pipeline run completes.',
    compositeFormula: 'Tuning objective: composite_score = coherence_uci + 0.2 x diversity',
  },
  errorAnalysis: {
    eyebrow: 'Error Analysis',
    title: 'Known Failure Modes',
    modelNoteHeading: 'Deployed BERTopic model',
    modelNote:
      'No systematic error analysis (e.g. a labeled test set of misclassified documents) has been run against the deployed BERTopic model yet. The real outlier rate is visible in Results below (documents HDBSCAN could not confidently assign to any topic).',
    baselineStudyHeading: 'From the classical baseline study',
    baselineStudyIntro:
      "These findings are from the classical LDA baseline study described above, not the deployed BERTopic model -- they explain why that study moved away from supervised evaluation and flag which of its topics are least reliable.",
    confusionCaption:
      "The classical study first tried supervised classification (LinearSVC) using topic labels generated by an LLM plus an earlier, flawed classifier. This confusion matrix (50 classes) is almost empty off a few cells -- the labels were too unreliable for supervised evaluation to mean anything, which is why the study moved to unsupervised, intrinsic metrics (coherence, diversity) instead.",
    perClassF1Caption:
      'Per-class F1 for that same unreliable-label classifier: mean F1 = 0.359, ranging from ~0.84 (Tarot readings) down to near 0 (several vague or overlapping categories). Confirms the labels, not just the classifier, were the problem.',
    stabilityCaption:
      "LDA-10 topic stability across 5 reruns (mean best-Jaccard overlap). Passes on aggregate (mean 0.376 > 0.3 threshold), but 4 of the 10 individual topics -- 'rubles/reviews', 'weight/health', 'good day' greetings, and 'recipes/menu' -- fall below the threshold, meaning those specific topics are less reproducible run-to-run than the others.",
  },
  regressionTests: {
    eyebrow: 'Regression Tests',
    title: 'Schema Regression Tests',
    intro:
      'backend/tests/test_autotopic_schemas.py checks the request/response contracts AutoTopic\'s API relies on (config defaults and bounds, metrics/results round-tripping through JSON) -- the same pattern already used for Cassandra + gRPC ML\'s test suite. No network or database access required.',
    howToRerun: 'Re-run locally with: ',
    command: 'pytest backend/tests/test_autotopic_schemas.py -v',
  },
  presentation: {
    buttonLabel: 'Project Presentation',
    notConfiguredTooltip: 'Presentation link not yet configured -- set VITE_AUTOTOPIC_PRESENTATION_URL (see AutoTopic/README.md).',
  },
};
