"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SERVICE_SUBCATEGORIES, type ServiceSubcategory } from "@/lib/finance/recurring";

export function ServiceSubField({
  value,
  onChange,
}: {
  value: ServiceSubcategory;
  onChange: (value: ServiceSubcategory) => void;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">Subcategoría</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value as ServiceSubcategory)}>
        {SERVICE_SUBCATEGORIES.map((sub) => (
          <option key={sub} value={sub}>
            {sub}
          </option>
        ))}
      </Select>
    </div>
  );
}
