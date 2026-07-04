// Central quota configuration. Change limits here without touching handler code.
export const QUOTA = {
  free: {
    export: 10,  // exports per day
    save: 50,    // agent creates + updates per day
  },
  paid: {
    export: Infinity,
    save: Infinity,
  },
};
