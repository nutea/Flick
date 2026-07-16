import PluginHandler from '@/core/plugin-handler';
import screenCapture from '@/core/screen-capture';

// `LocalDb` intentionally not re-exported from this barrel: it depends on
// `better-sqlite3`, a native addon that has no business being in the renderer
// bundle. Main-process consumers import it directly from `@/core/db` instead.
export { PluginHandler, screenCapture };
