import {
  AdapterHandlerOptions,
  AdapterInfo,
} from '@/core/plugin-handler/types';
import axios from 'axios';

const nodeRequire =
  typeof window !== 'undefined' && (window as any).require
    ? (window as any).require
    : require;
const fs = nodeRequire('fs-extra');
const fixPath = nodeRequire('fix-path');
const path = nodeRequire('path');
const { ipcRenderer } = nodeRequire('electron');
const spawn = nodeRequire('cross-spawn');

fixPath();

/**
 * 系统插件管理器
 * @class AdapterHandler
 */
class AdapterHandler {
  // 插件安装地址
  public baseDir: string;
  // 插件源地址
  readonly registry: string;

  pluginCaches = {};

  /**
   * Creates an instance of AdapterHandler.
   * @param {AdapterHandlerOptions} options
   * @memberof AdapterHandler
   */
  constructor(options: AdapterHandlerOptions) {
    // 初始化插件存放
    if (!fs.existsSync(options.baseDir)) {
      fs.mkdirsSync(options.baseDir);
      fs.writeFileSync(
        `${options.baseDir}/package.json`,
        // '{"dependencies":{}}'
        // fix 插件安装时node版本问题
        JSON.stringify({
          dependencies: {},
          volta: {
            node: '16.19.1',
          },
        })
      );
    }
    this.baseDir = options.baseDir;

    let register = options.registry || 'https://registry.npmmirror.com';

    try {
      const dbdata = ipcRenderer.sendSync('msg-trigger', {
        type: 'dbGet',
        data: { id: 'flick-localhost-config' },
      });
      register = dbdata.data.register;
    } catch (e) {
      // ignore
    }
    this.registry = register || 'https://registry.npmmirror.com/';
  }

  async upgrade(name: string): Promise<void> {
    // 创建一个npm-registry-client实例
    const packageJSON = JSON.parse(
      fs.readFileSync(`${this.baseDir}/package.json`, 'utf-8')
    );
    const registryUrl = `https://registry.npmmirror.com/${name}`;

    // 从npm源中获取依赖包的最新版本
    try {
      const installedVersion = packageJSON.dependencies[name].replace('^', '');
      let latestVersion = this.pluginCaches[name];
      if (!latestVersion) {
        const { data } = await axios.get(registryUrl, { timeout: 2000 });
        latestVersion = data['dist-tags'].latest;
        this.pluginCaches[name] = latestVersion;
      }
      if (latestVersion > installedVersion) {
        await this.install([name], { isDev: false });
      }
    } catch (e) {
      // ...
    }
  }
  /**
   * 获取插件信息
   * @param {string} adapter 插件名称
   * @param {string} adapterPath 插件指定路径
   * @memberof PluginHandler
   */
  async getAdapterInfo(
    adapter: string,
    adapterPath: string
  ): Promise<AdapterInfo> {
    let adapterInfo: AdapterInfo;
    const infoPath =
      adapterPath ||
      path.resolve(this.baseDir, 'node_modules', adapter, 'plugin.json');
    // 从本地获取
    if (await fs.pathExists(infoPath)) {
      adapterInfo = JSON.parse(
        fs.readFileSync(infoPath, 'utf-8')
      ) as AdapterInfo;
    } else {
      const { data } = await axios.get(
        `https://cdn.jsdelivr.net/npm/${adapter}/plugin.json`,
        { timeout: 5000 }
      );
      adapterInfo = data as AdapterInfo;
    }
    return adapterInfo;
  }

  // 安装并启动插件
  async install(adapters: Array<string>, options: { isDev: boolean }) {
    const installCmd = options.isDev ? 'link' : 'install';
    // 安装
    await this.execCommand(installCmd, adapters);
  }

  /**
   * 更新指定插件
   * @param {...string[]} adapters 插件名称
   * @memberof AdapterHandler
   */
  async update(...adapters: string[]) {
    await this.execCommand('update', adapters);
  }

  /**
   * 卸载指定插件
   * @param {...string[]} adapters 插件名称
   * @param options
   * @memberof AdapterHandler
   */
  async uninstall(adapters: string[], options: { isDev: boolean }) {
    const installCmd = options.isDev ? 'unlink' : 'uninstall';
    await this.execCommand(installCmd, adapters, {
      timeoutMs: 120000,
      quiet: true,
      extraArgs:
        installCmd === 'uninstall'
          ? ['--no-audit', '--no-fund', '--loglevel=warn']
          : [],
    });
  }

  /**
   * 列出所有已安装插件
   * @memberof AdapterHandler
   */
  async list() {
    const installInfo = JSON.parse(
      await fs.readFile(`${this.baseDir}/package.json`, 'utf-8')
    );
    const adapters: string[] = [];
    for (const adapter in installInfo.dependencies) {
      adapters.push(adapter);
    }
    return adapters;
  }

  /**
   * 运行包管理器
   * @memberof AdapterHandler
   */
  private async execCommand(
    cmd: string,
    modules: string[],
    opts?: {
      timeoutMs?: number;
      /** 不向 process.stdout/stderr 管道，避免主进程反压导致 npm 卡住 */
      quiet?: boolean;
      extraArgs?: string[];
    }
  ): Promise<string> {
    return new Promise((resolve: any, reject: any) => {
      let args: string[] = [cmd].concat(
        cmd !== 'uninstall' && cmd !== 'link'
          ? modules.map((m) => `${m}@latest`)
          : modules
      );
      if (opts?.extraArgs?.length) {
        args = args.concat(opts.extraArgs);
      }
      // uninstall/unlink 不应再走 registry 网络，否则易卡住超时
      if (cmd !== 'link' && cmd !== 'unlink' && cmd !== 'uninstall') {
        args = args
          .concat('--color=always')
          .concat('--save')
          .concat(`--registry=${this.registry}`);
      }

      const npm = spawn('npm', args, {
        cwd: this.baseDir,
      });

      console.log(args);

      let output = '';
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const settle = (fn: (v?: unknown) => void, arg?: unknown) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        fn(arg);
      };

      const onOut = (data: Buffer | string) => {
        output += data;
      };

      if (opts?.quiet) {
        npm.stdout.on('data', onOut);
        npm.stderr.on('data', onOut);
      } else {
        npm.stdout.on('data', onOut).pipe(process.stdout);
        npm.stderr.on('data', onOut).pipe(process.stderr);
      }

      if (opts?.timeoutMs && opts.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          try {
            npm.kill('SIGTERM');
          } catch {
            // ignore
          }
          setTimeout(() => {
            try {
              if (!npm.killed) npm.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, 4000);
          settle(reject, {
            code: 'TIMEOUT',
            data: output,
            err: new Error(`npm ${cmd} timed out after ${opts.timeoutMs}ms`),
          });
        }, opts.timeoutMs);
      }

      npm.on('error', (err: Error) => {
        settle(reject, { code: -1, data: output, err });
      });

      npm.on('close', (code: number) => {
        if (!code) {
          settle(resolve, { code: 0, data: output });
        } else {
          settle(reject, { code: code, data: output });
        }
      });
    });
  }
}

export default AdapterHandler;
