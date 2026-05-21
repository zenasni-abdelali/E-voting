const API_ROOT = typeof EVOTE_API_URL !== 'undefined' ? EVOTE_API_URL : ' https://8586-154-121-77-33.ngrok-free.app';
const WC_P256_PREFIX = 'WC_P256.';
const EVOTE_DB = 'evote_vote_db_v1';
const EVOTE_STORE = 'signing';
const EVOTE_SK_SESSION_KEY = 'evote_elector_vote_session';

function normalizeElectorEmail(e) {
    return (e || '').trim().toLowerCase();
}

function u8ToB64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}

function b64ToU8(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
}

function hexStrToU8(hex) {
    const h = hex.replace(/\s+/g, '');
    if (h.length % 2 !== 0) throw new Error('hex');
    const u8 = new Uint8Array(h.length / 2);
    for (let i = 0; i < h.length; i += 2) u8[i / 2] = parseInt(h.slice(i, i + 2), 16);
    return u8;
}

function bufferToHex(buf) {
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function mergeUint8Arrays(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

function evoteIdbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(EVOTE_DB, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(EVOTE_STORE)) {
                db.createObjectStore(EVOTE_STORE, { keyPath: 'email' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function evoteIdbPutSession(email, ck, nfSaltU8) {
    const db = await evoteIdbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(EVOTE_STORE, 'readwrite');
        tx.objectStore(EVOTE_STORE).put({
            email: normalizeElectorEmail(email),
            ck,
            nfSalt: nfSaltU8,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function evoteIdbGetSession(email) {
    const db = await evoteIdbOpen();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(EVOTE_STORE, 'readonly');
        const q = tx.objectStore(EVOTE_STORE).get(normalizeElectorEmail(email));
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => reject(q.error);
    });
}

async function evoteIdbClearAll() {
    try {
        const db = await evoteIdbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(EVOTE_STORE, 'readwrite');
            tx.objectStore(EVOTE_STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (_) {}
}

async function deriveAesWrapKeyFromPassword(password, saltU8) {
    const enc = new TextEncoder();
    const pwKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltU8,
            iterations: 100000,
            hash: 'SHA-256',
        },
        pwKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['wrapKey', 'unwrapKey']
    );
}

async function unwrapP256Pkcs8WithPassword(selB64, ivWrapB64, encKPayload, password) {
    let blob = typeof encKPayload === 'string' ? JSON.parse(encKPayload) : encKPayload;
    if (!(blob && blob.v === 3 && blob.w)) {
        throw new Error('Stockage WC invalide.');
    }
    const saltStr = forge.util.decode64(selB64);
    const saltU8 = new Uint8Array(saltStr.length);
    for (let i = 0; i < saltStr.length; i++) saltU8[i] = saltStr.charCodeAt(i);

    let ivWrap;
    try {
        const ivField = forge.util.decode64(ivWrapB64);
        ivWrap = new Uint8Array(ivField.length);
        for (let i = 0; i < ivField.length; i++) ivWrap[i] = ivField.charCodeAt(i);
    } catch (_) {
        throw new Error('IV WC invalide.');
    }
    if (ivWrap.length !== 12) {
        throw new Error('IV WC invalide (12 octets attendus).');
    }

    const wrapped = b64ToU8(blob.w);
    const unwrapKeyAES = await deriveAesWrapKeyFromPassword(password, saltU8);
    const priv = await crypto.subtle.unwrapKey(
        'pkcs8',
        wrapped,
        unwrapKeyAES,
        { name: 'AES-GCM', iv: ivWrap },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
    return priv;
}

async function wcSignChallengeDigest(privCk, challengeHexAscii) {
    const msg = hexStrToU8(challengeHexAscii.trim());
    const sigBuf = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privCk, msg);
    return bufferToHex(sigBuf);
}

window.evoteHydrateWcSigningFromLogin = async function ({
    email,
    password,
    sel,
    iv,
    enc_k,
    challengeHex,
}) {
    if (!crypto.subtle) {
        throw new Error('WebCrypto indisponible dans ce navigateur.');
    }
    const ck = await unwrapP256Pkcs8WithPassword(sel, iv, enc_k, password);
    const sigDerHex = await wcSignChallengeDigest(ck, challengeHex);
    const au = await fetch(`${API_ROOT}/api/elector/auth-step2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: email,
            signature: sigDerHex,
        }),
    });
    const jd = await au.json().catch(() => ({}));
    if (!au.ok || jd.status !== 'valide') {
        throw new Error(typeof jd.detail === 'string' ? jd.detail : 'Authentification refusée (WC).');
    }

    const nfSalt = crypto.getRandomValues(new Uint8Array(16));
    await evoteIdbPutSession(email, ck, nfSalt);
    return jd;
};

window.evoteRegisterWcSignupPayload = async function (password, saltForgeB64, wrapIvForgeB64) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
    const spkiU8 = new Uint8Array(spki);
    const cle_publique = WC_P256_PREFIX + u8ToB64(spkiU8);

    const saltStr = forge.util.decode64(saltForgeB64);
    const saltU8 = new Uint8Array(saltStr.length);
    for (let i = 0; i < saltStr.length; i++) saltU8[i] = saltStr.charCodeAt(i);

    const ivFieldStr = forge.util.decode64(wrapIvForgeB64);
    const ivWrap = new Uint8Array(ivFieldStr.length);
    for (let i = 0; i < ivFieldStr.length; i++) ivWrap[i] = ivFieldStr.charCodeAt(i);

    const unwrapKeyAES = await deriveAesWrapKeyFromPassword(password, saltU8);
    const wrapped = await crypto.subtle.wrapKey('pkcs8', pair.privateKey, unwrapKeyAES, { name: 'AES-GCM', iv: ivWrap });
    const enc_k_obj = {
        v: 3,
        w: u8ToB64(new Uint8Array(wrapped)),
    };

    pair.privateKey = null;
    pair.publicKey = null;

    return {
        cle_publique,
        enc_k: JSON.stringify(enc_k_obj),
    };
};

async function isElectorSigningReady(email) {
    const row = await evoteIdbGetSession(email);
    return !!(row && row.ck);
}

function clearElectorVoteSessionSync() {
    try {
        sessionStorage.removeItem(EVOTE_SK_SESSION_KEY);
    } catch (_) {}
}

async function clearElectorVoteSession() {
    clearElectorVoteSessionSync();
    await evoteIdbClearAll();
}

window.isElectorSigningReady = isElectorSigningReady;
window.clearElectorVoteSession = clearElectorVoteSession;

function deriveAesKey(password, salt) {
    return forge.pkcs5.pbkdf2(password, salt, 100000, 32, forge.md.sha256.create());
}

async function unlockElectorPrivateKeyHex(email, password) {
    const res1 = await fetch(`${API_ROOT}/api/elector/auth-step1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
    });
    const data1 = await res1.json();
    if (!res1.ok || data1.status !== 'existe') {
        throw new Error(data1.detail || data1.message || 'Compte ou session introuvable');
    }
    if (typeof data1.enc_k !== 'string' || !data1.enc_k.trim().startsWith('{')) {
        throw new Error('Compte ancien non compatible P-256. Veuillez vous reinscrire.');
    }
    await window.evoteHydrateWcSigningFromLogin({
        email,
        password,
        sel: data1.sel,
        iv: data1.iv,
        enc_k: data1.enc_k,
        challengeHex: data1.challenge,
    });
    return null;
}

async function wcNullifierDigest(nfSaltU8, participationId, voteOrdinal) {
    const enc = new TextEncoder();
    const body = mergeUint8Arrays([
        nfSaltU8,
        enc.encode('|'),
        enc.encode(String(participationId)),
        enc.encode('|'),
        enc.encode(String(voteOrdinal)),
    ]);
    const digest = await crypto.subtle.digest('SHA-256', body);
    return bufferToHex(digest);
}

function sha256Hex(hexChallenge) {
    const md = forge.md.sha256.create();
    md.update(forge.util.hexToBytes(hexChallenge), 'raw');
    return md.digest().toHex();
}

function kdfSymmetricKey(sharedU8) {
    let bin = '';
    for (let i = 0; i < sharedU8.length; i++) {
        bin += String.fromCharCode(sharedU8[i]);
    }
    const md = forge.md.sha256.create();
    md.update(bin, 'raw');
    md.update('|E-VOTE-BULLETIN-v1', 'utf8');
    return forge.util.hexToBytes(md.digest().toHex());
}

function encryptBulletinAesGcm(symKeyBytes, plaintextUtf8) {
    const iv = forge.random.getBytesSync(16);
    const cipher = forge.cipher.createCipher('AES-GCM', symKeyBytes);
    cipher.start({ iv: iv });
    cipher.update(forge.util.createBuffer(plaintextUtf8, 'utf8'));
    cipher.finish();
    const ciphertextHex = cipher.output.toHex();
    const tagHex = cipher.mode.tag.toHex();
    const bulletinHex = ciphertextHex + tagHex;
    return { iv_hex: forge.util.bytesToHex(iv), bulletin_hex: bulletinHex };
}

function hashBulletinSha256Hex(bulletinHex) {
    const md = forge.md.sha256.create();
    md.update(forge.util.hexToBytes(bulletinHex), 'raw');
    return md.digest().toHex();
}

async function signBulletinWc(pkcs8Ck, bulletinHexAscii) {
    // Sign the real bulletin bytes (decoded from hex), not a JS string wrapper.
    const u8 = hexStrToU8(bulletinHexAscii);
    const sigBuf = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pkcs8Ck, u8);
    return bufferToHex(sigBuf);
}

async function importP256EcdhPublicRaw(rawHex) {
    let h = rawHex.trim().toLowerCase().replace(/\s+/g, '');
    if (!h.startsWith('04')) h = '04' + h;
    return crypto.subtle.importKey('raw', hexStrToU8(h), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function encryptForElectionP256(publicKeyHex, plaintextUtf8) {
    const electionPublic = await importP256EcdhPublicRaw(publicKeyHex);
    const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: electionPublic }, eph.privateKey, 256));
    const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
    const ks = kdfSymmetricKey(shared);
    return {
        pointR: bufferToHex(rawPub),
        ...encryptBulletinAesGcm(ks, plaintextUtf8),
    };
}

async function submitEncryptedVote(ctx) {
    const { email, password, election_id, cle_publique_election, participation_id, vote_ordinal, candidat_id } = ctx;
    let wcCk = (await evoteIdbGetSession(email))?.ck || null;
    if (!wcCk) {
        if (!password) {
            throw new Error('Cle de signature indisponible : utilisez votre mot de passe ci-dessus, ou reconnectez-vous depuis la page de connexion.');
        }
        await unlockElectorPrivateKeyHex(email, password);
        wcCk = (await evoteIdbGetSession(email))?.ck || null;
    }
    if (!wcCk) throw new Error('Cle P-256 indisponible. Reconnectez-vous.');

    const payload = JSON.stringify({ candidat_id: candidat_id });
    const { pointR, iv_hex, bulletin_hex } = await encryptForElectionP256(cle_publique_election, payload);
    const hash_hex = hashBulletinSha256Hex(bulletin_hex);
    const row2 = await evoteIdbGetSession(email);
    if (!row2?.nfSalt) {
        throw new Error('Session de vote WC incomplete. Reconnectez-vous.');
    }
    const signature_der_hex = await signBulletinWc(wcCk, bulletin_hex);
    const nf = await wcNullifierDigest(row2.nfSalt, participation_id, vote_ordinal);

    const voteBody = {
        elector_email: email,
        election_id: election_id,
        participation_id: participation_id,
        vote_ordinal: vote_ordinal,
        candidat_id: candidat_id,
        point_ephem_r: pointR,
        iv_hex: iv_hex,
        bulletin_hex: bulletin_hex,
        hash_b_hex: hash_hex,
        signature_der_hex: signature_der_hex,
        nullifier_hex: nf,
    };

    const response = await fetch(`${API_ROOT}/api/elector/votes/cast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteBody),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const d = data.detail;
        let msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => (x.msg || x.type || '').toString()).join('; ') : JSON.stringify(d || {});
        throw new Error(msg || 'Echec envoi bulletin');
    }
    return data;
}

async function requestVoteVerificationPacket(ctx) {
    const { email, election_id, nullifier_hex } = ctx || {};
    const response = await fetch(`${API_ROOT}/api/elector/votes/verify/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            elector_email: email,
            election_id: election_id,
            nullifier_hex: nullifier_hex,
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || 'Échec demande de vérification');
    }
    return data;
}

async function submitVoteVerificationDecision(ctx) {
    const { email, election_id, nullifier_hex, proof_valid, reason } = ctx || {};
    const response = await fetch(`${API_ROOT}/api/elector/votes/verify/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            elector_email: email,
            election_id: election_id,
            nullifier_hex: nullifier_hex,
            proof_valid: !!proof_valid,
            reason: reason || '',
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || 'Échec confirmation de vérification');
    }
    return data;
}

window.requestVoteVerificationPacket = requestVoteVerificationPacket;
window.submitVoteVerificationDecision = submitVoteVerificationDecision;
