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
      poster: safeUrl(x.poster) ? x.poster : '',
      license: String(x.license || '').slice(0, 240)
    }));
  }
  async function resolve(id, item) {
    const a = adapters.get(id);
    if (!a || !a.rights) throw new Error('Bu kaynak için yetki/inceleme onayı bulunmuyor.');
    const result = await a.resolve(item);
    if (!result || !safeUrl(result.url)) throw new Error('Adaptör güvenli HTTPS yayın adresi döndürmedi.');
    if (!/\.(mp4|m3u8)(?:$|[?#])/i.test(result.url) && result.type !== 'hls' && result.type !== 'mp4') {
      throw new Error('Yayın türü Safari için doğrulanamadı.');
    }
    return { url: result.url, type: result.type || '', title: String(result.title || item?.title || 'Video').slice(0, 180), license: String(result.license || '').slice(0, 240) };
  }

  // Internet Archive adapter: only records explicitly marked CC0 or Public Domain Mark.
  // This is a metadata filter, not a legal determination of every item's rights.
  register({
    id: 'internet-archive-public-domain',
    name: 'Internet Archive · CC0 / Public Domain',
    description: 'Kamu malı işaretli kayıtlar; doğrudan MP4 dosyası bulunanlar',
    rights: 'authorized',
    async search(query) {
      const clean = String(query || '').replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ ]/g, ' ').trim().replace(/\s+/g, ' ');
      if (!clean) return [];
      const params = new URLSearchParams({
        q: 'mediatype:movies AND title:("' + clean + '")',
        rows: '30',
        output: 'json'
      });
      ['identifier', 'title', 'year'].forEach(k => params.append('fl[]', k));
      const response = await fetch('https://archive.org/advancedsearch.php?' + params.toString());
      if (!response.ok) throw new Error('Internet Archive araması başarısız: HTTP ' + response.status);
      const data = await response.json();
      const docs = data.response && Array.isArray(data.response.docs) ? data.response.docs : [];
      const records = await Promise.all(docs.slice(0, 20).map(async doc => {
        try {
          const metaResponse = await fetch('https://archive.org/metadata/' + encodeURIComponent(doc.identifier));
          if (!metaResponse.ok) return null;
          const meta = await metaResponse.json();
          const license = String(meta.metadata && meta.metadata.licenseurl || '');
          if (!/creativecommons\.org\/publicdomain\/(zero|mark)\/1\.0/i.test(license)) return null;
          const files = (meta.files || []).filter(file =>
            /\.mp4$/i.test(file.name || '') && Number(file.size) > 1000000
          ).sort((x, y) => Number(y.size) - Number(x.size));
          if (!files.length) return null;
          return {
            id: String(doc.identifier),
            title: String(meta.metadata && meta.metadata.title || doc.title || doc.identifier),
            kind: 'Kamu malı işaretli film',
            pageUrl: 'https://archive.org/details/' + encodeURIComponent(doc.identifier),
            poster: 'https://archive.org/services/img/' + encodeURIComponent(doc.identifier),
            license
          };
        } catch (_) { return null; }
      }));
      return records.filter(Boolean);
    },
    async resolve(item) {
      const id = String(item && item.id || '');
      if (!/^[a-zA-Z0-9._-]{1,160}$/.test(id)) throw new Error('Geçersiz arşiv kaydı.');
      const response = await fetch('https://archive.org/metadata/' + encodeURIComponent(id));
      if (!response.ok) throw new Error('Arşiv kaydı okunamadı.');
      const meta = await response.json();
      const license = String(meta.metadata && meta.metadata.licenseurl || '');
      if (!/creativecommons\.org\/publicdomain\/(zero|mark)\/1\.0/i.test(license)) {
        throw new Error('Kayıt CC0 veya Public Domain Mark olarak işaretli değil.');
      }
      const files = (meta.files || []).filter(file =>
        /\.mp4$/i.test(file.name || '') && Number(file.size) > 1000000
      ).sort((x, y) => Number(y.size) - Number(x.size));
      if (!files.length) throw new Error('Doğrudan MP4 dosyası bulunamadı.');
      const file = files[0];
      const path = file.name.split('/').map(encodeURIComponent).join('/');
      return {
        url: 'https://archive.org/download/' + encodeURIComponent(id) + '/' + path,
        type: 'mp4',
        title: String(meta.metadata && meta.metadata.title || item.title || 'Internet Archive filmi'),
        license
      };
    }
  });

  w.MRCWebAdapters = Object.freeze({
    register,
    list: () => Array.from(adapters.values()).map(a => ({
      id: a.id, name: a.name, description: a.description, rights: a.rights
    })),
    search,
    resolve
  });
})(window);
