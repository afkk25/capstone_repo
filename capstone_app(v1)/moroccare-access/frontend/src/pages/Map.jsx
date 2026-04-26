import { useMemo, useState } from "react";
import MapView from "../components/MapView";
import { useI18n } from "../i18n/I18nProvider";
import { sideClass } from "../utils/rtl";

export default function MapPage({
  city,
  baselineFacilities,
  simulatedFacilities,
  communeGeojson,
  transportStops,
  baselineSupplyFacilities = [],
  addedScenarioFacilities = [],
  addedScenarioStops = [],
  isLoading,
  activeLayer,
  onLayerChange,
  onWhyScore,
  analysisUnit = "origin",
  isSimulated,
  scenarioName,
  onResetSimulation
}) {
  const { t, isRtl } = useI18n();
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const priorityByDistrict = useMemo(() => {
    const rows = baselineFacilities.length ? baselineFacilities : simulatedFacilities;
    if (!rows.length) return {};
    const sorted = [...rows].sort((a, b) => a.accessibilityScore - b.accessibilityScore);
    const total = sorted.length;
    return sorted.reduce((acc, row, index) => {
      acc[row.districtName] = (total - index) / total;
      return acc;
    }, {});
  }, [baselineFacilities, simulatedFacilities]);
  const isFacilityProxy = analysisUnit === "facility_proxy";

  return (
    <section className="mc-map-page">
      <div className="mc-page-intro">
        <div>
          <span>{t("mapPage.eyebrow")}</span>
          <h1>{t("mapPage.title")}</h1>
          <p>
            {isFacilityProxy
              ? t("mapPage.facilityProxyBody")
              : t("mapPage.originBody")}
          </p>
        </div>
      </div>

      <div className="relative h-full min-h-[620px]">
        <MapView
          city={city}
          baselineFacilities={baselineFacilities}
          simulatedFacilities={isSimulated ? simulatedFacilities : null}
          communeGeojson={communeGeojson}
          transportStops={transportStops}
          baselineSupplyFacilities={baselineSupplyFacilities}
          addedScenarioFacilities={addedScenarioFacilities}
          addedScenarioStops={addedScenarioStops}
          isLoading={isLoading}
          activeLayer={activeLayer}
          onLayerChange={onLayerChange}
          onSelectPoint={setSelectedDistrict}
          selectedDistrictId={selectedDistrict?.id || null}
          priorityByDistrict={priorityByDistrict}
          onWhyScore={onWhyScore}
        />

        {isSimulated ? (
          <div
            className={`absolute top-3 z-[1000] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm ${
              sideClass(isRtl, "left-3", "right-3")
            }`}
          >
            <div className="font-medium text-gray-800">{t("map.showingSimulation")}</div>
            <div className="mt-1 flex items-center gap-3 text-gray-700">
              <span>
                {t("map.scenario")}: {scenarioName || t("map.selectedScenario")}
              </span>
              <button type="button" className="rounded border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50" onClick={onResetSimulation}>
                {t("mapPage.resetBaseline")}
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`absolute bottom-6 z-[1000] max-w-xs rounded-xl border border-gray-200 bg-white p-3 shadow-sm rtl-safe-text ${
            sideClass(isRtl, "right-[10px]", "left-[10px]")
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("mapPage.howToRead")}</span>
            <button
              type="button"
              className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-600"
              onMouseEnter={() => setHelpOpen(true)}
              onMouseLeave={() => setHelpOpen(false)}
            >
              ?
              {helpOpen ? (
                <span
                  className={`absolute bottom-5 z-[1010] w-64 max-w-[80vw] rounded-lg border border-gray-200 bg-white p-2 text-[11px] font-normal text-gray-700 shadow-sm ${
                    sideClass(isRtl, "right-0 text-left", "left-0 text-right")
                  }`}
                >
                  {t("mapPage.helpTooltip")}
                </span>
              ) : null}
            </button>
          </div>

          <div className="space-y-1 text-[12px] text-gray-700">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-[#2ecc71]" />
              <span>{t("mapPage.highAccessibility")}</span>
              <span className={sideClass(isRtl, "ml-auto num-ltr", "mr-auto num-ltr")}>&gt; 66</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-[#f39c12]" />
              <span>{t("mapPage.moderateAccessibility")}</span>
              <span className={sideClass(isRtl, "ml-auto num-ltr", "mr-auto num-ltr")}>33-66</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-[#e74c3c]" />
              <span>{t("mapPage.lowAccessibility")}</span>
              <span className={sideClass(isRtl, "ml-auto num-ltr", "mr-auto num-ltr")}>&lt; 33</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-[#48cae4]" />
              <span>{t("mapPage.publicTransportStop")}</span>
            </div>
            {isSimulated ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-[#7C3AED]" />
                  <span>{t("mapPage.addedScenarioFacilities")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-[#2563EB]" />
                  <span>{t("mapPage.addedScenarioStops")}</span>
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-2 border-t border-gray-200 pt-2 text-[12px] text-gray-700">
            <div>{t("mapPage.solidBaseline")}</div>
            <div>{t("mapPage.dashedScenario")}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
