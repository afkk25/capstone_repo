import { useQuery } from "@tanstack/react-query";
import {
  fetchCities,
  fetchCityBaseline,
  fetchCityFacilities,
  fetchCityDistrictGeojson,
  fetchCityExplainability,
  fetchCityRanking,
  fetchCityRecommendedPlacements,
  fetchCityRecommendations,
  fetchCityStops,
  fetchCitySummary
} from "../api/cities";
import { API_BASE_URL } from "../api/client";

const FIVE_MINUTES = 5 * 60 * 1000;

export function useCityData(
  cityId: string,
  options: {
    includeBaseline?: boolean;
    includeBaselineDetails?: boolean;
    includeSummary?: boolean;
    includeDistricts?: boolean;
    includeRanking?: boolean;
    includeRecommendations?: boolean;
    includeRecommendedPlacements?: boolean;
    includeExplainability?: boolean;
    includeFacilitiesLayer?: boolean;
    includeStopsLayer?: boolean;
  } = {}
) {
  const {
    includeBaseline = false,
    includeBaselineDetails = false,
    includeSummary = false,
    includeDistricts = false,
    includeRanking = false,
    includeRecommendations = false,
    includeRecommendedPlacements = false,
    includeExplainability = false,
    includeFacilitiesLayer = false,
    includeStopsLayer = false
  } = options;

  const citiesQuery = useQuery({
    queryKey: ["cities"],
    queryFn: fetchCities,
    placeholderData: [],
    staleTime: FIVE_MINUTES,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const resolvedCityId = String(cityId || citiesQuery.data?.[0]?.id || citiesQuery.data?.[0]?.city_id || "").trim();
  const baselineEnabled = Boolean(resolvedCityId) && includeBaseline;
  const summaryEnabled = Boolean(resolvedCityId) && includeSummary;
  const districtsEnabled = Boolean(resolvedCityId) && includeDistricts;
  const rankingEnabled = Boolean(resolvedCityId) && includeRanking;
  const recommendationsEnabled = Boolean(resolvedCityId) && includeRecommendations;
  const recommendedPlacementsEnabled = Boolean(resolvedCityId) && includeRecommendedPlacements;
  const explainabilityEnabled = Boolean(resolvedCityId) && includeExplainability;
  const facilitiesEnabled = Boolean(resolvedCityId) && includeFacilitiesLayer;
  const stopsEnabled = Boolean(resolvedCityId) && includeStopsLayer;
  const heavyQueryOptions = {
    staleTime: FIVE_MINUTES,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    networkMode: "always" as const
  };

  const baselineQueryBase = useQuery({
    queryKey: ["baseline", resolvedCityId, includeBaselineDetails ? "detailed" : "compact"],
    queryFn: async () => {
      if (import.meta.env.DEV) {
        console.log("Fetching baseline for", resolvedCityId);
        console.log("Baseline URL", `${API_BASE_URL}/api/cities/${resolvedCityId}/baseline`);
      }
      try {
        const result = await fetchCityBaseline(resolvedCityId, {
          includeRows: includeBaselineDetails,
          includeFacilities: includeBaselineDetails,
          includeTransportStops: includeBaselineDetails,
          includeMapLayers: includeBaselineDetails
        });
        if (import.meta.env.DEV) {
          console.log("Baseline query success for", resolvedCityId);
        }
        return result;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Baseline query failed for", resolvedCityId, error);
        }
        throw error;
      }
    },
    enabled: baselineEnabled,
    retry: 0,
    ...heavyQueryOptions
  });
  const baselineQuery = baselineQueryBase;

  const explainabilityQueryBase = useQuery({
    queryKey: ["explainability", resolvedCityId],
    queryFn: () => fetchCityExplainability(resolvedCityId),
    enabled: explainabilityEnabled,
    ...heavyQueryOptions
  });
  const explainabilityQuery = explainabilityQueryBase;

  const summaryQueryBase = useQuery({
    queryKey: ["summary", resolvedCityId],
    queryFn: async () => {
      if (import.meta.env.DEV) {
        console.log("Fetching summary for", resolvedCityId);
        console.log("Summary URL", `${API_BASE_URL}/api/cities/${resolvedCityId}/summary`);
      }
      try {
        const result = await fetchCitySummary(resolvedCityId);
        if (import.meta.env.DEV) {
          console.log("Summary query success for", resolvedCityId);
        }
        return result;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Summary query failed for", resolvedCityId, error);
        }
        throw error;
      }
    },
    enabled: summaryEnabled,
    ...heavyQueryOptions
  });
  const summaryQuery = summaryQueryBase;

  const rankingQueryBase = useQuery({
    queryKey: ["ranking", resolvedCityId],
    queryFn: async () => {
      if (import.meta.env.DEV) {
        console.log("Fetching ranking for", resolvedCityId);
        console.log("Ranking URL", `${API_BASE_URL}/api/cities/${resolvedCityId}/ranking`);
      }
      try {
        const result = await fetchCityRanking(resolvedCityId);
        if (import.meta.env.DEV) {
          console.log("Ranking query success for", resolvedCityId);
        }
        return result;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Ranking query failed for", resolvedCityId, error);
        }
        throw error;
      }
    },
    enabled: rankingEnabled,
    ...heavyQueryOptions
  });
  const rankingQuery = rankingQueryBase;

  const recommendationsQueryBase = useQuery({
    queryKey: ["recommendations", resolvedCityId],
    queryFn: () => fetchCityRecommendations(resolvedCityId),
    enabled: recommendationsEnabled,
    ...heavyQueryOptions
  });
  const recommendationsQuery = recommendationsQueryBase;

  const recommendedPlacementsQueryBase = useQuery({
    queryKey: ["recommended-placements", resolvedCityId],
    queryFn: () => fetchCityRecommendedPlacements(resolvedCityId),
    enabled: recommendedPlacementsEnabled,
    ...heavyQueryOptions
  });
  const recommendedPlacementsQuery = recommendedPlacementsQueryBase;

  const districtsQueryBase = useQuery({
    queryKey: ["districts", resolvedCityId],
    queryFn: () => fetchCityDistrictGeojson(resolvedCityId),
    enabled: districtsEnabled,
    ...heavyQueryOptions
  });
  const districtsQuery = districtsQueryBase;

  const facilitiesQuery = useQuery({
    queryKey: ["facilities", resolvedCityId],
    queryFn: () => fetchCityFacilities(resolvedCityId),
    enabled: facilitiesEnabled,
    ...heavyQueryOptions
  });

  const stopsQuery = useQuery({
    queryKey: ["stops", resolvedCityId],
    queryFn: () => fetchCityStops(resolvedCityId),
    enabled: stopsEnabled,
    ...heavyQueryOptions
  });

  return {
    citiesQuery,
    baselineQuery,
    districtsQuery,
    explainabilityQuery,
    summaryQuery,
    rankingQuery,
    recommendationsQuery,
    recommendedPlacementsQuery,
    facilitiesQuery,
    stopsQuery,
    resolvedCityId,
    queryEnablement: {
      baselineEnabled,
      includeBaselineDetails,
      summaryEnabled,
      districtsEnabled,
      rankingEnabled,
      recommendationsEnabled,
      recommendedPlacementsEnabled,
      explainabilityEnabled,
      facilitiesEnabled,
      stopsEnabled
    }
  };
}
