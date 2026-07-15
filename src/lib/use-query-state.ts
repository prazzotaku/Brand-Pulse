"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { buildSearchParams, type QueryPatch, type BuildQueryOptions } from "./query-params";

export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = (patch: QueryPatch, options?: BuildQueryOptions) => {
    const nextSearchParams = buildSearchParams(searchParams, patch, options);
    const qs = nextSearchParams.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return {
    params: searchParams,
    get: (key: string) => searchParams.get(key) ?? "",
    push,
  };
}
