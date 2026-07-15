export type QueryPatch = Record<string, string | number | null | undefined>;

export interface BuildQueryOptions {
  base?: "all" | "empty" | "whitelist";
  preserveKeys?: string[];
  clearKeys?: string[];
  resetPage?: boolean;
}

/**
 * Helper murni untuk membangun URLSearchParams secara deklaratif, mengurangi
 * duplikasi boilerplate di komponen filter.
 */
export function buildSearchParams(
  current: URLSearchParams,
  patch: QueryPatch,
  options: BuildQueryOptions = {}
): URLSearchParams {
  const {
    base = "all",
    preserveKeys = [],
    clearKeys = [],
    resetPage = false,
  } = options;

  let next: URLSearchParams;

  if (base === "empty") {
    next = new URLSearchParams();
  } else if (base === "whitelist") {
    next = new URLSearchParams();
    for (const k of preserveKeys) {
      const v = current.get(k);
      if (v) next.set(k, v);
    }
  } else {
    next = new URLSearchParams(current.toString());
  }

  // Hapus key yang ditentukan
  for (const k of clearKeys) {
    next.delete(k);
  }

  // Terapkan patch
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }

  // Reset halaman tapi pertahankan ukuran halaman
  if (resetPage) {
    next.delete("page");
  }

  return next;
}
