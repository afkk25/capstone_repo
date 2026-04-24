import { useEffect } from "react";
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

export function useCityData(cityId) {
  const citiesQuery = useQuery({
    queryKey: ["cities"],
    queryFn: fetchCities,
    placeholderData: []
  });

  const resolvedCityId = cityId || citiesQuery.data?.[0]?.id || citiesQuery.data?.[0]?.city_id || "";

  const baselineQuery = useQuery({
    queryKey: ["baseline", resolvedCityId],
    queryFn: () => fetchCityBaseline(resolvedCityId),
    enabled: Boolean(resolvedCityId)
  });

  const explainabilityQuery = useQuery({
    queryKey: ["explainability", resolvedCityId],
    queryFn: () => fetchCityExplainability(resolvedCityId),
    enabled: Boolean(resolvedCityId)
  });

  const summaryQuery = useQuery({
    queryKey: ["summary", resolvedCityId],
    queryFn: () => fetchCitySummary(resolvedCityId),
    enabled: Boolean(resolvedCityId)
  });

  const rankingQuery = useQuery({
    queryKey: ["ranking", resolvedCityId],
    queryFn: () => fetchCityRanking(resolvedCityId),
    enabled: Boolean(resolvedCityId)
  });

  const recommendationsQuery = useQuery({
    queryKey: ["recommendations", resolvedCityId],
    queryFn: () => fetchCityRecommendations(resolvedCityId),
    enabled: Boolean(resolvedCityId)
  });

  const recommendedPlacementsQuery = useQuery({
    queryKey: ["recommended-placements", resolvedCityId],
    queryFn: () => fetchCityRecommendedPlacements(resolvedCityId),
    enabled: Boolean(resolvedCityId)
  });

  const districtsQuery = useQuery({
    queryKey: ["districts", resolvedCityId],
    queryFn: () => fetchCityDistrictGeojson(resolvedCityId),
    enabled: Boolean(resolvedCityId)
  });

  useEffect(() => {
    if (!resolvedCityId) return;
    baselineQuery.refetch();
    districtsQuery.refetch();
    explainabilityQuery.refetch();
    summaryQuery.refetch();
    rankingQuery.refetch();
    recommendationsQuery.refetch();
    recommendedPlacementsQuery.refetch();
  }, [resolvedCityId]);

  return {
    citiesQuery,
    baselineQuery,
    districtsQuery,
    explainabilityQuery,
    summaryQuery,
    rankingQuery,
    recommendationsQuery,
    recommendedPlacementsQuery
  };
}
