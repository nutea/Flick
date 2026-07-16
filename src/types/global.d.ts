declare global {
  // eslint-disable-next-line no-var
  var __static: string;

  interface GlobalThis {
    __static: string;
  }
}

export {};

