import { createContext, useContext, useEffect, useMemo, useState } from "react";

const I18nContext = createContext(null);

const translations = {
  en: {
    common: {
      close: "Close",
      cancel: "Cancel",
      loading: "Loading...",
      dismiss: "Dismiss",
      noData: "No data available",
      language: "Language",
      english: "English",
      french: "French",
      arabic: "Arabic",
      notAvailable: "Not available"
    },
    nav: {
      appName: "MorocCare Access",
      overview: "Overview",
      map: "Map",
      simulate: "Simulate",
      analytics: "Analytics",
      uploadData: "Upload data",
      addNewCity: "+ Add new city..."
    },
    overview: {
      title: "Overview",
      findingTemplate: "{count} origin areas in {city} have low transport access.",
      isolatedTemplate: "The most isolated is {district} — {distance} from the nearest stop.",
      selectedCity: "the selected city",
      totalFacilities: "Total origin areas",
      totalStops: "Total transport stops",
      avgDistance: "Avg. distance to nearest stop",
      lowAccessFacilities: "Low-access origin areas",
      ranking: "Origin area ranking",
      switchBest: "Switch to best-first",
      switchWorst: "Switch to worst-first",
      loadingBaseline: "Loading baseline data..."
    },
    map: {
      showingSimulation: "Showing simulation results",
      scenario: "Scenario",
      selectedScenario: "Selected scenario",
      reset: "Reset",
      howToRead: "How to read this map",
      helpText:
        "Accessibility is measured by counting how many public transport stops are within walking distance of each facility, weighted by distance. A facility with many nearby stops scores higher.",
      wellConnected: "Well connected",
      moderateAccess: "Moderate access",
      hardToReach: "Hard to reach",
      transportStop: "Transport stop",
      baselineCircle: "— Solid circle = Baseline score",
      simulatedCircle: "-- Dashed circle = Score after simulation",
      layers: "Layers",
      showStops: "Show transport stops",
      colorBy: "Color by",
      accessibilityScore: "Accessibility score",
      travelTime: "Travel time",
      priority: "Priority",
      simulated: "Simulated",
      distanceToStop: "Distance to nearest stop",
      stopsWithin500: "Stops within 500m",
      whyScore: "Why this score?",
      loadingMap: "Loading map data...",
      selectCity: "Select a city to display district accessibility.",
      improvedBaseline: "Improved vs baseline",
      noMajorChange: "No major change",
      declinedBaseline: "Declined vs baseline",
      shorterTravel: "Shorter travel time",
      moderateTravel: "Moderate travel time",
      longerTravel: "Longer travel time",
      criticalPriority: "Critical priority",
      moderatePriority: "Moderate priority",
      lowerPriority: "Lower priority",
      lowerAccess: "Lower access",
      moderateAccessLabel: "Moderate access",
      higherAccess: "Higher access",
      legendNote: "Interpretation: red areas indicate planning pressure; green areas indicate stronger accessibility performance."
    },
    simulate: {
      title: "Simulate",
      subtitle: "Choose a scenario card and run a policy simulation.",
      runSimulation: "Run simulation ↗",
      resetBaseline: "Reset to baseline",
      projectedImpact: "projected impact",
      viewOnMap: "View on map",
      scenarioFallback: "Scenario",
      scenarios: {
        addStopsTitle: "Add bus stops near isolated facilities",
        addStopsDescription:
          "Place new stops within 200m of the 10 most isolated healthcare facilities. Targets facilities currently scoring below 0.35.",
        addStopsImpact: "Est. +18% avg. accessibility",
        extendTramTitle: "Extend tram coverage south",
        extendTramDescription:
          "Route the tramway through Sidi Othmane and Hay Mohammadi, two districts with high population and low transit density.",
        extendTramImpact: "Est. +31% in south districts",
        increaseFreqTitle: "Increase frequency on low-access lines",
        increaseFreqDescription: "Double the service frequency on bus lines L072 and L067, which serve the most underserved areas.",
        increaseFreqImpact: "Est. −12 min avg. wait time",
        addClinicsTitle: "Open 2 healthcare facilities near transit hubs",
        addClinicsDescription: "Place healthcare facilities at the two highest-traffic stops that have no facility within 600m.",
        addClinicsImpact: "Est. +24% equity score"
      },
      bars: {
        avgImprove: "Average accessibility improvement",
        equityGain: "Equity gain (Gini improvement)",
        threshold: "Bottom-quartile accessibility threshold",
        lowAccess: "Facilities still low-access (<0.35)"
      }
    },
    analytics: {
      title: "How the model makes decisions",
      subtitle: "How scores are spread across the city and what drives results.",
      populationWarning:
        "Population data was not provided for this city. Equity analysis is running in basic mode — showing accessibility score distribution only. To enable full equity analysis, re-upload with a population.csv file.",
      loading: "Loading analytics...",
      scoreSpread: "How scores are spread across the city",
      leftBehind: "Which areas are being left behind?",
      driversTitle: "What drives the accessibility score?",
      driversSubtitle: "These are the factors the model learned matter most.",
      topInsight: "Top factor: {label} ({pct})",
      secondInsight: "Second factor: {label} ({pct})",
      inequality: "Inequality index",
      na: "N/A"
    },
    facility: {
      highAccess: "High access",
      medium: "Medium",
      lowAccess: "Low access",
      score: "Score",
      nearestStop: "Nearest stop"
    },
    upload: {
      title: "Upload data",
      subtitle: "Upload CSV files and retrain the model for a city.",
      mode: "Mode",
      addNewCity: "Add a new city",
      updateCity: "Update existing city data",
      cityName: "City name",
      cityPlaceholder: "e.g. Marrakech",
      cityNameHelper: "This will be used as the city's identifier across the app.",
      selectCity: "Select city to update",
      healthcareCsv: "Healthcare facilities CSV",
      healthcareCols: "Columns: name, latitude, longitude",
      stopsCsv: "Transport stops CSV",
      stopsCols: "Columns: cluster_id, stop_name, Lines, mode, longitude, latitude",
      popCsv: "Population data CSV (optional)",
      popCols: "Columns: latitude, longitude, population_count. If omitted, equity analysis will run in basic mode.",
      browse: "Browse",
      noFile: "No file selected",
      training: "Training model for {city}... this takes 10–30 seconds",
      uploadFailed: "Upload failed",
      done: "Done! {city} is ready.",
      goToCity: "Go to {city}",
      addAnother: "Add another city",
      uploading: "Uploading...",
      uploadTrain: "Upload & train model",
      newCity: "new city",
      selectedCity: "selected city"
    },
    home: {
      dashboardTitle: "Healthcare accessibility dashboard",
      dashboardSubtitle: "Map-centric decision-support view for district-level accessibility, underserved risk, and scenario outcomes.",
      noCityTitle: "No city selected",
      noCitySubtitle: "Use the sidebar to select or upload city data",
      noCityBody: "No city data is currently selected.",
      rankingTitle: "Ranking and recommendations",
      rankingSubtitle: "Priority districts and candidate interventions",
      topUnderserved: "Top underserved districts",
      loadingRanking: "Loading ranking...",
      noRanking: "No ranking data available.",
      recommendedScenarios: "Recommended scenarios",
      loadingRecommendations: "Loading recommendations...",
      noRecommendations: "No recommendations available.",
      comparisonLine: "Comparison: {pct}% improvement, {improved}/{total} districts improved."
    },
    summary: {
      title: "City summary",
      subtitle: "High-level accessibility indicators",
      avgAccessibility: "Average accessibility",
      avgTravel: "Avg travel time",
      underservedDistricts: "Underserved districts",
      ofAll: "{pct}% of all districts",
      bestDistrict: "Best district",
      worstDistrict: "Worst district",
      scoreHint: "Score: {score}"
    },
    details: {
      title: "District details",
      subtitleSelected: "Selected district indicators",
      subtitleEmpty: "Click a district to inspect",
      noDistrict: "No district selected.",
      district: "District",
      underserved: "Underserved",
      served: "Served",
      accessibility: "Accessibility score",
      travel: "Travel time",
      sfca: "2SFCA score",
      population: "Population",
      interpUnderserved: "This district appears underserved and should be prioritized for interventions improving public-transport access to healthcare.",
      interpServed: "This district has comparatively stronger access conditions under current assumptions."
    },
    export: {
      button: "Export report",
      exporting: "Exporting...",
      started: "Report export started.",
      pdf: "Export PDF",
      excel: "Export Excel"
    }
  },
  fr: {
    common: {
      close: "Fermer",
      cancel: "Annuler",
      loading: "Chargement...",
      dismiss: "Ignorer",
      noData: "Aucune donnée disponible",
      language: "Langue",
      english: "Anglais",
      french: "Français",
      arabic: "Arabe",
      notAvailable: "Non disponible"
    },
    nav: {
      appName: "MorocCare Access",
      overview: "Vue d’ensemble",
      map: "Carte",
      simulate: "Simulation",
      analytics: "Analyses",
      uploadData: "Importer des données",
      addNewCity: "+ Ajouter une nouvelle ville..."
    },
    overview: {
      title: "Vue d’ensemble",
      findingTemplate: "{count} établissements dans {city} ont un faible accès au transport.",
      isolatedTemplate: "Le plus isolé est {district} — {distance} de l’arrêt le plus proche.",
      selectedCity: "la ville sélectionnée",
      totalFacilities: "Total des établissements",
      totalStops: "Total des arrêts de transport",
      avgDistance: "Distance moyenne à l’arrêt le plus proche",
      lowAccessFacilities: "Établissements à faible accès",
      ranking: "Classement des établissements",
      switchBest: "Trier du meilleur au pire",
      switchWorst: "Trier du pire au meilleur",
      loadingBaseline: "Chargement des données de référence..."
    },
    map: {
      showingSimulation: "Affichage des résultats simulés",
      scenario: "Scénario",
      selectedScenario: "Scénario sélectionné",
      reset: "Réinitialiser",
      howToRead: "Comment lire cette carte",
      helpText:
        "L’accessibilité est mesurée en comptant les arrêts de transport public accessibles à pied autour de chaque établissement, pondérés par la distance. Un établissement avec de nombreux arrêts proches obtient un score plus élevé.",
      wellConnected: "Bien connecté",
      moderateAccess: "Accès modéré",
      hardToReach: "Difficile d’accès",
      transportStop: "Arrêt de transport",
      baselineCircle: "— Cercle plein = Score de référence",
      simulatedCircle: "-- Cercle pointillé = Score après simulation",
      layers: "Couches",
      showStops: "Afficher les arrêts",
      colorBy: "Colorer par",
      accessibilityScore: "Score d’accessibilité",
      travelTime: "Temps de trajet",
      priority: "Priorité",
      simulated: "Simulé",
      distanceToStop: "Distance à l’arrêt le plus proche",
      stopsWithin500: "Arrêts dans un rayon de 500m",
      whyScore: "Pourquoi ce score ?",
      loadingMap: "Chargement de la carte...",
      selectCity: "Sélectionnez une ville pour afficher l’accessibilité des districts.",
      improvedBaseline: "Amélioration vs référence",
      noMajorChange: "Pas de changement majeur",
      declinedBaseline: "Dégradation vs référence",
      shorterTravel: "Temps de trajet plus court",
      moderateTravel: "Temps de trajet modéré",
      longerTravel: "Temps de trajet plus long",
      criticalPriority: "Priorité critique",
      moderatePriority: "Priorité modérée",
      lowerPriority: "Priorité plus faible",
      lowerAccess: "Accès faible",
      moderateAccessLabel: "Accès modéré",
      higherAccess: "Accès élevé",
      legendNote: "Interprétation : les zones rouges indiquent une pression de planification ; les zones vertes de meilleures performances d’accessibilité."
    },
    simulate: {
      title: "Simulation",
      subtitle: "Choisissez un scénario puis lancez une simulation de politique publique.",
      runSimulation: "Lancer la simulation ↗",
      resetBaseline: "Revenir à la référence",
      projectedImpact: "impact projeté",
      viewOnMap: "Voir sur la carte",
      scenarioFallback: "Scénario",
      scenarios: {
        addStopsTitle: "Ajouter des arrêts de bus près des établissements isolés",
        addStopsDescription:
          "Placer de nouveaux arrêts à moins de 200m des 10 établissements de santé les plus isolés. Cible les établissements sous 0,35.",
        addStopsImpact: "Est. +18% d’accessibilité moyenne",
        extendTramTitle: "Étendre la couverture tram au sud",
        extendTramDescription:
          "Étendre le tram vers Sidi Othmane et Hay Mohammadi, districts à forte population et faible densité de transport.",
        extendTramImpact: "Est. +31% dans les districts sud",
        increaseFreqTitle: "Augmenter la fréquence sur les lignes à faible accès",
        increaseFreqDescription: "Doubler la fréquence sur les lignes L072 et L067 desservant les zones les plus défavorisées.",
        increaseFreqImpact: "Est. −12 min de temps d’attente moyen",
        addClinicsTitle: "Ouvrir 2 établissements de santé près des hubs",
        addClinicsDescription: "Installer des établissements de santé aux deux arrêts les plus fréquentés sans structure à moins de 600m.",
        addClinicsImpact: "Est. +24% score d’équité"
      },
      bars: {
        avgImprove: "Amélioration moyenne d’accessibilité",
        equityGain: "Gain d’équité (amélioration Gini)",
        threshold: "Seuil d’accessibilité du quartile bas",
        lowAccess: "Établissements encore en faible accès (<0,35)"
      }
    },
    analytics: {
      title: "Comment le modèle prend ses décisions",
      subtitle: "Répartition des scores dans la ville et facteurs explicatifs.",
      populationWarning:
        "Les données de population n’ont pas été fournies pour cette ville. L’analyse d’équité est en mode simplifié — distribution des scores uniquement. Pour l’analyse complète, réimportez avec un fichier population.csv.",
      loading: "Chargement des analyses...",
      scoreSpread: "Répartition des scores dans la ville",
      leftBehind: "Quelles zones sont laissées de côté ?",
      driversTitle: "Quels facteurs influencent le score d’accessibilité ?",
      driversSubtitle: "Voici les facteurs les plus importants appris par le modèle.",
      topInsight: "Facteur principal : {label} ({pct})",
      secondInsight: "Deuxième facteur : {label} ({pct})",
      inequality: "Indice d’inégalité",
      na: "N/D"
    },
    facility: {
      highAccess: "Accès élevé",
      medium: "Moyen",
      lowAccess: "Accès faible",
      score: "Score",
      nearestStop: "Arrêt le plus proche"
    },
    upload: {
      title: "Importer des données",
      subtitle: "Importez des CSV et réentraînez le modèle pour une ville.",
      mode: "Mode",
      addNewCity: "Ajouter une nouvelle ville",
      updateCity: "Mettre à jour une ville existante",
      cityName: "Nom de la ville",
      cityPlaceholder: "ex. Marrakech",
      cityNameHelper: "Ce nom servira d’identifiant de la ville dans l’application.",
      selectCity: "Sélectionner la ville à mettre à jour",
      healthcareCsv: "CSV des établissements de santé",
      healthcareCols: "Colonnes : name, latitude, longitude",
      stopsCsv: "CSV des arrêts de transport",
      stopsCols: "Colonnes : cluster_id, stop_name, Lines, mode, longitude, latitude",
      popCsv: "CSV population (optionnel)",
      popCols: "Colonnes : latitude, longitude, population_count. Sans ce fichier, l’analyse d’équité sera simplifiée.",
      browse: "Parcourir",
      noFile: "Aucun fichier sélectionné",
      training: "Entraînement du modèle pour {city}... cela prend 10–30 secondes",
      uploadFailed: "Échec de l’import",
      done: "Terminé ! {city} est prête.",
      goToCity: "Aller à {city}",
      addAnother: "Ajouter une autre ville",
      uploading: "Import en cours...",
      uploadTrain: "Importer & entraîner",
      newCity: "nouvelle ville",
      selectedCity: "ville sélectionnée"
    },
    home: {
      dashboardTitle: "Tableau de bord d’accessibilité des soins",
      dashboardSubtitle: "Vue décisionnelle centrée carte pour l’accessibilité par district, le risque de sous-desserte et les scénarios.",
      noCityTitle: "Aucune ville sélectionnée",
      noCitySubtitle: "Utilisez la barre latérale pour sélectionner ou importer des données",
      noCityBody: "Aucune donnée de ville n’est actuellement sélectionnée.",
      rankingTitle: "Classement et recommandations",
      rankingSubtitle: "Districts prioritaires et interventions candidates",
      topUnderserved: "Districts les plus sous-desservis",
      loadingRanking: "Chargement du classement...",
      noRanking: "Aucune donnée de classement.",
      recommendedScenarios: "Scénarios recommandés",
      loadingRecommendations: "Chargement des recommandations...",
      noRecommendations: "Aucune recommandation disponible.",
      comparisonLine: "Comparaison : {pct}% d’amélioration, {improved}/{total} districts améliorés."
    },
    summary: {
      title: "Résumé de la ville",
      subtitle: "Indicateurs globaux d’accessibilité",
      avgAccessibility: "Accessibilité moyenne",
      avgTravel: "Temps de trajet moyen",
      underservedDistricts: "Districts sous-desservis",
      ofAll: "{pct}% de tous les districts",
      bestDistrict: "Meilleur district",
      worstDistrict: "Pire district",
      scoreHint: "Score : {score}"
    },
    details: {
      title: "Détails du district",
      subtitleSelected: "Indicateurs du district sélectionné",
      subtitleEmpty: "Cliquez sur un district pour inspecter",
      noDistrict: "Aucun district sélectionné.",
      district: "District",
      underserved: "Sous-desservi",
      served: "Desservi",
      accessibility: "Score d’accessibilité",
      travel: "Temps de trajet",
      sfca: "Score 2SFCA",
      population: "Population",
      interpUnderserved:
        "Ce district semble sous-desservi et devrait être prioritaire pour des interventions améliorant l’accès aux soins par transport public.",
      interpServed: "Ce district présente des conditions d’accès relativement plus favorables dans les hypothèses actuelles."
    },
    export: {
      button: "Exporter le rapport",
      exporting: "Export en cours...",
      started: "Export du rapport lancé.",
      pdf: "Exporter PDF",
      excel: "Exporter Excel"
    }
  },
  ar: {
    common: {
      close: "إغلاق",
      cancel: "إلغاء",
      loading: "جاري التحميل...",
      dismiss: "إخفاء",
      noData: "لا توجد بيانات",
      language: "اللغة",
      english: "الإنجليزية",
      french: "الفرنسية",
      arabic: "العربية",
      notAvailable: "غير متاح"
    },
    nav: {
      appName: "MorocCare Access",
      overview: "نظرة عامة",
      map: "الخريطة",
      simulate: "المحاكاة",
      analytics: "التحليلات",
      uploadData: "رفع البيانات",
      addNewCity: "+ إضافة مدينة جديدة..."
    },
    overview: {
      title: "نظرة عامة",
      findingTemplate: "يوجد {count} مرفقًا في {city} بضعف في الوصول إلى النقل.",
      isolatedTemplate: "الأكثر عزلة هو {district} — يبعد {distance} عن أقرب محطة.",
      selectedCity: "المدينة المختارة",
      totalFacilities: "إجمالي المرافق",
      totalStops: "إجمالي محطات النقل",
      avgDistance: "متوسط المسافة لأقرب محطة",
      lowAccessFacilities: "المرافق ضعيفة الوصول",
      ranking: "ترتيب المرافق",
      switchBest: "الترتيب من الأفضل للأسوأ",
      switchWorst: "الترتيب من الأسوأ للأفضل",
      loadingBaseline: "جاري تحميل بيانات الأساس..."
    },
    map: {
      showingSimulation: "عرض نتائج المحاكاة",
      scenario: "السيناريو",
      selectedScenario: "السيناريو المختار",
      reset: "إعادة ضبط",
      howToRead: "كيفية قراءة الخريطة",
      helpText:
        "يتم قياس إمكانية الوصول عبر عدد محطات النقل العام القريبة مشيًا من كل مرفق، مع ترجيح المسافة. كلما زادت المحطات القريبة ارتفعت الدرجة.",
      wellConnected: "ارتباط جيد",
      moderateAccess: "وصول متوسط",
      hardToReach: "صعب الوصول",
      transportStop: "محطة نقل",
      baselineCircle: "— دائرة متصلة = درجة الأساس",
      simulatedCircle: "-- دائرة متقطعة = الدرجة بعد المحاكاة",
      layers: "الطبقات",
      showStops: "إظهار المحطات",
      colorBy: "تلوين حسب",
      accessibilityScore: "درجة الوصول",
      travelTime: "زمن الرحلة",
      priority: "الأولوية",
      simulated: "محاكاة",
      distanceToStop: "المسافة إلى أقرب محطة",
      stopsWithin500: "محطات ضمن 500م",
      whyScore: "لماذا هذه الدرجة؟",
      loadingMap: "جاري تحميل الخريطة...",
      selectCity: "اختر مدينة لعرض إمكانية الوصول على مستوى الأحياء.",
      improvedBaseline: "تحسن مقارنة بالأساس",
      noMajorChange: "لا تغيير كبير",
      declinedBaseline: "تراجع مقارنة بالأساس",
      shorterTravel: "زمن رحلة أقصر",
      moderateTravel: "زمن رحلة متوسط",
      longerTravel: "زمن رحلة أطول",
      criticalPriority: "أولوية حرجة",
      moderatePriority: "أولوية متوسطة",
      lowerPriority: "أولوية أقل",
      lowerAccess: "وصول أقل",
      moderateAccessLabel: "وصول متوسط",
      higherAccess: "وصول أعلى",
      legendNote: "التفسير: المناطق الحمراء تشير إلى ضغط تخطيطي أعلى، والمناطق الخضراء تشير إلى أداء وصول أقوى."
    },
    simulate: {
      title: "المحاكاة",
      subtitle: "اختر بطاقة سيناريو وشغّل محاكاة سياسات.",
      runSimulation: "تشغيل المحاكاة ↗",
      resetBaseline: "الرجوع إلى الأساس",
      projectedImpact: "الأثر المتوقع",
      viewOnMap: "عرض على الخريطة",
      scenarioFallback: "سيناريو",
      scenarios: {
        addStopsTitle: "إضافة محطات حافلات قرب المرافق المعزولة",
        addStopsDescription: "إضافة محطات ضمن 200م لأكثر 10 مرافق صحية عزلة، مع استهداف المرافق الأقل من 0.35.",
        addStopsImpact: "تقديريًا +18% متوسط الوصول",
        extendTramTitle: "توسيع تغطية الترام نحو الجنوب",
        extendTramDescription: "تمديد مسار الترام عبر سيدي عثمان والحي المحمدي، وهما منطقتان بكثافة سكانية عالية ونقل منخفض.",
        extendTramImpact: "تقديريًا +31% في المناطق الجنوبية",
        increaseFreqTitle: "زيادة تردد الخطوط ضعيفة الوصول",
        increaseFreqDescription: "مضاعفة التردد على الخطين L072 وL067 اللذين يخدمان أكثر المناطق حرمانًا.",
        increaseFreqImpact: "تقديريًا −12 دقيقة متوسط الانتظار",
        addClinicsTitle: "فتح مرفقين صحيين قرب محاور النقل",
        addClinicsDescription: "إضافة مرافق صحية عند أعلى محطتين حركة بلا مرفق صحي ضمن 600م.",
        addClinicsImpact: "تقديريًا +24% في مؤشر العدالة"
      },
      bars: {
        avgImprove: "متوسط تحسن الوصول",
        equityGain: "تحسن العدالة (مؤشر جيني)",
        threshold: "عتبة الوصول للربع الأدنى",
        lowAccess: "المرافق التي ما زالت ضعيفة الوصول (<0.35)"
      }
    },
    analytics: {
      title: "كيف يتخذ النموذج قراراته",
      subtitle: "توزيع الدرجات في المدينة والعوامل المؤثرة.",
      populationWarning:
        "لم يتم توفير بيانات السكان لهذه المدينة. تحليل العدالة يعمل بنمط مبسط ويعرض توزيع درجات الوصول فقط. للحصول على تحليل كامل، أعد الرفع مع ملف population.csv.",
      loading: "جاري تحميل التحليلات...",
      scoreSpread: "كيف تتوزع الدرجات في المدينة",
      leftBehind: "ما المناطق التي تُركت خلف الركب؟",
      driversTitle: "ما العوامل التي تحدد درجة الوصول؟",
      driversSubtitle: "هذه أهم العوامل التي تعلمها النموذج.",
      topInsight: "العامل الأهم: {label} ({pct})",
      secondInsight: "العامل الثاني: {label} ({pct})",
      inequality: "مؤشر عدم المساواة",
      na: "غير متاح"
    },
    facility: {
      highAccess: "وصول مرتفع",
      medium: "متوسط",
      lowAccess: "وصول منخفض",
      score: "الدرجة",
      nearestStop: "أقرب محطة"
    },
    upload: {
      title: "رفع البيانات",
      subtitle: "ارفع ملفات CSV وأعد تدريب النموذج لمدينة.",
      mode: "الوضع",
      addNewCity: "إضافة مدينة جديدة",
      updateCity: "تحديث بيانات مدينة موجودة",
      cityName: "اسم المدينة",
      cityPlaceholder: "مثال: مراكش",
      cityNameHelper: "سيتم استخدام هذا الاسم كمعرّف للمدينة داخل التطبيق.",
      selectCity: "اختر مدينة للتحديث",
      healthcareCsv: "CSV مرافق الرعاية الصحية",
      healthcareCols: "الأعمدة: name, latitude, longitude",
      stopsCsv: "CSV محطات النقل",
      stopsCols: "الأعمدة: cluster_id, stop_name, Lines, mode, longitude, latitude",
      popCsv: "CSV السكان (اختياري)",
      popCols: "الأعمدة: latitude, longitude, population_count. عند عدم توفر الملف يعمل تحليل العدالة بنمط مبسط.",
      browse: "استعراض",
      noFile: "لم يتم اختيار ملف",
      training: "جاري تدريب النموذج لـ {city}... يستغرق 10–30 ثانية",
      uploadFailed: "فشل الرفع",
      done: "تم! أصبحت {city} جاهزة.",
      goToCity: "الانتقال إلى {city}",
      addAnother: "إضافة مدينة أخرى",
      uploading: "جاري الرفع...",
      uploadTrain: "رفع وتدريب",
      newCity: "مدينة جديدة",
      selectedCity: "المدينة المختارة"
    },
    home: {
      dashboardTitle: "لوحة وصول الرعاية الصحية — الدار البيضاء",
      dashboardSubtitle: "عرض داعم للقرار متمحور حول الخريطة لإمكانية الوصول حسب الأحياء ومخاطر ضعف الخدمة ونتائج السيناريوهات.",
      noCityTitle: "لم يتم اختيار مدينة",
      noCitySubtitle: "استخدم الشريط الجانبي لاختيار أو رفع بيانات المدينة",
      noCityBody: "لا توجد بيانات مدينة مختارة حاليًا.",
      rankingTitle: "الترتيب والتوصيات",
      rankingSubtitle: "الأحياء ذات الأولوية والتدخلات المقترحة",
      topUnderserved: "الأحياء الأكثر ضعفًا في الخدمة",
      loadingRanking: "جاري تحميل الترتيب...",
      noRanking: "لا توجد بيانات ترتيب.",
      recommendedScenarios: "السيناريوهات الموصى بها",
      loadingRecommendations: "جاري تحميل التوصيات...",
      noRecommendations: "لا توجد توصيات متاحة.",
      comparisonLine: "المقارنة: تحسن {pct}%، وتم تحسين {improved}/{total} من الأحياء."
    },
    summary: {
      title: "ملخص المدينة",
      subtitle: "مؤشرات عامة لإمكانية الوصول",
      avgAccessibility: "متوسط الوصول",
      avgTravel: "متوسط زمن الرحلة",
      underservedDistricts: "الأحياء ضعيفة الخدمة",
      ofAll: "{pct}% من جميع الأحياء",
      bestDistrict: "أفضل حي",
      worstDistrict: "أسوأ حي",
      scoreHint: "الدرجة: {score}"
    },
    details: {
      title: "تفاصيل الحي",
      subtitleSelected: "مؤشرات الحي المختار",
      subtitleEmpty: "انقر على حي لعرض التفاصيل",
      noDistrict: "لم يتم اختيار حي.",
      district: "الحي",
      underserved: "ضعيف الخدمة",
      served: "مخدوم",
      accessibility: "درجة الوصول",
      travel: "زمن الرحلة",
      sfca: "درجة 2SFCA",
      population: "السكان",
      interpUnderserved: "يبدو أن هذا الحي ضعيف الخدمة ويجب إعطاؤه أولوية في التدخلات التي تحسن الوصول للرعاية الصحية عبر النقل العام.",
      interpServed: "يتمتع هذا الحي بظروف وصول أفضل نسبيًا وفق الفرضيات الحالية."
    },
    export: {
      button: "تصدير التقرير",
      exporting: "جارٍ التصدير...",
      started: "تم بدء تصدير التقرير.",
      pdf: "تصدير PDF",
      excel: "تصدير Excel"
    }
  }
};

function resolveKey(langDict, key) {
  return key.split(".").reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), langDict);
}

function formatText(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("moroccare_lang") : null;
    return saved && translations[saved] ? saved : "en";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("moroccare_lang", language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const value = useMemo(() => {
    const t = (key, params) => {
      const selected = translations[language] || translations.en;
      const text = resolveKey(selected, key) ?? resolveKey(translations.en, key) ?? key;
      return formatText(text, params);
    };
    return {
      language,
      setLanguage,
      t,
      isRtl: language === "ar"
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

