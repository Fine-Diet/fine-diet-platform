'use client';

export interface PackageFieldsProps {
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  onPackageSizeChange: (value: string) => void;
  onPackageUnitChange: (value: string) => void;
  onPackageCountChange: (value: string) => void;
  inputClassName: string;
  disabled?: boolean;
}

export function PackageFields({
  packageSize,
  packageUnit,
  packageCount,
  onPackageSizeChange,
  onPackageUnitChange,
  onPackageCountChange,
  inputClassName,
  disabled = false,
}: PackageFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label>
        <span className="text-xs text-white/55">Package size</span>
        <input
          type="number"
          min="0.01"
          step="any"
          value={packageSize}
          onChange={(event) => onPackageSizeChange(event.target.value)}
          disabled={disabled}
          className={inputClassName}
        />
      </label>
      <label>
        <span className="text-xs text-white/55">Package unit</span>
        <input
          value={packageUnit}
          onChange={(event) => onPackageUnitChange(event.target.value)}
          disabled={disabled}
          className={inputClassName}
        />
      </label>
      <label>
        <span className="text-xs text-white/55">Package count</span>
        <input
          type="number"
          min="1"
          step="1"
          value={packageCount}
          onChange={(event) => onPackageCountChange(event.target.value)}
          disabled={disabled}
          className={inputClassName}
        />
      </label>
    </div>
  );
}
