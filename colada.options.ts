import type { PiniaColadaOptions } from "@pinia/colada";

export default {
  queryOptions: {
    staleTime: 10_000,
    gcTime: 300_000,
    ssrCatchError: true,
  },
  plugins: [],
} satisfies PiniaColadaOptions;
