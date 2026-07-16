/**
 * Local document store. Backed by SQLite (better-sqlite3). Exposes a
 * PouchDB-flavoured document shape (`_id` / `_rev` / `_attachments`) so the
 * existing plugin preload API (`window.flick.db.*`) stays stable.
 *
 * Storage layout:
 *   - `docs(id TEXT PRIMARY KEY, rev TEXT, doc TEXT, updated_at INTEGER)`
 *   - `attachments(doc_id, name, content_type, data BLOB, PK(doc_id, name))`
 *     with `ON DELETE CASCADE` from `docs`.
 *
 * Public method names (`put`/`get`/`remove`/`bulkDocs`/`allDocs`/
 * `postAttachment`/`getAttachment`/`dumpDb`/`importDb`) and their return
 * shapes match the callers in `src/main/common/db.ts` and the preload bridge.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database, {
  type Database as SqliteDatabase,
  type Statement,
} from 'better-sqlite3';

import type { DBError, Doc, DocRes } from './types';

const DOC_MAX_BYTES = 2 * 1024 * 1024; // 2 MB per document
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB per attachment
const RANGE_END_MARKER = '\uFFF0'; // matches the old `startkey + '\uFFF0'` convention

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const hashShort = (value: string): string =>
  crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);

/**
 * Next PouchDB-style `<n>-<hash>` revision. We only use it for optimistic
 * concurrency + a stable fingerprint; nothing consumes the hash portion
 * cryptographically.
 */
const nextRev = (prev: string | undefined, body: string): string => {
  const prevSeq = prev ? parseInt(prev.split('-')[0] || '0', 10) : 0;
  const seq = Number.isFinite(prevSeq) && prevSeq >= 0 ? prevSeq + 1 : 1;
  return `${seq}-${hashShort(`${seq}:${body}`)}`;
};

const toErrorInfo = (name: string, message: string): DBError => ({
  error: true,
  name,
  message,
});

const conflictError = (id: string): DBError => ({
  status: 409,
  name: 'conflict',
  error: true,
  message: 'Document update conflict.',
  id,
});

type StoredAttachmentStub = {
  content_type?: string | null;
  length: number;
  digest: string;
  stub: true;
};

type StoredAttachmentInput = {
  content_type?: string | null;
  data: Buffer | Uint8Array | string;
};

type DocBody = Record<string, unknown> & {
  _id?: string;
  _rev?: string;
  _attachments?: Record<string, StoredAttachmentInput | StoredAttachmentStub>;
};

// ---------------------------------------------------------------------------
// DB class
// ---------------------------------------------------------------------------

export default class DB {
  readonly docMaxByteLength = DOC_MAX_BYTES;
  readonly docAttachmentMaxByteLength = ATTACHMENT_MAX_BYTES;

  public dbpath: string;
  public dbFile: string;

  public db: SqliteDatabase | null = null;

  private stmts: {
    selectDoc?: Statement;
    selectDocsByRange?: Statement;
    selectDocsByIds?: Statement;
    insertDoc?: Statement;
    updateDoc?: Statement;
    deleteDoc?: Statement;
    selectAttachments?: Statement;
    selectAttachment?: Statement;
    upsertAttachment?: Statement;
    deleteAttachments?: Statement;
  } = {};

  private loaded = false;

  constructor(dbPath: string) {
    this.dbpath = dbPath;
    this.dbFile = path.join(dbPath, 'default.sqlite');
  }

