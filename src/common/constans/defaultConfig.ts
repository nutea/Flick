export default {
  version: 7,
  perf: {
    custom: {
      theme: 'SUMMER',
      primaryColor: '#6078ea',
      errorColor: '#ed6d46',
      warningColor: '#e5a84b',
      successColor: '#c0d695',
      infoColor: '#aa8eeB',
      logo: `image://${__static}/logo.png`,
      placeholder: '搜索应用、插件或命令…',
      username: 'Flick',
    },
    shortCut: {
      showAndHidden: process.platform === 'win32' ? 'Ctrl+SPACE' : 'Option+R',
      separate: 'Ctrl+D',
      quit: 'Shift+Escape',
      capture: 'Ctrl+Shift+A',
    },
    common: {
      start: true,
      space: true,
      hideOnBlur: true,
      autoPast: false,
      darkMode: false,
      guide: false,
      history: true,
      lang: 'zh-CN',
    },
    local: {
      search: true,
    },
  },
  global: [],
};
