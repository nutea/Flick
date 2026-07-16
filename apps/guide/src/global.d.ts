export {};

declare global {
  interface Window {
    guide: {
      close: () => void;
    };
  }
}
