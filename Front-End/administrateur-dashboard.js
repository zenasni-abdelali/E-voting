// ═══════════════════════════════════════════════════
//  admin-dashboard.js — E-Voting Admin Dashboard
// ═══════════════════════════════════════════════════

/* ─── Config ─────────────────────────────────────── */
const API_BASE_URL = "https://8586-154-121-77-33.ngrok-free.app";

/* ─── State ─────────────────────────────────────── */
let currentAdmin = null;
let lastDashboardData = { elections: [] };

/* ─── Utilities ─────────────────────────────────── */

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function showToast(message, type = "info") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const color = type === "error" ? "bg-red-600" : "bg-emerald-600";
    const t = document.createElement("div");
    t.className = `${color} text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm pointer-events-auto`;
    t.textContent = message;
    stack.appendChild(t);
    setTimeout(() => {
        t.classList.add("opacity-0", "translate-x-2", "transition-all", "duration-300");
        setTimeout(() => t.remove(), 320);
    }, 2800);
}

function bindIfPresent(id, eventName, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(eventName, handler);
}

/* ─── Profile Modal ──────────────────────────────── */

function openAdminProfile() {
    const overlay = document.getElementById("admin-profile-overlay");
    if (currentAdmin) {
        document.getElementById("admin-profile-name").value = currentAdmin.nom || "";
        document.getElementById("admin-profile-email").value = currentAdmin.email || "";
    }
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
}

function closeAdminProfile() {
    const overlay = document.getElementById("admin-profile-overlay");
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
}

/* ─── Confirmation Dialog ────────────────────────── */

function askConfirmation({ title, message }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById("confirm-overlay");
        const titleEl = document.getElementById("confirm-title");
        const msgEl = document.getElementById("confirm-message");
        const noBtn = document.getElementById("confirm-no");
        const yesBtn = document.getElementById("confirm-yes");

        if (!overlay || !titleEl || !msgEl || !noBtn || !yesBtn) {
            resolve(false);
            return;
        }

        titleEl.textContent = title || "Confirmation";
        msgEl.textContent = message || "";

        overlay.classList.remove("hidden");
        overlay.classList.add("flex");

        const done = (v) => {
            overlay.classList.add("hidden");
            overlay.classList.remove("flex");
            noBtn.removeEventListener("click", onNo);
            yesBtn.removeEventListener("click", onYes);
            overlay.removeEventListener("click", onBackdrop);
            resolve(v);
        };

        const onNo = () => done(false);
        const onYes = () => done(true);
        const onBackdrop = (e) => { if (e.target === overlay) done(false); };

        noBtn.addEventListener("click", onNo);
        yesBtn.addEventListener("click", onYes);
        overlay.addEventListener("click", onBackdrop);
    });
}

/* ─── Logout Permission Dialog ───────────────────── */

window.askLogoutPermission = function () {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4";
        overlay.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl transform transition-all scale-100 border border-slate-100">
                <div class="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                    <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </div>
                <h3 class="text-2xl font-bold text-slate-800 text-center mb-2">Déconnexion</h3>
                <p class="text-slate-500 text-center mb-8">Êtes-vous sûr de vouloir quitter votre session administrateur ?</p>
                <div class="flex gap-4">
                    <button id="cancel-logout" class="flex-1 px-6 py-3.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">Annuler</button>
                    <button id="confirm-logout" class="flex-1 px-6 py-3.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-all">Se déconnecter</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById("cancel-logout").onclick = () => { overlay.remove(); resolve(false); };
        document.getElementById("confirm-logout").onclick = () => { overlay.remove(); resolve(true); };
    });
};

async function handleLogout() {
    const permitted = await askLogoutPermission();
    if (!permitted) return;
    const ok = await askConfirmation({ title: tAdmin("CONFIRMATION"), message: tAdmin("Voulez-vous vraiment quitter") });
    if (ok) {
        localStorage.removeItem("evote_user");
        localStorage.removeItem("admin_email");
        sessionStorage.removeItem("admin_private_pkcs8_b64");
        sessionStorage.removeItem("admin_email");
        currentAdmin = null;
        window.location.href = "index.html";
    }
}

/* ─── Action View (generic modal) ───────────────── */

function openActionView(title, html) {
    document.getElementById("action-view-title").textContent = title;
    document.getElementById("action-view-body").innerHTML = html;
    document.getElementById("action-view-overlay").classList.remove("hidden");
}

function closeActionView() {
    document.getElementById("action-view-overlay").classList.add("hidden");
}

/* ─── Results Rendering ──────────────────────────── */

