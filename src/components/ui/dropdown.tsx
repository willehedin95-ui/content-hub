"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_SENTINEL = "__empty__";

interface Option {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

export default function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className,
}: DropdownProps) {
  return (
    <Select
      value={value === "" ? EMPTY_SENTINEL : value}
      onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? "" : v)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value || EMPTY_SENTINEL} value={opt.value || EMPTY_SENTINEL}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
