"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("q", value);
      else params.delete("q");
      // Whenever the search text changes, jump back to page 1 — staying on
      // page 5 of a freshly-filtered result is rarely what the user wants.
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `/admin/counterparties?${qs}` : "/admin/counterparties");
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search by name, e-mail, Tax ID…"
      className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
    />
  );
}
