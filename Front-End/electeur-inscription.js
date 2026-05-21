const URL = " https://8586-154-121-77-33.ngrok-free.app";

(() => {
const WC_P256_PREFIX = 'WC_P256.';

function showMessage(message, type = 'info') {
    let stack = document.getElementById('app-toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'app-toast-stack';
        stack.style.position = 'fixed';
        stack.style.top = '20px';
        stack.style.left = '50%';
        stack.style.transform = 'translateX(-50%)';
        stack.style.zIndex = '999999';
        stack.style.width = 'min(88vw, 460px)';
        stack.style.display = 'flex';
        stack.style.flexDirection = 'column';
        stack.style.gap = '10px';
        stack.style.pointerEvents = 'none';
        document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? '#b91c1c' : '#047857';
    toast.style.background = bgColor;
    toast.style.color = '#ffffff';
    toast.style.border = '2px solid rgba(255,255,255,0.95)';
    toast.style.borderRadius = '14px';
    toast.style.padding = '10px 14px';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '700';
    toast.style.lineHeight = '1.3';
    toast.style.textAlign = 'center';
    toast.style.boxShadow = '0 18px 45px rgba(0,0,0,0.45)';
    toast.style.pointerEvents = 'auto';
    toast.style.opacity = '1';
    toast.style.transition = 'opacity .3s ease, transform .3s ease';
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-4px)';
        setTimeout(() => toast.remove(), 320);
    }, 2800);
}

function u8ToB64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}

function b64ToU8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function forgeB64ToU8(b64) {
    const bin = forge.util.decode64(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bufferToHex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToU8(hex) {
    const h = hex.trim().replace(/\s+/g, '');
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < h.length; i += 2) out[i / 2] = parseInt(h.slice(i, i + 2), 16);
    return out;
}

async function deriveAesWrapKeyFromPassword(password, saltU8) {
    const pwKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltU8, iterations: 100000, hash: 'SHA-256' },
        pwKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['wrapKey', 'unwrapKey']
    );
}

async function buildP256SignupPayload(nom, email, password) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await deriveAesWrapKeyFromPassword(password, salt);
    const wrapped = await crypto.subtle.wrapKey('pkcs8', pair.privateKey, wrapKey, { name: 'AES-GCM', iv });
    const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
    return {
        nom,
        email,
        cle_publique: WC_P256_PREFIX + u8ToB64(new Uint8Array(spki)),
        sel: forge.util.encode64(String.fromCharCode(...salt)),
        iv: forge.util.encode64(String.fromCharCode(...iv)),
        enc_k: JSON.stringify({ v: 3, w: u8ToB64(new Uint8Array(wrapped)) }),
    };
}

async function unwrapP256PrivateKey(password, sel, iv, encK) {
    const blob = JSON.parse(encK);
    const wrapKey = await deriveAesWrapKeyFromPassword(password, forgeB64ToU8(sel));
    return crypto.subtle.unwrapKey(
        'pkcs8',
        b64ToU8(blob.w),
        wrapKey,
        { name: 'AES-GCM', iv: forgeB64ToU8(iv) },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
}

async function signChallenge(privateKey, challengeHex) {
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, hexToU8(challengeHex));
    return bufferToHex(sig);
}

async function startInscription() {
    const nom = document.getElementById('elector-fullname').value;
    const email = document.getElementById('elector-email').value;
    const password = document.getElementById('elector-mdp').value;
    if (!nom || !email || !password) {
        showMessage('Veuillez remplir tous les champs.', 'error');
        return;
    }
    if (!window.crypto?.subtle) {
        showMessage('Navigateur incompatible avec P-256/WebCrypto.', 'error');
        return;
    }
    try {
        const payload = await buildP256SignupPayload(nom, email, password);
        const response = await fetch(`${URL}/api/elector/inscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok) showOTP();
        else showMessage('Erreur: ' + (data.detail || 'Erreur inconnue'), 'error');
    } catch (error) {
        console.error(error);
        showMessage('Une erreur de chiffrement ou de connexion est survenue.', 'error');
    }
}

async function verifyOTP() {
    const code = document.getElementById('otp-input').value;
    const email = document.getElementById('elector-email').value;
    try {
        const response = await fetch(`${URL}/api/elector/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp: code }),
        });
        const data = await response.json();
        if (response.ok) {
            showMessage('Inscription réussie !', 'success');
            localStorage.setItem('evote_user', JSON.stringify({ role: 'elector', nom: data.nom, email: data.email }));
            window.location.href = 'Espace-electeur.html';
        } else showMessage('Erreur: ' + (data.detail || 'Code OTP invalide.'), 'error');
    } catch (error) {
        console.error(error);
    }
}

