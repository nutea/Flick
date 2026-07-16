import { reactive, toRefs } from 'vue';

const searchManager = () => {
  const state = reactive({
    searchValue: '',
    placeholder: '',
  });

  /** 在 initFlick / loadPlugin 清空主搜索框之前保存，供分离窗 getMainInputInfo 合并（自动分离时 dom-ready 很早） */
  let searchSnapshotBeforeOpen: { value: string; placeholder: string } | null =
    null;

  // search Input operation
  const onSearch = (e) => {
    const value = e.target.value;
    state.searchValue = value;
  };

  const setSearchValue = (value: string) => {
    state.searchValue = value;
  };

  window.setSubInput = ({ placeholder }: { placeholder: string }) => {
    state.placeholder = placeholder;
  };
  window.removeSubInput = () => {
    state.placeholder = '';
  };
  window.setSubInputValue = ({ value }: { value: string }) => {
    state.searchValue = value;
  };

  window.getMainInputInfo = () => {
    const snap = searchSnapshotBeforeOpen;
    if (snap) {
      return {
        value: state.searchValue || snap.value || '',
        placeholder: state.placeholder || snap.placeholder || '',
      };
    }
    return {
      value: state.searchValue,
      placeholder: state.placeholder,
    };
  };

  window.captureSearchSnapshotForNextDetach = () => {
    const value = state.searchValue;
    const placeholder = state.placeholder;
    /** 主进程 loadPlugin 会在 initFlick 之后再次 capture，避免用空状态覆盖已保存的启动关键词 */
    if (
      searchSnapshotBeforeOpen &&
      !value &&
      !placeholder &&
      (searchSnapshotBeforeOpen.value || searchSnapshotBeforeOpen.placeholder)
    ) {
      return;
    }
    searchSnapshotBeforeOpen = { value, placeholder };
  };

  window.clearSearchSnapshotAfterDetach = () => {
    searchSnapshotBeforeOpen = null;
  };

  return {
    ...toRefs(state),
    onSearch,
    setSearchValue,
  };
};

export default searchManager;