function renderPublishedResultsIn(targetId, election, payload) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const results = payload?.results || {};
    const rows = Array.isArray(results.tally) ? results.tally : [];

    if (!rows.length) {
        target.innerHTML = '<p class="text-sm text-slate-500">Aucun détail de résultat disponible.</p>';
        return;
    }

    const total = rows.reduce((acc, r) => acc + (Number(r.votes) || 0), 0);
    const winnerVotes = Math.max(0, ...rows.map((r) => Number(r.votes) || 0));

    const tableRows = rows.map((r) => {
        const v = Number(r.votes) || 0;
        const pct = total > 0 ? ((v * 100) / total).toFixed(1) : "0.0";
        const isWinner = v === winnerVotes && winnerVotes > 0;
        const rowClass = isWinner ? "bg-emerald-50/70" : "";
        const nameClass = isWinner ? "text-emerald-800" : "text-slate-800";
        const voteClass = isWinner ? "text-emerald-700 font-bold" : "text-slate-700";
        return `<tr class="border-t border-slate-100 ${rowClass}">
            <td class="py-2.5 px-3 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            <td class="py-2.5 px-3 text-center ${voteClass}">${v}</td>
            <td class="py-2.5 px-3 text-center text-fuchsia-700 font-semibold">${pct}%</td>
        </tr>`;
    }).join("");

    const rankingRows = [...rows]
        .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0))
        .map((r, idx) => {
            const v = Number(r.votes) || 0;
            const isWinner = v === winnerVotes && winnerVotes > 0;
            const rowClass = isWinner ? "bg-emerald-50/70" : "";
            const nameClass = isWinner ? "text-emerald-800 font-bold" : "text-slate-800";
            const rankClass = isWinner ? "text-emerald-700" : "text-slate-700";
            return `<tr class="border-t border-slate-100 ${rowClass}">
                <td class="py-2.5 px-3 ${rankClass} font-semibold">${idx + 1}</td>
                <td class="py-2.5 px-3 font-medium ${nameClass}">${escapeHtml(r.nom || `Candidat ${r.candidat_id}`)}${isWinner ? ' <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700">(gagnant)</span>' : ""}</td>
            </tr>`;
        }).join("");

    const mode = (election?.affichage_resultats || "").toLowerCase();
    const useTable = mode === "complet" || mode === "tableau_detaille";

    const body = useTable
        ? `<div class="rounded-xl border border-slate-200 overflow-hidden">
               <table class="w-full text-sm">
                   <thead><tr class="text-left text-slate-500 bg-white"><th class="py-2.5 px-3">Candidat</th><th class="py-2.5 px-3 text-center">Voix</th><th class="py-2.5 px-3 text-center">%</th></tr></thead>
                   <tbody>${tableRows}</tbody>
               </table>
           </div>`
        : `<div class="rounded-xl border border-slate-200 overflow-hidden">
               <table class="w-full text-sm">
                   <thead><tr class="text-left text-slate-500 bg-white"><th class="py-2.5 px-3">Rang</th><th class="py-2.5 px-3">Candidat</th></tr></thead>
                   <tbody>${rankingRows}</tbody>
               </table>
           </div>`;

    target.innerHTML = `
        <div class="bg-slate-50 px-4 py-2 text-xs text-slate-500 rounded-t-xl border border-slate-200 border-b-0">
            Publication : ${escapeHtml(payload?.date_publication || "-")} ${escapeHtml(payload?.temps_publication || "")}
        </div>
        ${body}`;
}

async function openElectionResultsView(electionId) {
    const election = (lastDashboardData.elections || []).find((e) => e.id === electionId);
    openActionView("Résultats d'élection", '<p class="text-sm text-slate-500">Chargement des résultats...</p>');
    try {
        const r = await fetch(`${API_BASE_URL}/api/public/elections/${electionId}/published-results`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            openActionView("Résultats d'élection", `<p class="text-sm text-red-600">${escapeHtml(data.detail || "Résultats indisponibles.")}</p>`);
            return;
        }
        openActionView(`Résultats — ${escapeHtml(election?.titre || `Élection #${electionId}`)}`, '<div id="single-results-wrap"></div>');
        renderPublishedResultsIn("single-results-wrap", election, data);
    } catch (_) {
        openActionView("Résultats d'élection", '<p class="text-sm text-red-600">Erreur de connexion serveur.</p>');
    }
}

async function openQuickResultsView() {
    const rows = (lastDashboardData.elections || []).map((e) => `
        <div class="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
            <div>
                <p class="font-semibold text-slate-800">${escapeHtml(e.titre)}</p>
                <p class="text-xs text-slate-500">${escapeHtml(e.date_ouverture)} ${escapeHtml(e.temps_ouverture)} -> ${escapeHtml(e.date_cloture)} ${escapeHtml(e.temps_cloture)}</p>
            </div>
            <button type="button" class="admin-see-results-btn px-4 py-2 rounded-lg text-sm font-semibold ${e.results_published ? "bg-fuchsia-600 hover:bg-fuchsia-700 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"}" data-eid="${e.id}" ${e.results_published ? "" : "disabled"}>${e.results_published ? "Voir résultats" : "Non publiés"}</button>
        </div>
    `).join("");

    openActionView("Résultats des élections", rows || '<p class="text-sm text-slate-500">Aucune élection.</p>');
    document.querySelectorAll(".admin-see-results-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.dataset.eid, 10);
            if (Number.isFinite(id)) openElectionResultsView(id);
        });
    });
}

/* ─── Electors Management ────────────────────────── */

