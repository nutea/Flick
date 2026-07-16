const WINDOW_MAX_HEIGHT = 620;
const WINDOW_MIN_HEIGHT = 60;
const PRE_ITEM_HEIGHT = 70;
const HISTORY_HEIGHT = 70;

export type GetWindowHeightOpts = {
  searchValue?: string | number;
  clipboardFileLength?: number;
  historyEnabled?: boolean;
};

export default (
  searchList: Array<any>,
  historyList: unknown[],
  opts?: GetWindowHeightOpts
): number => {
  const defaultHeight = historyList?.length ? HISTORY_HEIGHT : 0;
  if (searchList == null) {
    return WINDOW_MAX_HEIGHT + defaultHeight;
  }

  const sv =
    opts?.searchValue == null || opts?.searchValue === ''
      ? ''
      : String(opts.searchValue);
  const hasClipboard = (opts?.clipboardFileLength ?? 0) > 0;
  const historyEnabled = opts?.historyEnabled !== false;

  /** 与 result.vue 中「使用记录」区域显隐条件一致 */
  const showHistoryPanel =
    !searchList.length &&
    !sv &&
    !hasClipboard &&
    historyEnabled &&
    !!historyList?.length;

  if (!searchList.length) {
    if (showHistoryPanel) {
      return WINDOW_MIN_HEIGHT + HISTORY_HEIGHT;
    }
    return WINDOW_MIN_HEIGHT;
  }

  return searchList.length * PRE_ITEM_HEIGHT + WINDOW_MIN_HEIGHT >
    WINDOW_MAX_HEIGHT
    ? WINDOW_MAX_HEIGHT
    : searchList.length * PRE_ITEM_HEIGHT + WINDOW_MIN_HEIGHT;
};
