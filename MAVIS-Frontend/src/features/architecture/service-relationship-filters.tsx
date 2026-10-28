"use client";
import { SelectField } from "@/components/shared/forms";
import type { OverviewFilters } from "./service-overview";
export function ServiceRelationshipFilters({
  filters,
  protocols,
  onChange,
}: {
  filters: OverviewFilters;
  protocols: string[];
  onChange: (filters: OverviewFilters) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <SelectField
        label="Relationship source"
        value={filters.origin}
        onChange={(origin) => onChange({ ...filters, origin: origin as OverviewFilters["origin"] })}
        options={[
          { value: "all", label: "All sources" },
          { value: "source", label: "Source & configuration" },
          { value: "deployment", label: "Deployment declarations" },
          { value: "runtime", label: "Runtime observations" },
        ]}
      />
      <SelectField
        label="Relationship type"
        value={filters.protocol}
        onChange={(protocol) => onChange({ ...filters, protocol })}
        options={[
          { value: "all", label: "All types" },
          ...protocols.map((protocol) => ({
            value: protocol,
            label: protocol.replaceAll("_", " ").toLowerCase(),
          })),
        ]}
      />
      <SelectField
        label="Uncertainty"
        value={filters.uncertainty}
        onChange={(uncertainty) =>
          onChange({
            ...filters,
            uncertainty: uncertainty as OverviewFilters["uncertainty"],
          })
        }
        options={[
          { value: "all", label: "All relationships" },
          { value: "uncertain", label: "Flagged uncertain" },
          { value: "not-flagged", label: "Not flagged uncertain" },
        ]}
      />
    </div>
  );
}
