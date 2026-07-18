import { reactive, toRefs } from 'vue';
import {
  captureSearchLaunchSnapshot,
  resolveMainInputInfo,
  type SearchLaunchSnapshot,
} from './searchInputLifecycle';

const searchManager = () => {
  const state = reactive({
    searchValue: '',
    placeholder: '',
    detachInputRequested: false,
    detachInputFocus: false,
    detachInputRole: 'search' as 'search' | 'filter' | 'command',
  });

  /** 在 initFlick / loadPlugin 清空主搜索框之前保存，供分离窗 getMainInputInfo 合并（自动分离时 dom-ready 很早） */
  let searchSnapshotBeforeOpen: SearchLaunchSnapshot | null = null;

  // search Input operation
  const onSearch = (e) => {
    const value = e.target.value;
    state.searchValue = value;
  };

  const setSearchValue = (value: string) => {
    state.searchValue = value;
  };

  window.setSubInput = ({
    placeholder,
    isFocus,
    role,
  }: {
    placeholder: string;
    isFocus?: boolean;
    role?: 'search' | 'filter' | 'command';
  }) => {
    state.placeholder = String(placeholder ?? '');
    state.detachInputRequested = true;
    state.detachInputFocus = isFocus === true;
    state.detachInputRole = role ?? 'search';
  };
  window.removeSubInput = () => {
    state.placeholder = '';
    state.detachInputRequested = false;
    state.detachInputFocus = false;
    state.detachInputRole = 'search';
  };
  window.setSubInputValue = ({ value }: { value: string }) => {
    state.searchValue = value;
  };

  window.getMainInputInfo = () => {
    return resolveMainInputInfo(state, searchSnapshotBeforeOpen);
  };

  window.captureSearchSnapshotForNextDetach = () => {
    const value = state.searchValue;
    /** 主进程 loadPlugin 会在 initFlick 之后再次 capture，避免用空状态覆盖已保存的启动关键词 */
    if (searchSnapshotBeforeOpen && !value && searchSnapshotBeforeOpen.value) {
      return;
    }
    searchSnapshotBeforeOpen = captureSearchLaunchSnapshot(value);
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
