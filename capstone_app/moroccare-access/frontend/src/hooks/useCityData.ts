import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCities,
  fetchCityBaseline,
  fetchCityDistrictGeojson,
  fetchCityExplainability,
  fetchCityRanking,
  fetchCityRecommendedPlacements,
  fetchCityRecommendations,
  fetchCitySummary
} from "../api/cities";
import { dashboardSummary, mergeSummary, normalizeBaselineFacilities, safeRankingRows, safeRecommendations, scoreDistribution, topBottomDistricts } from "../utils/adapters";

export function useCityData(cityId: string) {
  const citiesQuery = useQuery({
    queryKey: ["cities"],
    queryFn: fetchCities,
    placeholderData: []
  });

  const baselineQuery = useQuery({
    queryKey: ["baseline", cityId],
    queryFn: () => fetchCityBaseline(cityId),
    enabled: Boolean(cityId)
  });

  const summaryQuery = useQuery({
    queryKey: ["summary", cityId],
    queryFn: () => fetchCitySummary(cityId),
    enabled: Boolean(cityId)
  });

  const districtsGeoQuery = useQuery({
    queryKey: ["districts-geojson", cityId],
    queryFn: () => fetchCityDistrictGeojson(cityId),
    enabled: Boolean(cityId)
  });

  const rankingQuery = useQuery({
    queryKey: ["ranking", cityId],
    queryFn: () => fetchCityRanking(cityId),
    enabled: Boolean(cityId)
  });

  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", cityId],
    queryFn: () => fetchCityRecommendations(cityId),
    enabled: Boolean(cityId)
  });

  const recommendedPlacementsQuery = useQuery({
    queryKey: ["recommended-placements", cityId],
    queryFn: () => fetchCityRecommendedPlacements(cityId),
    enabled: Boolean(cityId)
  });

  const explainabilityQuery = useQuery({
    queryKey: ["explainability", cityId],
    queryFn: () => fetchCityExplainability(cityId),
    enabled: Boolean(cityId)
  });

  const districts = useMemo(() => normalizeBaselineFacilities(baselineQuery.data), [baselineQuery.data]);
  const summary = useMemo(() => mergeSummary(dashboardSummary(districts), summaryQuery.data), [districts, summaryQuery.data]);
  const topBottom = useMemo(() => topBottomDistricts(districts, 5), [districts]);
  const distribution = useMemo(() => scoreDistribution(districts), [districts]);
  const rankingRows = useMemo(() => safeRankingRows(rankingQuery.data), [rankingQuery.data]);
  const recommendations = useMemo(() => safeRecommendations(recommendationsQuery.data), [recommendationsQuery.data]);
  const explainabilityRows = useMemo(
    () => (Array.isArray(explainabilityQuery.data?.feature_importance) ? explainabilityQuery.data.feature_importance : []),
    [explainabilityQuery.data]
  );

  return {
    citiesQuery,
    baselineQuery,
    summaryQuery,
    rankingQuery,
    recommendationsQuery,
    recommendedPlacementsQuery,
    explainabilityQuery,
    districtsGeoQuery,
    districts,
    summary,
    topRows: topBottom.top,
    bottomRows: topBottom.bottom,
    distribution,
    rankingRows,
    recommendations,
    explainabilityRows,
    transportStops: baselineQuery.data?.transport_stops || []
  };
}