async function openElectorsManagementView() {
    openActionView("Gestion des électeurs", '<p class="text-sm text-slate-500">Chargement des demandes...</p>');
    try {
        const adminEmail = getAdminEmail();
        if (!adminEmail) {
            openActionView("Gestion des électeurs", '<p class="text-sm text-red-600">Session administrateur invalide. Reconnectez-vous.</p>');
            return;
        }
        const response = await fetch(`${API_BASE_URL}/api/admin/participations/pending?admin_email=${encodeURIComponent(adminEmail)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json();
        if (!response.ok) {
            openActionView("Gestion des électeurs", `<p class="text-sm text-red-600">${escapeHtml(data.detail || "Impossible de charger les demandes.")}</p>`);
            return;
        }
        if (!data.pending?.length) {
            openActionView("Gestion des électeurs", '<p class="text-sm text-slate-500">Aucune demande en attente.</p>');
            return;
        }
        const html = data.pending.map((item) => `
            <div class="rounded-xl border border-slate-200 p-3 bg-slate-50 mb-3">
                <p class="text-sm font-semibold text-slate-800">${escapeHtml(item.elector_nom)}</p>
                <p class="text-xs text-slate-500">${escapeHtml(item.elector_email)}</p>
                <p class="text-xs text-slate-600 mt-1">Élection: <span class="font-semibold">${escapeHtml(item.election_titre)}</span></p>
                <div class="flex gap-2 mt-3">
                    <button data-id="${item.participation_id}" data-decision="accept" class="quick-decision-btn flex-1 bg-emerald-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-emerald-700">Accepter</button>
                    <button data-id="${item.participation_id}" data-decision="refuse" class="quick-decision-btn flex-1 bg-red-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-red-700">Refuser</button>
                </div>
            </div>
        `).join("");
        openActionView("Gestion des électeurs", html);
        document.querySelectorAll(".quick-decision-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                await handleParticipationDecision(btn.dataset.id, btn.dataset.decision);
                await openElectorsManagementView();
            });
        });
    } catch (_) {
        openActionView("Gestion des électeurs", '<p class="text-sm text-red-600">Erreur de connexion serveur.</p>');
    }
}

function openCandidatesView() {
    const elections = lastDashboardData.elections || [];
    const html = elections.length
        ? elections.map((e) => `
            <div class="rounded-xl border border-slate-200 p-4 mb-3">
                <p class="font-semibold text-slate-800">${escapeHtml(e.titre)}</p>
                <p class="text-xs text-slate-500 mt-1">Nombre de candidats: <span class="font-semibold text-emerald-700">${e.candidats}</span></p>
                <p class="text-xs text-slate-500">Statut: ${escapeHtml(e.status)}</p>
            </div>
        `).join("")
        : '<p class="text-sm text-slate-500">Aucune élection pour le moment.</p>';
    openActionView("Gestion des candidats", html);
}

function openStatsView() {
    const elections = lastDashboardData.elections || [];
    const total = elections.length;
    const participants = elections.reduce((a, e) => a + (Number(e.participants) || 0), 0);
    const votes = elections.reduce((a, e) => a + (Number(e.votes) || 0), 0);
    const avg = participants > 0 ? ((votes * 100) / participants).toFixed(2) : "0.00";
    const html = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><p class="text-indigo-600 text-sm">Élections</p><p class="text-3xl font-bold text-indigo-800">${total}</p></div>
            <div class="rounded-xl border border-blue-100 bg-blue-50 p-4"><p class="text-blue-600 text-sm">Participants cumulés</p><p class="text-3xl font-bold text-blue-800">${participants}</p></div>
            <div class="rounded-xl border border-amber-100 bg-amber-50 p-4"><p class="text-amber-600 text-sm">Votes cumulés</p><p class="text-3xl font-bold text-amber-800">${votes}</p></div>
            <div class="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p class="text-emerald-600 text-sm">Participation moyenne</p><p class="text-3xl font-bold text-emerald-800">${avg}%</p></div>
        </div>`;
    openActionView("Statistiques détaillées", html);
}

/* ─── Crypto Helpers ─────────────────────────────── */

async function sha256Hex(input) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function xorDecryptElectionKeyAdminPub(adminPubKeyUtf8, encStr) {
    const parts = encStr.trim().split(":");
    if (parts.length !== 2) throw new Error("Enc_k élection illisible");
    const cipherHex = parts[1];
    const buf = new TextEncoder().encode(adminPubKeyUtf8);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const km = new Uint8Array(digest);
    const cbin = forge.util.hexToBytes(cipherHex);
    const cout = new Uint8Array(cbin.length);
    for (let i = 0; i < cbin.length; i++) {
        cout[i] = (cbin.charCodeAt(i) ^ km[i % 32]) & 255;
    }
    let hexOut = "";
    for (let i = 0; i < cout.length; i++) hexOut += cout[i].toString(16).padStart(2, "0");
    return hexOut;
}

function b64ToU8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bufferToHex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToU8(hex) {
    const h = hex.trim().replace(/\s+/g, "");
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < h.length; i += 2) out[i / 2] = parseInt(h.slice(i, i + 2), 16);
    return out;
}

async function importAdminSigningKey(pkcs8B64) {
    return crypto.subtle.importKey("pkcs8", b64ToU8(pkcs8B64), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function signP256Hex(pkcs8B64, message) {
    const key = await importAdminSigningKey(pkcs8B64);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(message));
    return bufferToHex(sig);
}

function serverKemDeriveKey(sharedU8) {
    let bin = "";
    for (let i = 0; i < sharedU8.length; i++) bin += String.fromCharCode(sharedU8[i]);
    const md = forge.md.sha256.create();
    md.update(bin, "raw");
    md.update("|EVOTE-SERVER-KEM-v1", "utf8");
    return forge.util.hexToBytes(md.digest().toHex());
}

async function importP256EcdhPublicRaw(rawHex) {
    let h = rawHex.trim().toLowerCase().replace(/\s+/g, "");
    if (!h.startsWith("04")) h = "04" + h;
    return crypto.subtle.importKey("raw", hexToU8(h), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function wrapElectionKeyForDepServer(serverPubHex, electionPrivHex64) {
    const pubSrv = await importP256EcdhPublicRaw(serverPubHex);
    const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pubSrv }, ephemeral.privateKey, 256));
    const kemKey = serverKemDeriveKey(shared);
    const iv = forge.random.getBytesSync(16);
    const plain = forge.util.hexToBytes(electionPrivHex64);
    const cipher = forge.cipher.createCipher("AES-GCM", kemKey);
    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(plain));
    cipher.finish();
    const ephemPub = bufferToHex(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
    return `EK1|${ephemPub}|${forge.util.bytesToHex(iv)}|${cipher.output.toHex() + cipher.mode.tag.toHex()}`;
}

/* ─── Dépouillement Flow ─────────────────────────── */

async function runDepouillementFlow(electionId) {
    const adminPrivHex = sessionStorage.getItem("admin_private_pkcs8_b64");
    const adminEmail = getAdminEmail();
    if (!adminPrivHex) { showToast(tAdmin("errSessionMissingKey"), "error"); return; }
    if (!adminEmail) { showToast(tAdmin("errSessionMissingEmail"), "error"); return; }

    const ok = await askConfirmation({ title: tAdmin("Publié Résultats"), message: `Lancer le dépouillement pour cet élection ?` });
    if (!ok) return;

    try {
        const r1 = await fetch(`${API_BASE_URL}/api/admin/elections/depouillement/start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ admin_email: adminEmail, election_id: electionId }),
        });
        const j1 = await r1.json();
        if (!r1.ok) { showToast(j1.detail || "Dépouillement refusé.", "error"); return; }

        const kElectionHex = await xorDecryptElectionKeyAdminPub(j1.admin_pubkey_hex, j1.enc_k_election);
        if (!/^[0-9a-fA-F]{64}$/.test(kElectionHex)) { showToast(tAdmin("depInvalidKey"), "error"); return; }

        const wrapped = await wrapElectionKeyForDepServer(j1.server_pubkey_hex, kElectionHex.toLowerCase());

        const r2 = await fetch(`${API_BASE_URL}/api/admin/elections/depouillement/tally-session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ admin_email: adminEmail, election_id: electionId, session_id: j1.session_id, ek_wrapped_for_server: wrapped }),
        });
        const j2 = await r2.json();
        if (!r2.ok) { showToast(j2.detail || "Échec du décompte côté serveur.", "error"); return; }

        const summary = j2.results.tally.map((r) => `${r.nom || r.candidat_id}: ${r.votes}`).join("\n");
        const failN = j2.results.decryption_failures || 0;
        const proceed = await askConfirmation({
            title: tAdmin("CONFIRMATION"),
            message: `Résultats provisoires (${failN} bulletin(s) en échec). ${summary || "Aucune voix comptée."} Publier maintenant ?`,
        });
        if (!proceed) { showToast(tAdmin("depPublishCancelled"), "info"); return; }

        const signature = await signP256Hex(adminPrivHex, j2.canonical_for_signing);

        const r3 = await fetch(`${API_BASE_URL}/api/admin/elections/depouillement/publish`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ admin_email: adminEmail, election_id: electionId, session_id: j1.session_id, signature_der_hex: signature }),
        });
        const j3 = await r3.json();
        if (!r3.ok) { showToast(j3.detail || "Signature refusée ou publication impossible.", "error"); return; }

        showToast(j3.message || "Résultats publiés.", "success");
        await loadDashboardData();
    } catch (e) {
        console.error(e);
        showToast(tAdmin("depTechError"), "error");
    }
}

