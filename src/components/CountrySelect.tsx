import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import Flag from 'react-world-flags';
import { cn } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';

interface Country {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
}

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  countries: Country[];
  placeholder?: string;
  type?: 'country' | 'nationality' | 'phone';
  className?: string;
  required?: boolean;
}

export const CountrySelect: React.FC<CountrySelectProps> = ({
  value,
  onChange,
  countries,
  placeholder = 'Select...',
  type = 'country',
  className,
  required
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCountry = countries.find(c => 
    type === 'phone' ? c.dialCode === value : c.name === value
  );

  const filteredCountries = countries.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.dialCode.includes(search)
  );

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 border-zinc-100 dark:border-zinc-700/50 rounded-2xl py-3.5 px-4 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-all font-medium text-sm flex items-center justify-between text-zinc-900 dark:text-zinc-100",
          !selectedCountry && "text-zinc-400 dark:text-zinc-500"
        )}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {selectedCountry ? (
            <>
              <Flag code={selectedCountry.code} className="w-5 h-3.5 rounded-sm object-cover shrink-0" />
              <span className="truncate">
                {type === 'phone' ? selectedCountry.dialCode : selectedCountry.name}
              </span>
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={cn("text-zinc-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Hidden input for required validation */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          className="absolute opacity-0 w-0 h-0"
          required
        />
      )}

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-700">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={language === 'en' ? "Search..." : "بحث..."}
                className="w-full bg-zinc-50 dark:bg-zinc-900/50 rounded-xl py-2 ps-9 pe-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredCountries.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-500">No results found</div>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    onChange(type === 'phone' ? country.dialCode : country.name);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-start",
                    (type === 'phone' ? value === country.dialCode : value === country.name)
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-zinc-700 dark:text-zinc-300"
                  )}
                >
                  <Flag code={country.code} className="w-5 h-3.5 rounded-sm object-cover shrink-0" />
                  <span className="truncate flex-1">{country.name}</span>
                  {type === 'phone' && (
                    <span className="text-zinc-400 dark:text-zinc-500 text-xs">{country.dialCode}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
