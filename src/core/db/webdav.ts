import fs from 'fs';

import type { WebDAVClient } from 'webdav';

import type DB from './index';

const nodeRequire =
  typeof window !== 'undefined' && (window as any).require
    ? (window as any).require
    : require;
const { Notification } = nodeRequire('electron');

type WebDavOptions = {
  username: string;
  password: string;
  url: string;
};

/**
 * Backup / restore over WebDav. The local store is a single SQLite file, so
 * both directions are straightforward binary transfers: upload the file on
 * backup, overwrite the file on restore.
 *
 * `webdav` v5 is ESM-only. The main process bundle is CJS, so the module is
 * loaded via dynamic `import()` and the concrete client is created lazily the
 * first time a method is invoked.
 */
export default class WebDav {
  private readonly clientPromise: Promise<WebDAVClient>;
  private readonly sqlitePath = '/flick/db.sqlite';

  constructor({ username, password, url }: WebDavOptions) {
    this.clientPromise = import('webdav').then(({ createClient }) => {
      const client = createClient(url, { username, password });
      client
        .exists('/')
        .then((result) => {
          if (!result) {
            new Notification({
              title: '导出失败',
              body: 'webdav 连接失败',
            }).show();
          }
        })
        .catch((r) => {
          new Notification({
            title: '导出失败',
            body: 'WebDav连接出错' + r,
          }).show();
        });
      return client;
    });
  }

  async uploadSqliteFile(db: DB): Promise<void> {
    let client: WebDAVClient;
    try {
      client = await this.clientPromise;
    } catch (e) {
      new Notification({
        title: '导出失败',
        body: 'WebDav客户端初始化失败:' + e,
      }).show();
      return;
    }

    try {
      const dirExists = await client.exists('/flick');
      if (!dirExists) {
        await client.createDirectory('/flick');
      }
    } catch (e) {
      new Notification({
        title: '导出失败',
        body: 'WebDav目录创建出错:' + e,
      }).show();
      return;
    }

    if (!fs.existsSync(db.dbFile)) {
      new Notification({
        title: '导出失败',
        body: `本地数据库文件不存在: ${db.dbFile}`,
      }).show();
      return;
    }

    try {
      const buffer = await db.exportSnapshot();
      await client.putFileContents(this.sqlitePath, buffer, {
        overwrite: true,
      });

      new Notification({
        title: '已导出到坚果云',
        body: `文件目录为：${this.sqlitePath}`,
      }).show();
    } catch (e) {
      new Notification({
        title: '导出失败',
        body: 'WebDav 上传出错:' + e,
      }).show();
    }
  }

  async downloadSqliteFile(db: DB): Promise<void> {
    let client: WebDAVClient;
    try {
      client = await this.clientPromise;
    } catch (e) {
      new Notification({
        title: '导入失败',
        body: 'WebDav客户端初始化失败:' + e,
      }).show();
      return;
    }

    try {
      const exists = await client.exists(this.sqlitePath);
      if (!exists) {
        new Notification({
          title: '导入失败',
          body: '请确认坚果云上已存在数据',
        }).show();
        return;
      }

      const data = (await client.getFileContents(this.sqlitePath, {
        format: 'binary',
      })) as Buffer | ArrayBuffer;

      const buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer);

      await db.restoreSnapshot(buffer);

      new Notification({
        title: '导入成功',
        body: '数据已导入到 flick，主应用数据需重启后生效',
      }).show();
    } catch (e) {
      new Notification({
        title: '导入失败',
        body: 'WebDav目录导入出错:' + e,
      }).show();
    }
  }
}
