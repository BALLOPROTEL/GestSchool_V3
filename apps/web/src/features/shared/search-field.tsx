import { Input } from '@gestschool/ui';
import { Search } from 'lucide-react';

export type SearchFieldProperties = {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

export function SearchField({ label, onChange, placeholder, value }: SearchFieldProperties) {
  return (
    <label className="relative block w-full max-w-md">
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="ps-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}
