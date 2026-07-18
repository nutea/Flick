import pluginClickEvent from './pluginClickEvent';
import localConfig from '../confOp';
import { ref } from 'vue';

export default ({ currentPlugin, optionsRef, openPlugin, setOptionsRef }) => {
  const clipboardFile: any = ref([]);
  const searchFocus = (files, strict = true) => {
    const config: any = localConfig.getConfig();
    // 未开启自动粘贴
    if (!config.perf.common.autoPast && strict) return;

    if (currentPlugin.value.name) return;
    const fileList = files || window.flick.getCopyedFiles();
    // 拷贝的是文件
    if (fileList) {
      window.setSubInputValue({ value: '' });
      clipboardFile.value = fileList;
      const localPlugins = window.flick.getLocalPlugins();
      const options: any = [
        {
          name: '复制路径',
          value: 'plugin',
          // Avoid hard failure when optional static icon is missing in runtime bundle.
          icon: '',
          desc: '复制路径到剪切板',
          click: () => {
            window.flick.clipboard.writeText(
              fileList.map((file) => file.path).join(',')
            );
            window.flick.hideMainWindow();
          },
        },
      ];
      // 判断复制的文件类型是否一直
      const commonLen = fileList.filter(
        (file) =>
          window.flick.pathExtension(fileList[0].path) ===
          window.flick.pathExtension(file.path)
      ).length;
      // 复制路径
      if (commonLen !== fileList.length) {
        setOptionsRef(options);
        return;
      }

      // 再正则插件
      if (fileList.length === 1) {
        localPlugins.forEach((plugin) => {
          const feature = plugin.features;
          // 系统插件无 features 的情况，不需要再搜索
          if (!feature) return;
          feature.forEach((fe) => {
            const ext = window.flick.pathExtension(fileList[0].path);
            fe.cmds.forEach((cmd) => {
              const regImg = /\.(png|jpg|gif|jpeg|webp)$/;
              if (
                cmd.type === 'img' &&
                regImg.test(ext) &&
                fileList.length === 1
              ) {
                const option = {
                  name: cmd.label,
                  value: 'plugin',
                  icon: plugin.logoUrl,
                  desc: fe.explain,
                  type: plugin.pluginType,
                  click: () => {
                    pluginClickEvent({
                      plugin,
                      fe,
                      cmd,
                      ext: {
                        code: fe.code,
                        type: cmd.type || 'text',
                        payload: window.flick.clipboard.imageFileDataUrl(
                          fileList[0].path
                        ),
                      },
                      openPlugin,
                      option,
                    });
                    clearClipboardFile();
                  },
                };
                options.push(option);
              }
              // 如果是文件，且符合文件正则类型
              if (
                fileList.length > 1 ||
                (cmd.type === 'file' && new RegExp(cmd.match).test(ext))
              ) {
                const option = {
                  name: cmd,
                  value: 'plugin',
                  icon: plugin.logoUrl,
                  desc: fe.explain,
                  type: plugin.pluginType,
                  click: () => {
                    pluginClickEvent({
                      plugin,
                      fe,
                      cmd,
                      option,
                      ext: {
                        code: fe.code,
                        type: cmd.type || 'text',
                        payload: fileList,
                      },
                      openPlugin,
                    });
                    clearClipboardFile();
                  },
                };
                options.push(option);
              }
            });
          });
        });
      }
      setOptionsRef(options);
      window.flick.clipboard.clear();
      return;
    }
    const clipboardType = window.flick.clipboard.availableFormats();
    if (!clipboardType.length) return;
    if ('text/plain' === clipboardType[0]) {
      const contentText = window.flick.clipboard.readText();
      if (contentText.trim()) {
        clearClipboardFile();
        window.setSubInputValue({ value: contentText });
      }
      window.flick.clipboard.clear();
    }
  };

  const clearClipboardFile = () => {
    clipboardFile.value = [];
    optionsRef.value = [];
  };
  // 触发 ctrl + v 主动粘贴时
  const readClipboardContent = () => {
    // read image
    const dataUrl = window.flick.clipboard.readImageDataUrl();
    if (!dataUrl.replace('data:image/png;base64,', '')) return;
    clipboardFile.value = [
      {
        isFile: true,
        isDirectory: false,
        path: null,
        dataUrl,
      },
    ];
    const localPlugins = window.flick.getLocalPlugins();
    const options: any = [];
    // 再正则插件
    localPlugins.forEach((plugin) => {
      const feature = plugin.features;
      // 系统插件无 features 的情况，不需要再搜索
      if (!feature) return;
      feature.forEach((fe) => {
        fe.cmds.forEach((cmd) => {
          if (cmd.type === 'img') {
            const option = {
              name: cmd.label,
              value: 'plugin',
              icon: plugin.logoUrl,
              desc: fe.explain,
              type: plugin.pluginType,
              click: () => {
                pluginClickEvent({
                  plugin,
                  fe,
                  cmd,
                  ext: {
                    code: fe.code,
                    type: cmd.type || 'text',
                    payload: dataUrl,
                  },
                  openPlugin,
                  option,
                });
                clearClipboardFile();
              },
            };
            options.push(option);
          }
        });
      });

      setOptionsRef(options);
    });
  };

  return {
    searchFocus,
    clipboardFile,
    clearClipboardFile,
    readClipboardContent,
  };
};