/* ─── i18n ───────────────────────────────────────── */

const adminI18n = (window.EVOTE_I18N && window.EVOTE_I18N.dictionaries.adminDashboard) || { fr: {}, en: {} };

function getAdminLang() {
    if (window.EVOTE_I18N?.getLanguage) return window.EVOTE_I18N.getLanguage();
    return "fr";
}

function setTextIfPresent(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function tAdmin(key) {
    const lang = getAdminLang();
    const bucket = adminI18n[lang] || adminI18n.fr;
    return bucket[key] || adminI18n.fr[key] || key;
}

function applyAdminLanguage() {
    const lang = getAdminLang();
    const t = adminI18n[lang];
    setTextIfPresent("admin-dashboard-title", t.dashboardTitle);
    setTextIfPresent("admin-language-header-label", t.languageHeaderLabel);
    document.documentElement.lang = lang === "en" ? "en" : "fr";
}

function toggleAdminLanguage() {
    const next = getAdminLang() === "fr" ? "en" : "fr";
    if (window.EVOTE_I18N?.setLanguage) window.EVOTE_I18N.setLanguage(next);
    else localStorage.setItem("evote_lang", next);
    applyAdminLanguage();
}

/* ─── Admin Profile (password / email change) ────── */

function resetAdminPasswordFlow() {
    document.getElementById("admin-pass-step-1")?.classList.remove("hidden");
    document.getElementById("admin-pass-step-2")?.classList.add("hidden");
    document.getElementById("admin-pass-step-3")?.classList.add("hidden");
    const fields = ["admin-password-otp", "admin-new-password", "admin-confirm-password"];
    fields.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
}

function openAdminProfileModal() {
    document.getElementById("admin-profile-name").value = currentAdmin?.nom || "Administrateur";
    document.getElementById("admin-profile-email").value = getAdminEmail() || "-";
    document.getElementById("admin-email-change-panel")?.classList.add("hidden");
    document.getElementById("admin-password-change-panel")?.classList.add("hidden");
    resetAdminPasswordFlow();
    document.getElementById("admin-profile-overlay")?.classList.remove("hidden");
}

function closeAdminProfileModal() {
    document.getElementById("admin-profile-overlay")?.classList.add("hidden");
}

function toggleAdminEmailPanel() {
    document.getElementById("admin-password-change-panel")?.classList.add("hidden");
    document.getElementById("admin-email-change-panel")?.classList.toggle("hidden");
}

function toggleAdminPasswordPanel() {
    document.getElementById("admin-email-change-panel")?.classList.add("hidden");
    document.getElementById("admin-password-change-panel")?.classList.toggle("hidden");
    resetAdminPasswordFlow();
}

async function saveAdminEmailChange() {
    const oldEmail = getAdminEmail();
    const newEmail = (document.getElementById("admin-new-email")?.value || "").trim().toLowerCase();
    const confirmEmail = (document.getElementById("admin-confirm-email")?.value || "").trim().toLowerCase();
    if (!newEmail || !confirmEmail) { showToast(tAdmin("profileFillEmails"), "error"); return; }

    const response = await fetch(`${API_BASE_URL}/api/admin/profile/change-email`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ current_email: oldEmail, new_email: newEmail, confirm_email: confirmEmail }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement email impossible.", "error"); return; }

    currentAdmin.email = data.email || newEmail;
    localStorage.setItem("evote_user", JSON.stringify(currentAdmin));
    sessionStorage.setItem("admin_email", currentAdmin.email);
    localStorage.setItem("admin_email", currentAdmin.email);
    document.getElementById("admin-email-display").textContent = currentAdmin.email;
    document.getElementById("admin-profile-email").value = currentAdmin.email;
    showToast(tAdmin("profileEmailChanged"), "success");
    document.getElementById("admin-email-change-panel")?.classList.add("hidden");
}

async function sendAdminPasswordOtp() {
    const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/request`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: getAdminEmail() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Envoi OTP impossible.", "error"); return; }
    showToast(tAdmin("otpSent"), "success");
    document.getElementById("admin-pass-step-1")?.classList.add("hidden");
    document.getElementById("admin-pass-step-2")?.classList.remove("hidden");
}

async function verifyAdminPasswordOtp() {
    const otp = (document.getElementById("admin-password-otp")?.value || "").trim();
    const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ email: getAdminEmail(), otp }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "OTP invalide", "error"); return; }
    showToast(tAdmin("otpValidated"), "success");
    document.getElementById("admin-pass-step-2")?.classList.add("hidden");
    document.getElementById("admin-pass-step-3")?.classList.remove("hidden");
}

function adminU8ToB64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
}

async function adminDeriveAesWrapKeyFromPassword(password, saltU8) {
    const pwKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltU8, iterations: 100000, hash: "SHA-256" },
        pwKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["wrapKey", "unwrapKey"]
    );
}

async function buildAdminPasswordResetPayload(newPassword, email) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await adminDeriveAesWrapKeyFromPassword(newPassword, salt);
    const wrapped = await crypto.subtle.wrapKey("pkcs8", pair.privateKey, wrapKey, { name: "AES-GCM", iv });
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
    return {
        email,
        cle_publique: "WC_P256." + adminU8ToB64(new Uint8Array(spki)),
        sel: forge.util.encode64(String.fromCharCode(...salt)),
        iv: forge.util.encode64(String.fromCharCode(...iv)),
        enc_k: JSON.stringify({ v: 3, w: adminU8ToB64(new Uint8Array(wrapped)) }),
    };
}

async function saveAdminPasswordChange() {
    const np = document.getElementById("admin-new-password")?.value || "";
    const cp = document.getElementById("admin-confirm-password")?.value || "";
    if (!np || !cp || np !== cp) { showToast(tAdmin("pwdMismatch"), "error"); return; }

    const payload = await buildAdminPasswordResetPayload(np, getAdminEmail());
    const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/confirm`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { showToast(data.detail || "Changement mot de passe impossible.", "error"); return; }

    showToast(tAdmin("pwdChanged"), "success");
    document.getElementById("admin-password-change-panel")?.classList.add("hidden");
    resetAdminPasswordFlow();
}

/* ─── Identity / Session ─────────────────────────── */

function normalizeAdminUser(storedUser) {
    if (!storedUser || typeof storedUser !== "object") return null;
    const fallbackSessionEmail = (sessionStorage.getItem("admin_email") || "").trim().toLowerCase();
    const fallbackLocalEmail = (localStorage.getItem("admin_email") || "").trim().toLowerCase();
    return {
        ...storedUser,
        role: storedUser.role || storedUser.Role || "",
        nom: storedUser.nom || storedUser.Nom || "",
        email: (storedUser.email || storedUser.Email || fallbackSessionEmail || fallbackLocalEmail || "").trim().toLowerCase(),
    };
}

function getAdminEmail() {
    return (currentAdmin?.email || "").trim();
}

function loadAdminIdentity() {
    const storedUser = normalizeAdminUser(JSON.parse(localStorage.getItem("evote_user") || "null"));
    if (!storedUser || storedUser.role !== "admin") {
        window.location.href = "inscription-administrateur.html";
        return;
    }
    currentAdmin = storedUser;
    localStorage.setItem("evote_user", JSON.stringify(currentAdmin));
    if (storedUser.email) {
        sessionStorage.setItem("admin_email", storedUser.email);
        localStorage.setItem("admin_email", storedUser.email);
    }
    document.getElementById("admin-name-display").textContent = storedUser.nom || "Administrateur";
    document.getElementById("admin-email-display").textContent = storedUser.email || "-";
}

/* ─── Election Modal ─────────────────────────────── */

function openCreateElectionModal() {
    document.getElementById("create-election-modal").classList.remove("hidden");
    document.getElementById("create-election-modal").classList.add("flex");
}

function closeCreateElectionModal() {
    document.getElementById("create-election-form").reset();
    document.getElementById("nombre-votes-autorises").value = "1";
    document.getElementById("affichage-complet").checked = true;
    resetCandidateFields();
    const feedback = document.getElementById("create-election-feedback");
    feedback.textContent = "";
    feedback.className = "text-sm font-medium";
    document.getElementById("create-election-modal").classList.add("hidden");
    document.getElementById("create-election-modal").classList.remove("flex");
}

function getCandidatesListContainer() {
    return document.getElementById("candidats-list");
}

function getCandidateNames() {
    const container = getCandidatesListContainer();
    if (!container) return [];
    return Array.from(container.querySelectorAll(".candidat-input"))
        .map((el) => (el.value || "").trim())
        .filter(Boolean);
}

function hasEmptyCandidateField() {
    const container = getCandidatesListContainer();
    if (!container) return false;
    return Array.from(container.querySelectorAll(".candidat-input")).some((el) => !(el.value || "").trim());
}

function addCandidateField(value = "") {
    const container = getCandidatesListContainer();
    if (!container) return;
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    row.innerHTML = `
        <input type="text" class="candidat-input soft-input w-full border border-slate-200 rounded-xl px-4 py-2.5 outline-none" placeholder="Nom complet du candidat" value="${escapeHtml(value)}">
        <button type="button" class="remove-candidat-btn px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">&times;</button>
    `;
    container.appendChild(row);
    row.querySelector(".remove-candidat-btn")?.addEventListener("click", () => row.remove());
}

function resetCandidateFields() {
    const container = getCandidatesListContainer();
    if (container) container.innerHTML = "";
}

function enforceScheduleConstraints() {
    const openDateEl = document.getElementById("date-ouverture");
    const openTimeEl = document.getElementById("temps-ouverture");
    const closeDateEl = document.getElementById("date-cloture");
    const closeTimeEl = document.getElementById("temps-cloture");
    if (!openDateEl || !openTimeEl || !closeDateEl || !closeTimeEl) return;

    const openDate = openDateEl.value;
    const openTime = openTimeEl.value;
    const closeDate = closeDateEl.value;

    if (openDate) {
        closeDateEl.min = openDate;
        if (closeDate && closeDate < openDate) closeDateEl.value = openDate;
    } else {
        closeDateEl.removeAttribute("min");
    }

    if (openDate && closeDateEl.value === openDate && openTime) {
        closeTimeEl.min = openTime;
        if (closeTimeEl.value && closeTimeEl.value < openTime) closeTimeEl.value = openTime;
    } else {
        closeTimeEl.removeAttribute("min");
    }
}

async function submitCreateElection(event) {
    event.preventDefault();
    const feedback = document.getElementById("create-election-feedback");
    const submitBtn = document.getElementById("submit-create-election");
    feedback.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Création...";

    const votesField = parseInt(document.getElementById("nombre-votes-autorises").value, 10);
    const affichageRadio = document.querySelector('input[name="affichage-resultats"]:checked');
    const candidats = getCandidateNames();
    const adminEmail = getAdminEmail();

    if (!adminEmail) {
        feedback.textContent = tAdmin("errSessionMissingEmail");
        feedback.className = "text-sm font-medium text-red-600";
        submitBtn.disabled = false;
        submitBtn.textContent = "Créer l'élection";
        return;
    }

    const openDate = document.getElementById("date-ouverture").value;
    const openTime = document.getElementById("temps-ouverture").value;
    const closeDate = document.getElementById("date-cloture").value;
    const closeTime = document.getElementById("temps-cloture").value;
    const openAt = new Date(`${openDate}T${openTime}:00`);
    const closeAt = new Date(`${closeDate}T${closeTime}:00`);

    const setError = (msg) => {
        feedback.textContent = msg;
        feedback.className = "text-sm font-medium text-red-600";
        submitBtn.disabled = false;
        submitBtn.textContent = "Créer l'élection";
    };

    if (isNaN(openAt) || isNaN(closeAt)) return setError(tAdmin("electionFeedbackInvalidDate"));
    if (closeAt <= openAt) return setError(tAdmin("electionFeedbackCloseAfterOpen"));
    if (!candidats.length) return setError(tAdmin("electionFeedbackNeedCandidate"));
    if (hasEmptyCandidateField()) return setError(tAdmin("electionFeedbackEmptyCandidateField"));

    const payload = {
        admin_email: adminEmail,
        titre: document.getElementById("election-titre").value.trim(),
        date_ouverture: openDate,
        temps_ouverture: openTime,
        date_cloture: closeDate,
        temps_cloture: closeTime,
        candidats,
        nombre_votes_autorises: Number.isFinite(votesField) && votesField >= 1 ? votesField : 1,
        affichage_resultats: affichageRadio ? affichageRadio.value : "complet",
    };

    try {
        const privateKeyHex = sessionStorage.getItem("admin_private_pkcs8_b64");
        if (!privateKeyHex) return setError(tAdmin("errSessionIncomplete"));

        const prepareResponse = await fetch(`${API_BASE_URL}/api/admin/elections/prepare`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify(payload),
        });
        const prepareData = await prepareResponse.json();
        if (!prepareResponse.ok) return setError(prepareData.detail || "Préparation impossible.");

        const signature = await signP256Hex(privateKeyHex, `${prepareData.h_p}||${prepareData.q_election}`);

        const confirmResponse = await fetch(`${API_BASE_URL}/api/admin/elections/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ session_id: prepareData.session_id, signature }),
        });
        const confirmData = await confirmResponse.json();
        if (!confirmResponse.ok) return setError(confirmData.detail || "Création impossible.");

        feedback.textContent = confirmData.message || "Élection créée avec succès.";
        feedback.className = "text-sm font-medium text-green-600";
        await loadDashboardData();
        setTimeout(closeCreateElectionModal, 1200);
    } catch (error) {
        setError(tAdmin("electionFeedbackServerError"));
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Créer l'élection";
    }
}

/* ─── Dashboard Rendering ────────────────────────── */

function statusBadge(status) {
    if (status === "Active") return "bg-emerald-100 text-emerald-700";
    if (status === "Planifiée") return "bg-indigo-100 text-indigo-700";
    return "bg-slate-200 text-slate-700";
}

function toDate(datePart, timePart) {
    return new Date(`${datePart}T${timePart}:00`);
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}j ${hours}h ${minutes}min`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes} min`;
}

function buildTimeline(election) {
    const now = new Date();
    const openAt = toDate(election.date_ouverture, election.temps_ouverture);
    const closeAt = toDate(election.date_cloture, election.temps_cloture);
    const total = Math.max(1, closeAt - openAt);

    if (now < openAt) return { label: `Ouverture dans ${formatDuration(openAt - now)}`, progress: 0 };
    if (now >= closeAt) return { label: "Élection clôturée", progress: 100 };

    const elapsed = now - openAt;
    return { label: `${formatDuration(closeAt - now)} restants`, progress: Math.min(100, Math.max(0, (elapsed / total) * 100)) };
}

function renderDashboard(data) {
    const list = document.getElementById("elections-list");
    list.innerHTML = "";

    if (!data.elections.length) {
        list.innerHTML = '<div class="xl:col-span-2 p-8 rounded-2xl border border-slate-200 bg-white text-slate-400 text-center card-shadow">Aucune élection créée pour le moment.</div>';
        return;
    }

    data.elections.forEach((election) => {
        const timeline = buildTimeline(election);
        const card = document.createElement("div");
        card.className = "bg-white p-7 rounded-3xl border border-slate-100 card-shadow";
        card.innerHTML = `
            <div class="flex justify-between items-start mb-5">
                <div><h4 class="font-bold text-slate-800 text-lg">${escapeHtml(election.titre)}</h4></div>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${statusBadge(election.status)}">${escapeHtml(election.status)}</span>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm mb-5">
                <div class="bg-slate-50 rounded-xl p-3"><p class="text-slate-500">Ouverture</p><p class="font-semibold text-slate-800">${escapeHtml(election.date_ouverture)} ${escapeHtml(election.temps_ouverture)}</p></div>
                <div class="bg-slate-50 rounded-xl p-3"><p class="text-slate-500">Clôture</p><p class="font-semibold text-slate-800">${escapeHtml(election.date_cloture)} ${escapeHtml(election.temps_cloture)}</p></div>
            </div>
            <div class="flex flex-wrap gap-2 mb-4">
                <span class="text-xs font-semibold px-3 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-100">${election.nombre_votes_autorises ?? 1} vote(s) autorisé(s) / électeur</span>
                <span class="text-xs font-semibold px-3 py-1 rounded-full bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-100">Résultats : ${escapeHtml(election.affichage_resultats_label || "Complet")}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div class="bg-indigo-50 rounded-xl p-3"><p class="text-indigo-600">Candidats</p><p class="font-bold text-indigo-800 text-lg">${election.candidats}</p></div>
                <div class="bg-blue-50 rounded-xl p-3"><p class="text-blue-600">Participants</p><p class="font-bold text-blue-800 text-lg">${election.participants}</p></div>
                <div class="bg-amber-50 rounded-xl p-3"><p class="text-amber-600">Votes</p><p class="font-bold text-amber-800 text-lg">${election.votes}</p></div>
                <div class="bg-emerald-50 rounded-xl p-3"><p class="text-emerald-600">Participation</p><p class="font-bold text-emerald-800 text-lg">${election.turnout_rate}%</p></div>
            </div>
            <div class="mt-5">
                <div class="flex justify-between items-center text-xs mb-2">
                    <p class="text-slate-500 font-semibold">Timeline</p>
                    <p class="text-slate-600 font-semibold">${timeline.label}</p>
                </div>
                <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full" style="width:${timeline.progress}%"></div>
                </div>
            </div>
            ${election.status === "Clôturée" && !election.results_published ? `
                <div class="mt-4 pt-4 border-t border-slate-100">
                    <button type="button" class="dep-launch-btn w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-slate-800 to-indigo-900 hover:opacity-95 shadow-lg" data-eid="${election.id}">
                        Dépouiller
                    </button>
                </div>` : ""}
            ${election.results_published ? `
                <div class="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                    <span class="rounded-full px-3 py-1 bg-emerald-50 border border-emerald-100">Résultats publiés</span>
                    <button type="button" class="see-results-btn px-3 py-1 rounded-lg text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-eid="${election.id}">Voir résultats</button>
                </div>` : ""}
        `;
        list.appendChild(card);
    });

    document.querySelectorAll(".dep-launch-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.dataset.eid, 10);
            if (Number.isFinite(id)) runDepouillementFlow(id);
        });
    });
    document.querySelectorAll(".see-results-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.dataset.eid, 10);
            if (Number.isFinite(id)) openElectionResultsView(id);
        });
    });
}

/* ─── Data Loaders ───────────────────────────────── */

async function loadDashboardData() {
    const feedback = document.getElementById("dashboard-feedback");
    feedback.textContent = tAdmin("dashboardLoading");
    feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/25 text-white";

    try {
        const adminEmail = getAdminEmail();
        if (!adminEmail) {
            feedback.textContent = tAdmin("dashboardInvalidSession");
            feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700";
            return;
        }
        const response = await fetch(`${API_BASE_URL}/api/admin/elections/dashboard?admin_email=${encodeURIComponent(adminEmail)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json();
        if (!response.ok) {
            feedback.textContent = data.detail || "Impossible de charger les statistiques.";
            feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700";
            return;
        }
        lastDashboardData = data;
        renderDashboard(data);
        feedback.textContent = `Dernière mise à jour réussie (${new Date().toLocaleTimeString()})`;
        feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-100 text-emerald-700";
    } catch (error) {
        feedback.textContent = tAdmin("dashboardServerError");
        feedback.className = "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-100 text-red-700";
    }
}

async function loadPendingRequests() {
    const container = document.getElementById("pending-requests-list");
    container.innerHTML = '<p class="text-sm text-slate-400">Chargement...</p>';

    try {
        const adminEmail = getAdminEmail();
        if (!adminEmail) {
            container.innerHTML = '<p class="text-sm text-red-600">Session administrateur invalide. Reconnectez-vous.</p>';
            return;
        }
        const response = await fetch(`${API_BASE_URL}/api/admin/participations/pending?admin_email=${encodeURIComponent(adminEmail)}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
        });
        const data = await response.json();
        if (!response.ok) {
            container.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(data.detail || "Impossible de charger les demandes.")}</p>`;
            return;
        }
        if (!data.pending.length) {
            container.innerHTML = '<p class="text-sm text-slate-400">Aucune demande en attente.</p>';
            return;
        }
        container.innerHTML = "";
        data.pending.forEach((item) => {
            const card = document.createElement("div");
            card.className = "rounded-xl border border-slate-200 p-3 bg-slate-50";
            card.innerHTML = `
                <p class="text-sm font-semibold text-slate-800">${escapeHtml(item.elector_nom)}</p>
                <p class="text-xs text-slate-500">${escapeHtml(item.elector_email)}</p>
                <p class="text-xs text-slate-600 mt-1">Élection: <span class="font-semibold">${escapeHtml(item.election_titre)}</span></p>
                <div class="flex gap-2 mt-3">
                    <button data-id="${item.participation_id}" data-decision="accept" class="decision-btn flex-1 bg-emerald-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-emerald-700">Accepter</button>
                    <button data-id="${item.participation_id}" data-decision="refuse" class="decision-btn flex-1 bg-red-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-red-700">Refuser</button>
                </div>
            `;
            container.appendChild(card);
        });
        document.querySelectorAll(".decision-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                await handleParticipationDecision(btn.dataset.id, btn.dataset.decision);
            });
        });
    } catch (error) {
        container.innerHTML = '<p class="text-sm text-red-600">Erreur de connexion serveur.</p>';
    }
}

