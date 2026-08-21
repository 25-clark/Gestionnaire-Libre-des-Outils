/**
 * Store de sessions sur disque — survit aux redémarrages nodemon
 * (contrairement au MemoryStore par défaut d'express-session).
 */
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const os = require('os');

class FileSessionStore extends session.Store {
    constructor(options = {}) {
        super();
        // Hors du projet Server → nodemon ne redémarre plus à chaque login/logout
        this.dir = options.dir || path.join(os.tmpdir(), 'glo-sessions');
        if (!fs.existsSync(this.dir)) {
            fs.mkdirSync(this.dir, { recursive: true });
        }
        // Nettoyage périodique
        setInterval(() => this._purge(), 10 * 60 * 1000).unref();
    }

    _file(sid) {
        const safe = String(sid).replace(/[^a-zA-Z0-9_\-%.]/g, '_');
        return path.join(this.dir, safe + '.json');
    }

    get(sid, cb) {
        const f = this._file(sid);
        fs.readFile(f, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') return cb(null, null);
                return cb(err);
            }
            try {
                const sess = JSON.parse(data);
                if (sess.__expires && Date.now() > sess.__expires) {
                    fs.unlink(f, () => {});
                    return cb(null, null);
                }
                delete sess.__expires;
                cb(null, sess);
            } catch (e) {
                cb(null, null);
            }
        });
    }

    set(sid, sess, cb) {
        const f = this._file(sid);
        const copy = { ...sess };
        const maxAge = (sess.cookie && sess.cookie.maxAge) || (8 * 60 * 60 * 1000);
        copy.__expires = Date.now() + maxAge;
        fs.writeFile(f, JSON.stringify(copy), (err) => cb && cb(err));
    }

    destroy(sid, cb) {
        fs.unlink(this._file(sid), () => cb && cb());
    }

    touch(sid, sess, cb) {
        this.set(sid, sess, cb);
    }

    _purge() {
        let files;
        try { files = fs.readdirSync(this.dir); } catch { return; }
        const now = Date.now();
        for (const name of files) {
            if (!name.endsWith('.json')) continue;
            const f = path.join(this.dir, name);
            try {
                const sess = JSON.parse(fs.readFileSync(f, 'utf8'));
                if (sess.__expires && now > sess.__expires) fs.unlinkSync(f);
            } catch {
                try { fs.unlinkSync(f); } catch {}
            }
        }
    }
}

module.exports = FileSessionStore;