  init(): void {
    if (this.loaded && this.db) return;

    if (!fs.existsSync(this.dbpath)) {
      fs.mkdirSync(this.dbpath, { recursive: true });
    }

    const db = new Database(this.dbFile);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS docs (
        id         TEXT PRIMARY KEY,
        rev        TEXT NOT NULL,
        doc        TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attachments (
        doc_id       TEXT NOT NULL,
        name         TEXT NOT NULL,
        content_type TEXT,
        data         BLOB NOT NULL,
        PRIMARY KEY (doc_id, name),
        FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
      );
    `);

    this.db = db;
    this.prepareStatements(db);
    this.loaded = true;
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      /* noop */
    }
    this.db = null;
    this.stmts = {};
    this.loaded = false;
  }

  // -------------------------------------------------------------------------
  // Namespace helpers (stable names from the PouchDB impl; do not rename).
  // -------------------------------------------------------------------------

  getDocId(name: string, id: string): string {
    return `${name}/${id}`;
  }

  replaceDocId(name: string, id: string): string {
    const prefix = `${name}/`;
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
  }

  errorInfo(name: string, message: string): DBError {
    return toErrorInfo(name, message);
  }

  // -------------------------------------------------------------------------
  // Prepared statements
  // -------------------------------------------------------------------------

  private prepareStatements(db: SqliteDatabase): void {
    this.stmts.selectDoc = db.prepare(
      'SELECT id, rev, doc, updated_at FROM docs WHERE id = ?'
    );
    this.stmts.selectDocsByRange = db.prepare(
      'SELECT id, rev, doc, updated_at FROM docs WHERE id >= ? AND id < ? ORDER BY id ASC'
    );
    this.stmts.selectDocsByIds = db.prepare(
      'SELECT id, rev, doc, updated_at FROM docs WHERE id = ?'
    );
    this.stmts.insertDoc = db.prepare(
      'INSERT INTO docs (id, rev, doc, updated_at) VALUES (?, ?, ?, ?)'
    );
    this.stmts.updateDoc = db.prepare(
      'UPDATE docs SET rev = ?, doc = ?, updated_at = ? WHERE id = ? AND rev = ?'
    );
    this.stmts.deleteDoc = db.prepare(
      'DELETE FROM docs WHERE id = ? AND rev = ?'
    );
    this.stmts.selectAttachments = db.prepare(
      'SELECT name, content_type, data FROM attachments WHERE doc_id = ? ORDER BY name ASC'
    );
    this.stmts.selectAttachment = db.prepare(
      'SELECT content_type, data FROM attachments WHERE doc_id = ? AND name = ?'
    );
    this.stmts.upsertAttachment = db.prepare(
      `INSERT INTO attachments (doc_id, name, content_type, data)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(doc_id, name) DO UPDATE SET
         content_type = excluded.content_type,
         data = excluded.data`
    );
    this.stmts.deleteAttachments = db.prepare(
      'DELETE FROM attachments WHERE doc_id = ?'
    );
  }

  private requireDb(): SqliteDatabase {
    if (!this.db) {
      throw new Error('LocalDb is not initialised. Call init() first.');
    }
    return this.db;
  }

  private checkDocSize(doc: Doc<unknown>): DBError | false {
    if (Buffer.byteLength(JSON.stringify(doc)) > this.docMaxByteLength) {
      return toErrorInfo(
        'exception',
        `doc max size ${this.docMaxByteLength / 1024 / 1024} M`
      );
    }
    return false;
  }

  /**
   * Splits `{ ..., _id, _rev, _attachments }` into the plain JSON body that
   * goes in the `doc` column and the raw binary attachments that land in the
   * `attachments` table. Returns stubs that mirror PouchDB's `get` response.
   */
  private splitAttachments(doc: DocBody): {
    body: string;
    attachmentsForRow: Array<{
      name: string;
      content_type: string | null;
      data: Buffer;
    }>;
    stubs: Record<string, StoredAttachmentStub>;
  } {
    const {
      _id: _omitId,
      _rev: _omitRev,
      _attachments,
      ...rest
    } = doc as DocBody;
    void _omitId;
    void _omitRev;

    const attachmentsForRow: Array<{
      name: string;
      content_type: string | null;
      data: Buffer;
    }> = [];
    const stubs: Record<string, StoredAttachmentStub> = {};

    if (_attachments && typeof _attachments === 'object') {
      for (const [attachmentName, raw] of Object.entries(_attachments)) {
        if (!raw) continue;
        // If someone round-trips a stub (no `data`) we just leave existing
        // storage intact; nothing to (over)write.
        const maybeInput = raw as StoredAttachmentInput;
        if ('data' in maybeInput && maybeInput.data != null) {
          const buffer = Buffer.isBuffer(maybeInput.data)
            ? maybeInput.data
            : typeof maybeInput.data === 'string'
              ? Buffer.from(maybeInput.data, 'base64')
              : Buffer.from(maybeInput.data as Uint8Array);
          attachmentsForRow.push({
            name: attachmentName,
            content_type: maybeInput.content_type ?? null,
            data: buffer,
          });
          stubs[attachmentName] = {
            content_type: maybeInput.content_type ?? null,
            length: buffer.byteLength,
            digest: `sha1-${hashShort(buffer.toString('binary'))}`,
            stub: true,
          };
        }
      }
    }

    return {
      body: JSON.stringify(rest),
      attachmentsForRow,
      stubs,
    };
  }

  private rowToDoc(
    row: { id: string; rev: string; doc: string },
    attachmentStubs?: Record<string, StoredAttachmentStub>
  ): DocRes {
    const parsed = JSON.parse(row.doc) as Record<string, unknown>;
    const stubs = attachmentStubs ?? this.readAttachmentStubs(row.id);
    const out: DocRes = {
      ...(parsed as any),
      _id: row.id,
      _rev: row.rev,
      id: row.id,
      ok: true,
      rev: row.rev,
    };
    if (Object.keys(stubs).length) {
      (out as any)._attachments = stubs;
    }
    return out;
  }

  private readAttachmentStubs(
    docId: string
  ): Record<string, StoredAttachmentStub> {
    const stmt = this.stmts.selectAttachments;
    if (!stmt) return {};
    const rows = stmt.all(docId) as Array<{
      name: string;
      content_type: string | null;
      data: Buffer;
    }>;
    const stubs: Record<string, StoredAttachmentStub> = {};
    for (const att of rows) {
      stubs[att.name] = {
        content_type: att.content_type,
        length: att.data?.byteLength ?? 0,
        digest: `sha1-${hashShort((att.data ?? Buffer.alloc(0)).toString('binary'))}`,
        stub: true,
      };
    }
    return stubs;
  }

  // -------------------------------------------------------------------------
  // Public API (same names / return shapes as the PouchDB implementation).
  // -------------------------------------------------------------------------

  async put(
    name: string,
    doc: Doc<any>,
    strict = true
  ): Promise<DBError | DocRes> {
    this.requireDb();
    if (strict) {
      const err = this.checkDocSize(doc);
      if (err) return err;
    }

    const originalId = doc._id;
    const fullId = this.getDocId(name, originalId);

    try {
      const result = this.putRaw(fullId, doc as DocBody, originalId);
      if ('error' in result && result.error) {
        return result as DBError;
      }
      // Reflect externally-shaped id on the caller's doc for parity with the
      // old PouchDB implementation (it mutated `_id` on success too).
      const res = result as DocRes;
      doc._id = this.replaceDocId(name, res._id ?? fullId);
      doc._rev = res.rev;
      res.id = doc._id;
      res._id = doc._id;
      return res;
    } catch (e: any) {
      doc._id = originalId;
      return toErrorInfo(e?.name || 'exception', String(e?.message || e));
    }
  }

  /**
   * Low-level single-doc writer used by both `put` and `bulkDocs`. Keeps the
   * caller's original id untouched; only mutates the DB.
   */
  private putRaw(
    fullId: string,
    doc: DocBody,
    externalId: string
  ): DocRes | DBError {
    const db = this.requireDb();
    const { body, attachmentsForRow } = this.splitAttachments(doc);
    const inputRev = (doc as DocBody)._rev;

    const existing = this.stmts.selectDoc?.get(fullId) as
      | { id: string; rev: string; doc: string; updated_at: number }
      | undefined;

    const rev = nextRev(existing?.rev, body);
    const now = Date.now();

    const run = db.transaction(() => {
      if (!existing) {
        if (inputRev) {
          // Client thinks it is updating a doc that does not exist.
          throw Object.assign(new Error('Document update conflict.'), {
            code: 'FLICK_DB_CONFLICT',
            status: 409,
          });
        }
        this.stmts.insertDoc!.run(fullId, rev, body, now);
      } else {
        if (!inputRev || inputRev !== existing.rev) {
          throw Object.assign(new Error('Document update conflict.'), {
            code: 'FLICK_DB_CONFLICT',
            status: 409,
          });
        }
        const info = this.stmts.updateDoc!.run(
          rev,
          body,
          now,
          fullId,
          inputRev
        );
        if (info.changes === 0) {
          throw Object.assign(new Error('Document update conflict.'), {
            code: 'FLICK_DB_CONFLICT',
            status: 409,
          });
        }
      }

      if (attachmentsForRow.length) {
        for (const att of attachmentsForRow) {
          this.stmts.upsertAttachment!.run(
            fullId,
            att.name,
            att.content_type,
            att.data
          );
        }
      }
    });

    try {
      run();
    } catch (e: any) {
      if (e?.code === 'FLICK_DB_CONFLICT') {
        return conflictError(externalId);
      }
      return toErrorInfo(e?.name || 'exception', String(e?.message || e));
    }

    return {
      id: fullId,
      _id: fullId,
      ok: true,
      rev,
    };
  }

  async get(name: string, id: string): Promise<DocRes | null> {
    this.requireDb();
    const fullId = this.getDocId(name, id);
    const row = this.stmts.selectDoc?.get(fullId) as
      | { id: string; rev: string; doc: string; updated_at: number }
      | undefined;
    if (!row) return null;
    const result = this.rowToDoc(row);
    result._id = this.replaceDocId(name, result._id);
    result.id = result._id;
    return result;
  }

  async remove(
    name: string,
    doc: Doc<any> | string
  ): Promise<DBError | DocRes> {
    this.requireDb();
    try {
      let externalId: string;
      let rev: string | undefined;

      if (typeof doc === 'object' && doc) {
        if (!doc._id || typeof doc._id !== 'string') {
          return toErrorInfo('exception', 'doc _id error');
        }
        externalId = doc._id;
        rev = doc._rev;
      } else if (typeof doc === 'string') {
        externalId = doc;
        const loaded = await this.get(name, externalId);
        if (!loaded) {
          return toErrorInfo('not_found', 'missing');
        }
        rev = loaded._rev;
      } else {
        return toErrorInfo('exception', 'param error');
      }

      const fullId = this.getDocId(name, externalId);
      const existing = this.stmts.selectDoc?.get(fullId) as
        | { id: string; rev: string }
        | undefined;
      if (!existing) return toErrorInfo('not_found', 'missing');
      if (rev && rev !== existing.rev) return conflictError(externalId);

      const info = this.stmts.deleteDoc!.run(fullId, existing.rev);
      if (info.changes === 0) return conflictError(externalId);

      return {
        id: externalId,
        _id: externalId,
        ok: true,
        rev: existing.rev,
      };
    } catch (e: any) {
      return toErrorInfo(e?.name || 'exception', String(e?.message || e));
    }
  }

  async bulkDocs(
    name: string,
    docs: Array<Doc<any>>
  ): Promise<DBError | Array<DocRes>> {
    const db = this.requireDb();
    try {
      if (!Array.isArray(docs)) return toErrorInfo('exception', 'not array');
      if (docs.find((e) => !e._id))
        return toErrorInfo('exception', 'doc not _id field');
      if (new Set(docs.map((e) => e._id)).size !== docs.length)
        return toErrorInfo('exception', '_id value exists as');

      for (const doc of docs) {
        const err = this.checkDocSize(doc);
        if (err) return err;
      }

      const results: DocRes[] = [];

      const tx = db.transaction((list: Array<Doc<any>>) => {
        for (const doc of list) {
          const externalId = doc._id;
          const fullId = this.getDocId(name, externalId);
          const r = this.putRaw(fullId, doc as DocBody, externalId);
          if ('error' in r && r.error) {
            results.push({
              id: externalId,
              _id: externalId,
              ok: false,
              rev: '',
              ...(r as any),
            } as unknown as DocRes);
          } else {
            const ok = r as DocRes;
            const external = this.replaceDocId(name, ok._id ?? fullId);
            results.push({
              ...ok,
              id: external,
              _id: external,
            });
          }
        }
      });

      tx(docs);
      return results;
    } catch (e: any) {
      return toErrorInfo(e?.name || 'exception', String(e?.message || e));
    }
  }

  async allDocs(
    name: string,
    key: string | Array<string>
  ): Promise<DBError | Array<DocRes>> {
    this.requireDb();

    try {
      let rows: Array<{ id: string; rev: string; doc: string }> = [];

      if (Array.isArray(key)) {
        const stmt = this.stmts.selectDocsByIds!;
        for (const raw of key) {
          const row = stmt.get(this.getDocId(name, raw)) as
            | { id: string; rev: string; doc: string }
            | undefined;
          if (row) rows.push(row);
        }
      } else {
        const startKey =
          typeof key === 'string' && key.length
            ? this.getDocId(name, key)
            : this.getDocId(name, '');
        const endKey = startKey + RANGE_END_MARKER;
        rows = this.stmts.selectDocsByRange!.all(startKey, endKey) as Array<{
          id: string;
          rev: string;
          doc: string;
        }>;
      }

      const out: DocRes[] = [];
      for (const row of rows) {
        const doc = this.rowToDoc(row);
        const external = this.replaceDocId(name, row.id);
        doc._id = external;
        doc.id = external;
        out.push(doc);
      }
      return out;
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  async postAttachment(
    name: string,
    docId: string,
    attachment: Buffer | Uint8Array,
    type: string
  ): Promise<DBError | DocRes> {
    const db = this.requireDb();
    const buffer = Buffer.from(attachment);
    if (buffer.byteLength > this.docAttachmentMaxByteLength) {
      return toErrorInfo(
        'exception',
        `attachment data up to ${this.docAttachmentMaxByteLength / 1024 / 1024}M`
      );
    }

    const fullId = this.getDocId(name, docId);

    try {
      const existing = this.stmts.selectDoc?.get(fullId) as
        | { id: string; rev: string; doc: string }
        | undefined;
      const body = existing ? existing.doc : JSON.stringify({});
      const rev = nextRev(existing?.rev, body);
      const now = Date.now();

      const tx = db.transaction(() => {
        if (!existing) {
          this.stmts.insertDoc!.run(fullId, rev, body, now);
        } else {
          this.stmts.updateDoc!.run(rev, body, now, fullId, existing.rev);
        }
        this.stmts.upsertAttachment!.run(fullId, '0', type || null, buffer);
      });
      tx();

      return {
        id: docId,
        _id: docId,
        ok: true,
        rev,
      };
    } catch (e: any) {
      return toErrorInfo(e?.name || 'exception', String(e?.message || e));
    }
  }

  async getAttachment(
    name: string,
    docId: string,
    key = '0'
  ): Promise<Buffer | null> {
    this.requireDb();
    const row = this.stmts.selectAttachment?.get(
      this.getDocId(name, docId),
      key
    ) as { data: Buffer } | undefined;
    return row?.data ?? null;
  }

  // -------------------------------------------------------------------------
  // Webdav backup / restore (delegates to the webdav helper module).
  // -------------------------------------------------------------------------

  public async dumpDb(config: {
    url: string;
    username: string;
    password: string;
  }): Promise<void> {
    const { default: WebDavOP } = await import('./webdav');
    const webdavClient = new WebDavOP(config);
    await webdavClient.uploadSqliteFile(this.dbFile);
  }

  public async importDb(config: {
    url: string;
    username: string;
    password: string;
  }): Promise<void> {
    const { default: WebDavOP } = await import('./webdav');
    const webdavClient = new WebDavOP(config);
    await webdavClient.downloadSqliteFile(this);
  }
}