async function handleParticipationDecision(participationId, decision) {
    try {
        const adminEmail = getAdminEmail();
        if (!adminEmail) { showToast(tAdmin("actionInvalidSession"), "error"); return; }
        const response = await fetch(`${API_BASE_URL}/api/admin/participations/${participationId}/decision`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ admin_email: adminEmail, decision }),
        });
        const data = await response.json();
        if (!response.ok) { showToast(data.detail || "Action impossible.", "error"); return; }
        showToast(data.message || "Décision enregistrée.", "success");
        await loadPendingRequests();
        await loadDashboardData();
    } catch (error) {
        showToast(tAdmin("actionServerError"), "error");
    }
}

/* ─── Event Bindings ─────────────────────────────── */

bindIfPresent("open-create-election-modal", "click", openCreateElectionModal);
bindIfPresent("admin-open-profile", "click", openAdminProfile);
bindIfPresent("admin-profile-close", "click", closeAdminProfile);
bindIfPresent("admin-language-toggle-header", "click", toggleAdminLanguage);
bindIfPresent("quick-create-election", "click", openCreateElectionModal);
bindIfPresent("close-create-election-modal", "click", closeCreateElectionModal);
bindIfPresent("cancel-create-election", "click", closeCreateElectionModal);
bindIfPresent("create-election-form", "submit", submitCreateElection);
bindIfPresent("add-candidat-btn", "click", () => addCandidateField());
bindIfPresent("quick-manage-electors", "click", openElectorsManagementView);
bindIfPresent("quick-manage-candidates", "click", openCandidatesView);
bindIfPresent("quick-stats", "click", openStatsView);
bindIfPresent("quick-results", "click", openQuickResultsView);
bindIfPresent("action-view-close", "click", closeActionView);
bindIfPresent("date-ouverture", "change", enforceScheduleConstraints);
bindIfPresent("temps-ouverture", "change", enforceScheduleConstraints);
bindIfPresent("date-cloture", "change", enforceScheduleConstraints);

// Close profile overlay on backdrop click
document.getElementById("admin-profile-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "admin-profile-overlay") closeAdminProfile();
});

/* ─── Init ───────────────────────────────────────── */

resetCandidateFields();
enforceScheduleConstraints();
applyAdminLanguage();
loadAdminIdentity();
loadDashboardData();
loadPendingRequests();

setInterval(() => {
    loadDashboardData();
    loadPendingRequests();
}, 60000);