async function loginElector() {
    const email = document.getElementById('elector-email-log').value;
    const password = document.getElementById('elector-mdp-log').value;
    if (!email || !password) {
        showMessage('Veuillez remplir tous les champs.', 'error');
        return;
    }
    try {
        if (typeof window.evoteHydrateWcSigningFromLogin === 'function') {
            const res1 = await fetch(`${URL}/api/elector/auth-step1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data1 = await res1.json();
            if (data1.status === 'inexistant') {
                showMessage('Utilisateur inexistant. Veuillez vous inscrire.', 'error');
                return;
            }
            const data2 = await window.evoteHydrateWcSigningFromLogin({
                email,
                password,
                sel: data1.sel,
                iv: data1.iv,
                enc_k: data1.enc_k,
                challengeHex: data1.challenge,
            });
            showMessage('Authentification réussie !', 'success');
            localStorage.setItem('evote_user', JSON.stringify({ role: 'elector', nom: data2.nom, email: data2.email }));
            window.location.href = 'Espace-electeur.html';
        }
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Impossible de terminer l'authentification.", 'error');
    }
}

let resetEmail = '';

async function resetPasswordFields(password) {
    return buildP256SignupPayload('', resetEmail, password);
}

function setResetStep(step) {
    ['reset-email-step', 'reset-otp-step', 'reset-password-step'].forEach((id) => document.getElementById(id).classList.add('hidden'));
    document.getElementById(step).classList.remove('hidden');
}

function openPasswordResetDialog() {
    document.getElementById('reset-email').value = document.getElementById('elector-email-log').value.trim();
    document.getElementById('reset-otp').value = '';
    document.getElementById('reset-new-password').value = '';
    document.getElementById('reset-confirm-password').value = '';
    document.getElementById('reset-message').textContent = '';
    setResetStep('reset-email-step');
    document.getElementById('password-reset-overlay').classList.remove('hidden');
}

function closePasswordResetDialog() {
    document.getElementById('password-reset-overlay').classList.add('hidden');
}

async function requestPasswordReset() {
    const email = document.getElementById('reset-email').value.trim();
    const message = document.getElementById('reset-message');
    if (!email) {
        message.textContent = 'Veuillez entrer votre email.';
        return;
    }
    const response = await fetch(`${URL}/api/elector/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) {
        message.textContent = data.detail || 'Utilisateur non inscrit.';
        return;
    }
    resetEmail = email;
    message.textContent = 'Un OTP a ete envoye a votre email.';
    setResetStep('reset-otp-step');
}

async function verifyPasswordResetOtp() {
    const otp = document.getElementById('reset-otp').value.trim();
    const message = document.getElementById('reset-message');
    const response = await fetch(`${URL}/api/elector/password-reset/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp }),
    });
    const data = await response.json();
    if (!response.ok) {
        message.textContent = data.detail || 'Code OTP invalide.';
        return;
    }
    message.textContent = 'OTP valide. Creez votre nouveau mot de passe.';
    setResetStep('reset-password-step');
}

async function confirmPasswordReset() {
    const password = document.getElementById('reset-new-password').value;
    const confirmPassword = document.getElementById('reset-confirm-password').value;
    const message = document.getElementById('reset-message');
    if (!password || password !== confirmPassword) {
        message.textContent = 'Les mots de passe ne correspondent pas.';
        return;
    }
    const payload = await resetPasswordFields(password);
    payload.email = resetEmail;
    delete payload.nom;
    const response = await fetch(`${URL}/api/elector/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
        message.textContent = data.detail || 'Modification impossible.';
        return;
    }
    if (typeof window.clearElectorVoteSession === 'function') window.clearElectorVoteSession();
    showMessage('Mot de passe modifie avec succes.', 'success');
    closePasswordResetDialog();
}

Object.assign(window, {
    startInscription,
    verifyOTP,
    loginElector,
    openPasswordResetDialog,
    closePasswordResetDialog,
    requestPasswordReset,
    verifyPasswordResetOtp,
    confirmPasswordReset,
});
})();