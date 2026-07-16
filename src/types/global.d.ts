declare global {
  var __static: string;

  interface GlobalThis {
    __static: string;
  }

  namespace Electron {
    interface BrowserView {
      inDetach?: boolean;
    }
  }
}

export {};
