/* MRC Stream: Safari Web Adapter API
 * Native .cs3/Kotlin binaries are NOT executable here. Adapters must be reviewed,
 * bundled JavaScript and may only expose authorized, browser-compatible sources.
 * Remote scripts, eval, dynamic code loading and DRM circumvention are intentionally unsupported.
 */
(function (w) {
  'use strict';
  const adapters = new Map();
  const safeUrl = value => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password;
    } catch (_) { return false; }
  };
  function register(adapter) {
    if (!adapter || typeof adapter.id !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{1,47}$/.test(adapter.id) ||
        typeof adapter.name !== 'string' ||
        typeof adapter.search !== 'function' ||
        typeof adapter.resolve !== 'function') {
      throw new TypeError('Geçersiz MRC Web Adapter tanımı');
    }
    if (adapters.has(adapter.id)) throw new Error('Adaptör zaten kayıtlı: ' + adapter.id);
    adapters.set(adapter.id, Object.freeze({
      id: adapter.id,
      name: adapter.name.slice(0, 80),
      description: String(adapter.description || '').slice(0, 240),
      rights: adapter.rights === 'authorized',
      search: adapter.search,
      resolve: adapter.resolve
    }));
  }
  async function search(id, query) {
    const a = adapters.get(id);
    if (!a || !a.rights) throw new Error('Bu kaynak için yetki/inceleme onayı bulunmuyor.');
    const rows = await a.search(String(query || '').slice(0, 160));
    if (!Array.isArray(rows)) throw new Error('Adaptör arama sonucu geçersiz.');
    return rows.slice(0, 50).map(x => ({
      id: String(x.id || ''),
      title: String(x.title || 'İsimsiz içerik').slice(0, 180),
      kind: String(x.kind || 'video').slice(0, 30),
      pageUrl: safeUrl(x.pageUrl) ? x.pageUrl : '',
      poster: safeUrl(x.poster) ? x.poster : ''
    }));
  }
  async function resolve(id, item) {
    const a = adapters.get(id);
    if (!a || !a.rights) throw new Error('Bu kaynak için yetki/inceleme onayı bulunmuyor.');
    const result = await a.resolve(item);
    if (!result || !safeUrl(result.url)) throw new Error('Adaptör güvenli HTTPS yayın adresi döndürmedi.');
    if (!/\\.(mp4|m3u8)(?:$|[?#])/i.test(result.url) && result.type !== 'hls' && result.type !== 'mp4') {
      throw new Error('Yayın türü Safari için doğrulanamadı.');
    }
    return { url: result.url, type: result.type || '', title: String(result.title || item?.title || 'Video').slice(0, 180) };
  }
  w.MRCWebAdapters = Object.freeze({
    register,
    list: () => Array.from(adapters.values()).map(a => ({
      id: a.id, name: a.name, description: a.description, rights: a.rights
    })),
    search,
    resolve
  });
})(window);
